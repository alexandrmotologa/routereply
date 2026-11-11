import crypto from "node:crypto";
import type { StorageEngine } from "../../core/db.js";
import type { Publication, Vacancy, CandidateProfile, FilterRun } from "../../core/types.js";
import { evaluateSanitization } from "./stage1-sanitization.js";
import { evaluateKeywords } from "./stage2-keywords.js";
import { evaluateExclusions } from "./stage3-exclusions.js";
import { evaluateContactResolution } from "./stage4-contacts.js";
import { evaluateTagger } from "./stage5-tagger.js";

export interface PipelineExecutionResult {
  publicationId: string;
  passed: boolean;
  failedStage?: string;
  failureReason?: string;
  auditTrail: FilterRun[];
  vacancy?: Vacancy;
  assignedProfileId?: string;
}

export class FilterPipeline {
  constructor(private storage: StorageEngine) {}

  public processPublication(
    pub: Publication,
    profiles: CandidateProfile[]
  ): PipelineExecutionResult {
    const auditTrail: FilterRun[] = [];

    // Stage 1: Sanitization & Length
    const s1 = evaluateSanitization(pub);
    const run1: FilterRun = {
      id: crypto.randomUUID(),
      publicationId: pub.id,
      stageIndex: 1,
      stageName: "sanitization_and_length",
      passed: s1.passed,
      reason: s1.reason
    };
    this.storage.recordFilterRun(run1);
    auditTrail.push(run1);
    if (!s1.passed) {
      this.storage.updatePublicationStatus(pub.id, "DISCARDED");
      return {
        publicationId: pub.id,
        passed: false,
        failedStage: "sanitization_and_length",
        failureReason: s1.reason,
        auditTrail
      };
    }

    // Stage 2: Keywords (using dynamic rules from SQLite)
    const keywords = this.storage.getFilterRules("keyword");
    const s2 = evaluateKeywords(pub, keywords.length > 0 ? keywords : undefined);
    const run2: FilterRun = {
      id: crypto.randomUUID(),
      publicationId: pub.id,
      stageIndex: 2,
      stageName: "role_and_domain_keywords",
      passed: s2.passed,
      reason: s2.reason
    };
    this.storage.recordFilterRun(run2);
    auditTrail.push(run2);
    if (!s2.passed) {
      this.storage.updatePublicationStatus(pub.id, "DISCARDED");
      return {
        publicationId: pub.id,
        passed: false,
        failedStage: "role_and_domain_keywords",
        failureReason: s2.reason,
        auditTrail
      };
    }

    // Stage 3: Exclusions (using dynamic rules from SQLite)
    const exclusions = this.storage.getFilterRules("exclusion");
    const s3 = evaluateExclusions(pub, exclusions.length > 0 ? exclusions : undefined);
    const run3: FilterRun = {
      id: crypto.randomUUID(),
      publicationId: pub.id,
      stageIndex: 3,
      stageName: "exclusion_and_negatives",
      passed: s3.passed,
      reason: s3.reason
    };
    this.storage.recordFilterRun(run3);
    auditTrail.push(run3);
    if (!s3.passed) {
      this.storage.updatePublicationStatus(pub.id, "DISCARDED");
      return {
        publicationId: pub.id,
        passed: false,
        failedStage: "exclusion_and_negatives",
        failureReason: s3.reason,
        auditTrail
      };
    }

    // Stage 4: Contacts (ignoring channel's own handle)
    const channel = this.storage.getActiveChannels().find((c) => c.id === pub.channelId);
    const s4 = evaluateContactResolution(pub, channel?.username);
    const run4: FilterRun = {
      id: crypto.randomUUID(),
      publicationId: pub.id,
      stageIndex: 4,
      stageName: "contact_resolution",
      passed: s4.passed,
      reason: s4.reason
    };
    this.storage.recordFilterRun(run4);
    auditTrail.push(run4);
    if (!s4.passed || !s4.extractedContact || !s4.contactType) {
      this.storage.updatePublicationStatus(pub.id, "DISCARDED");
      return {
        publicationId: pub.id,
        passed: false,
        failedStage: "contact_resolution",
        failureReason: s4.reason,
        auditTrail
      };
    }

    // Stage 5: Tagger & CV Profile Association
    const s5 = evaluateTagger(pub, profiles);
    const run5: FilterRun = {
      id: crypto.randomUUID(),
      publicationId: pub.id,
      stageIndex: 5,
      stageName: "profile_and_cv_mapping",
      passed: true,
      reason: `Assigned profile ${s5.assignedProfileId} with ${s5.detectedStack.length} detected stack tags.`
    };
    this.storage.recordFilterRun(run5);
    auditTrail.push(run5);

    this.storage.updatePublicationStatus(pub.id, "ACCEPTED");

    const vacancy: Vacancy = {
      id: `vac_${pub.id}`,
      publicationId: pub.id,
      roleTitle: s5.roleTitle,
      extractedContact: s4.extractedContact,
      contactType: s4.contactType,
      detectedStack: s5.detectedStack,
      tags: s5.tags,
      budgetInfo: s5.budgetInfo
    };

    return {
      publicationId: pub.id,
      passed: true,
      auditTrail,
      vacancy,
      assignedProfileId: s5.assignedProfileId
    };
  }
}
