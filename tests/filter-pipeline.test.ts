import { describe, it, expect, beforeEach } from "vitest";
import { StorageEngine } from "../src/core/db.js";
import { FilterPipeline } from "../src/vacancies/filters/pipeline.js";
import type { Publication, CandidateProfile } from "../src/core/types.js";

describe("FilterPipeline - 5-Stage Explainable Funnel", () => {
  let storage: StorageEngine;
  let pipeline: FilterPipeline;
  let profiles: CandidateProfile[];

  beforeEach(() => {
    storage = new StorageEngine(":memory:");
    storage.upsertChannel({
      id: "ch_1",
      title: "Test Dev Channel",
      channelType: "channel",
      isActive: true,
      lastScannedMsgId: 0
    });
    pipeline = new FilterPipeline(storage);
    profiles = [
      {
        id: "prof_ai",
        name: "Fullstack AI Engineer",
        summary: "Expert in TypeScript and Python AI pipelines.",
        skills: ["TypeScript", "Python", "FastAPI", "Next.js"],
        portfolioLinks: { github: "https://github.com/alexandrmotologa" },
        workExperienceFacts: ["Built low latency memory engine"],
        isDefault: true,
        version: 1
      }
    ];
  });

  it("should accept valid tech publication with contact handle", () => {
    const pub: Publication = {
      id: "pub_valid_1",
      channelId: "ch_1",
      messageId: 1,
      rawText: "Looking for Senior Fullstack Engineer (TypeScript, Next.js, Python, FastAPI). Remote $70/hr. Contact @tech_lead_dm",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_valid_1",
      status: "INGESTED"
    };
    storage.insertPublication(pub);

    const result = pipeline.processPublication(pub, profiles);
    expect(result.passed).toBe(true);
    expect(result.vacancy).toBeDefined();
    expect(result.vacancy?.extractedContact).toBe("@tech_lead_dm");
    expect(result.vacancy?.detectedStack).toContain("TypeScript");
    expect(result.auditTrail.length).toBe(5);
  });

  it("should discard messages below minimum length (< 60 chars)", () => {
    const pub: Publication = {
      id: "pub_short",
      channelId: "ch_1",
      messageId: 2,
      rawText: "Dev needed DM me @guy",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_short",
      status: "INGESTED"
    };
    storage.insertPublication(pub);

    const result = pipeline.processPublication(pub, profiles);
    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe("sanitization_and_length");
  });

  it("should discard non-technical publications lacking sufficient keywords", () => {
    const pub: Publication = {
      id: "pub_non_tech",
      channelId: "ch_1",
      messageId: 3,
      rawText: "Hiring Senior Accountant and Finance Auditor for European enterprise. Must know GAAP. Contact @finance_hr",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_non_tech",
      status: "INGESTED"
    };
    storage.insertPublication(pub);

    const result = pipeline.processPublication(pub, profiles);
    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe("role_and_domain_keywords");
  });

  it("should discard publications containing exclusion keywords (unpaid)", () => {
    const pub: Publication = {
      id: "pub_unpaid",
      channelId: "ch_1",
      messageId: 4,
      rawText: "Python developer needed for an unpaid internship. Great learning opportunity. Contact @mentor_lead",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_unpaid",
      status: "INGESTED"
    };
    storage.insertPublication(pub);

    const result = pipeline.processPublication(pub, profiles);
    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe("exclusion_and_negatives");
  });

  it("should discard publications with zero actionable contact method", () => {
    const pub: Publication = {
      id: "pub_no_contact",
      channelId: "ch_1",
      messageId: 5,
      rawText: "Senior Node.js and TypeScript developer wanted for cloud microservices. Great compensation. Remote worldwide.",
      publishedAt: new Date().toISOString(),
      fingerprint: "fp_no_contact",
      status: "INGESTED"
    };
    storage.insertPublication(pub);

    const result = pipeline.processPublication(pub, profiles);
    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe("contact_resolution");
  });
});
