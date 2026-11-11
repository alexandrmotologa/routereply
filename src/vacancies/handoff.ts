import crypto from "node:crypto";
import type { StorageEngine } from "../core/db.js";
import type { Vacancy, ReplyTask, CandidateProfile } from "../core/types.js";
import { computeContextHash } from "../replies/context.js";

export interface HandoffResult {
  vacancyId: string;
  replyTaskId: string;
  isNew: boolean;
}

export class HandoffService {
  constructor(private storage: StorageEngine) {}

  public executeHandoff(
    vacancy: Vacancy,
    assignedProfile: CandidateProfile,
    rawText: string
  ): HandoffResult {
    // 1. Persist Vacancy (idempotent, returns false if already exists)
    this.storage.insertVacancy(vacancy);

    // 2. Check if ReplyTask already exists for this vacancy
    const existingTask = this.storage.getReplyTaskByVacancy(vacancy.id);
    if (existingTask) {
      return {
        vacancyId: vacancy.id,
        replyTaskId: existingTask.id,
        isNew: false
      };
    }

    // 3. Compute initial deterministic context hash
    const initialHash = computeContextHash({
      publicationText: rawText,
      candidateProfileId: assignedProfile.id,
      candidateProfileVersion: assignedProfile.version,
      conversationHistory: []
    });

    // 4. Create new ReplyTask in PENDING state
    const replyTaskId = `task_${vacancy.id}`;
    const newTask: ReplyTask = {
      id: replyTaskId,
      vacancyId: vacancy.id,
      candidateProfileId: assignedProfile.id,
      contextHash: initialHash,
      draftStatus: "PENDING"
    };

    this.storage.upsertReplyTask(newTask);

    return {
      vacancyId: vacancy.id,
      replyTaskId,
      isNew: true
    };
  }
}
