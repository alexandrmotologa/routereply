import { describe, it, expect, beforeEach } from "vitest";
import { StorageEngine } from "../src/core/db.js";
import { FreshnessGuard } from "../src/replies/freshness.js";
import { TelegramDispatcher } from "../src/dispatcher/sender.js";
import { HandoffService } from "../src/vacancies/handoff.js";
import type { Vacancy, CandidateProfile, Publication } from "../src/core/types.js";

describe("Freshness & Stale-Draft Protection Invariant", () => {
  let storage: StorageEngine;
  let freshnessGuard: FreshnessGuard;
  let dispatcher: TelegramDispatcher;
  let handoffService: HandoffService;

  let profile: CandidateProfile;
  let vacancy: Vacancy;
  let pub: Publication;

  beforeEach(() => {
    storage = new StorageEngine(":memory:");
    storage.upsertChannel({
      id: "ch_test",
      title: "Test Channel",
      channelType: "channel",
      isActive: true,
      lastScannedMsgId: 0
    });
    freshnessGuard = new FreshnessGuard(storage);
    dispatcher = new TelegramDispatcher(storage);
    handoffService = new HandoffService(storage);

    profile = {
      id: "prof_ai",
      name: "Fullstack AI Engineer",
      summary: "Expert in TypeScript and Python.",
      skills: ["TypeScript", "Python"],
      portfolioLinks: { github: "https://github.com/alexandrmotologa" },
      workExperienceFacts: ["Built low latency memory engine"],
      isDefault: true,
      version: 1
    };
    storage.upsertProfile(profile);

    pub = {
      id: "pub_100",
      channelId: "ch_test",
      messageId: 100,
      rawText: "Need Senior TS dev. $80/hr. Contact @recruiter_bob",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_100",
      status: "ACCEPTED"
    };
    storage.insertPublication(pub);

    vacancy = {
      id: "vac_100",
      publicationId: pub.id,
      roleTitle: "Senior TypeScript Developer",
      extractedContact: "@recruiter_bob",
      contactType: "telegram_user",
      detectedStack: ["TypeScript"],
      tags: ["remote"],
      budgetInfo: "$80/hr"
    };
  });

  it("should mark task as fresh upon initial creation with draft", () => {
    const handoff = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    const task = storage.getReplyTask(handoff.replyTaskId)!;
    task.draftText = "Hi, saw your post. I specialize in TypeScript.";
    storage.upsertReplyTask(task);

    const freshness = freshnessGuard.evaluateFreshness(task);
    expect(freshness.isFresh).toBe(true);
  });

  it("should mark draft as STALE when profile version increments", () => {
    const handoff = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    const task = storage.getReplyTask(handoff.replyTaskId)!;

    // Mutate candidate profile facts (triggers version increment to 2)
    storage.upsertProfile({
      ...profile,
      summary: "Updated summary with new AI achievements"
    });

    const freshness = freshnessGuard.evaluateFreshness(task);
    expect(freshness.isFresh).toBe(false);
    expect(freshness.reason).toContain("Candidate profile facts have been updated");

    const updatedTask = storage.getReplyTask(task.id)!;
    expect(updatedTask.draftStatus).toBe("STALE");
  });

  it("should mark draft as STALE when a new inbound message is received", () => {
    const handoff = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    const task = storage.getReplyTask(handoff.replyTaskId)!;

    // Simulate recruiter sending a message before draft is authorized
    storage.recordConversationMessage({
      id: "msg_inbound_1",
      conversationId: vacancy.extractedContact,
      senderType: "INBOUND_RECRUITER",
      tgMessageId: 888123,
      messageText: "Are you still available for contract work?",
      receivedAt: new Date().toISOString()
    });

    const freshness = freshnessGuard.evaluateFreshness(task);
    expect(freshness.isFresh).toBe(false);
    expect(freshness.reason).toContain("New conversation messages detected");
  });

  it("should block dispatch execution if task is stale", async () => {
    const handoff = handoffService.executeHandoff(vacancy, profile, pub.rawText);
    const task = storage.getReplyTask(handoff.replyTaskId)!;
    task.draftText = "Hi, saw your post. I specialize in TypeScript.";
    storage.upsertReplyTask(task);

    // Invalidate via incoming message
    storage.recordConversationMessage({
      id: "msg_inbound_2",
      conversationId: vacancy.extractedContact,
      senderType: "INBOUND_RECRUITER",
      tgMessageId: 999123,
      messageText: "Position filled, thank you.",
      receivedAt: new Date().toISOString()
    });

    const result = await dispatcher.executeManualDispatch(task.id);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("Cannot dispatch: Draft is STALE");
  });
});
