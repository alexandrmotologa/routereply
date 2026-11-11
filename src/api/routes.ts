import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { StorageEngine } from "../core/db.js";
import { IngestionController } from "../vacancies/ingest.js";
import { TelegramDispatcher } from "../dispatcher/sender.js";
import { DispatchRateLimiter } from "../dispatcher/rate-limiter.js";
import { FreshnessGuard } from "../replies/freshness.js";
import { DraftGenerator } from "../replies/drafter.js";

export function registerRoutes(
  app: FastifyInstance,
  storage: StorageEngine,
  rateLimiter: DispatchRateLimiter,
  dispatcher: TelegramDispatcher
): void {
  const ingestionController = new IngestionController(storage);
  const freshnessGuard = new FreshnessGuard(storage);
  const draftGenerator = new DraftGenerator();

  // 1. Health & Safety Gauges
  app.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      rateLimiter: rateLimiter.getStatus()
    };
  });

  // 2. Active Channels
  app.get("/api/channels", async () => {
    return storage.getActiveChannels();
  });

  // 3. Trigger Bounded Run
  app.post("/api/runs/execute", async (req: FastifyRequest<{ Body: { sinceHours?: number; maxItemsPerChannel?: number } }>) => {
    const { sinceHours = 24, maxItemsPerChannel = 50 } = req.body || {};
    const summary = await ingestionController.executeBoundedRun({
      sinceHours,
      maxItemsPerChannel
    });
    return summary;
  });

  // 4. Step-by-Step Explainable Filter Runs
  app.get("/api/filter-runs/:publicationId", async (req: FastifyRequest<{ Params: { publicationId: string } }>) => {
    return storage.getFilterRunsForPublication(req.params.publicationId);
  });

  // 5. Operator Review Queue
  app.get("/api/queue", async () => {
    const queue = storage.listReviewQueue();
    // Evaluate live freshness for each item in queue
    return queue.map((item) => {
      const freshness = freshnessGuard.evaluateFreshness(item);
      return {
        ...item,
        isFresh: freshness.isFresh,
        freshnessReason: freshness.reason
      };
    });
  });

  // 6. Update Draft or Switch Persona
  app.post(
    "/api/tasks/:taskId/update-draft",
    async (
      req: FastifyRequest<{
        Params: { taskId: string };
        Body: { draftText?: string; candidateProfileId?: string; operatorNotes?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { taskId } = req.params;
      const { draftText, candidateProfileId, operatorNotes } = req.body || {};

      const task = storage.getReplyTask(taskId);
      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      let updatedText = draftText ?? task.draftText;
      let targetProfileId = candidateProfileId ?? task.candidateProfileId;

      // If switching candidate profile persona, regenerate draft
      if (candidateProfileId && candidateProfileId !== task.candidateProfileId) {
        const vacancy = storage.getVacancy(task.vacancyId);
        const newProfile = storage.getProfile(candidateProfileId);
        if (vacancy && newProfile) {
          const gen = await draftGenerator.generateDraft({
            vacancy,
            profile: newProfile,
            rawText: "",
            conversationHistory: []
          });
          updatedText = gen.draftText;
        }
      }

      storage.upsertReplyTask({
        ...task,
        candidateProfileId: targetProfileId,
        draftText: updatedText,
        operatorNotes: operatorNotes ?? task.operatorNotes,
        draftStatus: "DRAFTED",
        staleReason: null
      });

      return storage.getReplyTask(taskId);
    }
  );

  // 7. Operator Rejection
  app.post("/api/tasks/:taskId/reject", async (req: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const task = storage.getReplyTask(req.params.taskId);
    if (!task) return reply.status(404).send({ error: "Task not found" });

    storage.upsertReplyTask({
      ...task,
      draftStatus: "REJECTED",
      reviewedAt: new Date().toISOString()
    });

    return { status: "rejected", taskId: task.id };
  });

  // 8. Human-Gated Manual Dispatch
  app.post("/api/tasks/:taskId/dispatch", async (req: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    try {
      const result = await dispatcher.executeManualDispatch(req.params.taskId);
      if (!result.success) {
        return reply.status(400).send({ error: result.errorMessage });
      }
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 9. Synchronized Conversation History
  app.get("/api/conversations/:contact", async (req: FastifyRequest<{ Params: { contact: string } }>) => {
    return storage.getConversationHistory(req.params.contact);
  });

  // 10. Filter Rules API
  app.get("/api/rules", async () => {
    return {
      keywords: storage.getFilterRules("keyword"),
      exclusions: storage.getFilterRules("exclusion")
    };
  });

  app.post("/api/rules/add", async (req: FastifyRequest<{ Body: { type: "keyword" | "exclusion"; pattern: string } }>, reply) => {
    const { type, pattern } = req.body || {};
    if (!type || !pattern) return reply.status(400).send({ error: "Missing type or pattern" });
    storage.addFilterRule(type, pattern);
    return { status: "added", type, pattern };
  });

  app.post("/api/rules/remove", async (req: FastifyRequest<{ Body: { type: "keyword" | "exclusion"; pattern: string } }>, reply) => {
    const { type, pattern } = req.body || {};
    if (!type || !pattern) return reply.status(400).send({ error: "Missing type or pattern" });
    storage.removeFilterRule(type, pattern);
    return { status: "removed", type, pattern };
  });

  // 11. Candidate Profiles Management
  app.get("/api/profiles", async () => {
    return storage.getAllProfiles();
  });

  app.post("/api/profiles/upsert", async (req: FastifyRequest<{ Body: any }>, reply) => {
    const profile = req.body;
    if (!profile || !profile.id || !profile.name) {
      return reply.status(400).send({ error: "Missing required profile fields (id, name)" });
    }
    storage.upsertProfile({
      id: profile.id,
      name: profile.name,
      summary: profile.summary || "",
      skills: Array.isArray(profile.skills) ? profile.skills : [],
      portfolioLinks: profile.portfolioLinks || {},
      workExperienceFacts: Array.isArray(profile.workExperienceFacts) ? profile.workExperienceFacts : [],
      isDefault: Boolean(profile.isDefault),
      version: profile.version || 1
    });
    return { status: "saved", profile: storage.getProfile(profile.id) };
  });

  app.delete("/api/profiles/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const success = storage.deleteProfile(req.params.id);
    if (!success) return reply.status(404).send({ error: "Profile not found" });
    return { status: "deleted", id: req.params.id };
  });

  app.post("/api/tasks/:taskId/regenerate", async (req: FastifyRequest<{ Params: { taskId: string }; Body: { provider?: "gemini" | "ollama" | "deterministic" } }>, reply) => {
    const task = storage.getReplyTask(req.params.taskId);
    if (!task) return reply.status(404).send({ error: "Task not found" });

    const vacancy = storage.getVacancy(task.vacancyId);
    const publication = storage.getPublication(vacancy?.publicationId || "");
    const profile = storage.getProfile(task.candidateProfileId);

    if (!vacancy || !publication || !profile) {
      return reply.status(400).send({ error: "Incomplete context" });
    }

    const { computeContextHash } = await import("../replies/context.js");
    const history = storage.getConversationHistory(vacancy.extractedContact);

    const result = await draftGenerator.generateDraft({
      vacancy,
      profile,
      rawText: publication.rawText,
      conversationHistory: history,
      preferredProvider: req.body?.provider
    });

    const newHash = computeContextHash({
      publicationText: publication.rawText,
      candidateProfileId: profile.id,
      candidateProfileVersion: profile.version,
      conversationHistory: history
    });

    storage.upsertReplyTask({
      ...task,
      draftText: result.draftText,
      contextHash: newHash,
      draftStatus: "DRAFTED",
      staleReason: null
    });

    return {
      task: storage.getReplyTask(task.id),
      providerUsed: result.providerUsed,
      wordCount: result.wordCount
    };
  });
}
