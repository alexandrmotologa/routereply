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
}
