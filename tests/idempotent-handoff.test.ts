import { describe, it, expect, beforeEach } from "vitest";
import { StorageEngine } from "../src/core/db.js";
import { HandoffService } from "../src/vacancies/handoff.js";
import type { Vacancy, CandidateProfile, Publication } from "../src/core/types.js";

describe("Idempotent Handoff Service", () => {
  let storage: StorageEngine;
  let handoffService: HandoffService;
  let profile: CandidateProfile;
  let vacancy: Vacancy;
  let pub: Publication;

  beforeEach(() => {
    storage = new StorageEngine(":memory:");
    storage.upsertChannel({
      id: "ch_1",
      title: "Test Channel",
      channelType: "channel",
      isActive: true,
      lastScannedMsgId: 0
    });
    handoffService = new HandoffService(storage);

    profile = {
      id: "prof_ai",
      name: "Fullstack AI Engineer",
      summary: "Expert in TypeScript.",
      skills: ["TypeScript"],
      portfolioLinks: {},
      workExperienceFacts: [],
      isDefault: true,
      version: 1
    };
    storage.upsertProfile(profile);

    pub = {
      id: "pub_idem_1",
      channelId: "ch_1",
      messageId: 50,
      rawText: "Need TypeScript dev. Contact @lead",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_idem_1",
      status: "ACCEPTED"
    };
    storage.insertPublication(pub);

    vacancy = {
      id: "vac_idem_1",
      publicationId: pub.id,
      roleTitle: "TypeScript Engineer",
      extractedContact: "@lead",
      contactType: "telegram_user",
      detectedStack: ["TypeScript"],
      tags: []
    };
  });

  it("should create new task on initial handoff", () => {
    const result = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    expect(result.isNew).toBe(true);
    expect(result.replyTaskId).toBe("task_vac_idem_1");

    const task = storage.getReplyTask(result.replyTaskId);
    expect(task).toBeDefined();
    expect(task?.draftStatus).toBe("PENDING");
  });

  it("should not create duplicate task on repeated handoff", () => {
    const res1 = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    expect(res1.isNew).toBe(true);

    const res2 = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    expect(res2.isNew).toBe(false);
    expect(res2.replyTaskId).toBe(res1.replyTaskId);

    const queue = storage.listReviewQueue();
    expect(queue.length).toBe(1);
  });
});
