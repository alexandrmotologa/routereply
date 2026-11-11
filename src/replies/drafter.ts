import type { Vacancy, CandidateProfile, ConversationMessage } from "../core/types.js";
import { validateDraft } from "./validator.js";

export interface DraftContext {
  vacancy: Vacancy;
  profile: CandidateProfile;
  rawText: string;
  conversationHistory: ConversationMessage[];
}

export interface GeneratedDraftResult {
  draftText: string;
  wordCount: number;
  isValid: boolean;
  validationErrors: string[];
}

export class DraftGenerator {
  /**
   * Generates a context-aware, proof-first draft following the anti-slop guidelines.
   */
  public async generateDraft(context: DraftContext): Promise<GeneratedDraftResult> {
    const { vacancy, profile, conversationHistory } = context;

    // Follow-up route: if conversation history exists, craft a follow-up response
    if (conversationHistory.length > 0) {
      return this.generateFollowUpDraft(context);
    }

    // Initial outreach route
    const role = vacancy.roleTitle || "engineering opportunity";
    const primarySkill = vacancy.detectedStack[0] || profile.skills[0] || "TypeScript";
    const selectedFact = profile.workExperienceFacts[0] || "Led production-grade architectures with high uptime.";
    const portfolioLink = profile.portfolioLinks["github"] || profile.portfolioLinks["portfolio"] || "https://github.com/alexandrmotologa";

    // Direct, proof-first, mobile-friendly copy (3-4 sentences, under 80 words)
    const draftText = [
      `Hi, saw your post regarding the ${role}.`,
      `I specialize in ${primarySkill} and autonomous workflows. ${selectedFact}`,
      `Here is my GitHub and past implementations: ${portfolioLink}`,
      `Are you open to a brief 10-minute chat this week to discuss specifics?`
    ].join("\n\n");

    const validation = validateDraft(draftText);
    const wordCount = draftText.split(/\s+/).filter(Boolean).length;

    return {
      draftText,
      wordCount,
      isValid: validation.valid,
      validationErrors: validation.errors
    };
  }

  private generateFollowUpDraft(context: DraftContext): GeneratedDraftResult {
    const lastMsg = context.conversationHistory[context.conversationHistory.length - 1];
    const draftText = [
      `Thanks for following up.`,
      `Regarding your question: I am ready to review the codebase and schedule an intro call.`,
      `What time window works best for you today or tomorrow?`
    ].join("\n\n");

    const validation = validateDraft(draftText);
    const wordCount = draftText.split(/\s+/).filter(Boolean).length;

    return {
      draftText,
      wordCount,
      isValid: validation.valid,
      validationErrors: validation.errors
    };
  }
}
