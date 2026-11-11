import type { StorageEngine } from "../core/db.js";
import type { ReplyTask } from "../core/types.js";
import { computeContextHash } from "./context.js";

export interface FreshnessCheckResult {
  isFresh: boolean;
  currentHash: string;
  taskHash: string;
  reason?: string;
}

export class FreshnessGuard {
  constructor(private storage: StorageEngine) {}

  /**
   * Evaluates whether a draft task remains fresh against current publications,
   * candidate profiles, and conversation history.
   */
  public evaluateFreshness(task: ReplyTask): FreshnessCheckResult {
    const vacancy = this.storage.getVacancy(task.vacancyId);
    if (!vacancy) {
      return {
        isFresh: false,
        currentHash: "",
        taskHash: task.contextHash,
        reason: "Originating vacancy record no longer exists."
      };
    }

    const publication = this.storage.getPublication(vacancy.publicationId);
    if (!publication) {
      return {
        isFresh: false,
        currentHash: "",
        taskHash: task.contextHash,
        reason: "Originating publication record no longer exists."
      };
    }

    const profile = this.storage.getProfile(task.candidateProfileId);
    if (!profile) {
      return {
        isFresh: false,
        currentHash: "",
        taskHash: task.contextHash,
        reason: `Associated candidate profile '${task.candidateProfileId}' no longer exists.`
      };
    }

    // Fetch conversation history for this recipient
    const history = this.storage.getConversationHistory(vacancy.extractedContact);

    // Compute live current context hash
    const currentHash = computeContextHash({
      publicationText: publication.rawText,
      candidateProfileId: profile.id,
      candidateProfileVersion: profile.version,
      conversationHistory: history
    });

    if (currentHash !== task.contextHash) {
      let reason = "Context evidence has changed since draft was prepared.";
      if (history.length > 0) {
        reason = `New conversation messages detected (${history.length} messages in thread). Draft is stale.`;
      } else if (profile.version > 1) {
        reason = `Candidate profile facts have been updated to version ${profile.version}. Draft is stale.`;
      }

      // Mark task as STALE in the database
      if (task.draftStatus !== "STALE") {
        this.storage.upsertReplyTask({
          ...task,
          draftStatus: "STALE",
          staleReason: reason
        });
      }

      return {
        isFresh: false,
        currentHash,
        taskHash: task.contextHash,
        reason
      };
    }

    return {
      isFresh: true,
      currentHash,
      taskHash: task.contextHash
    };
  }
}
