import type { Vacancy, CandidateProfile, ConversationMessage } from "../core/types.js";
import { validateDraft } from "./validator.js";
import { loadConfig } from "../core/config.js";

export interface DraftContext {
  vacancy: Vacancy;
  profile: CandidateProfile;
  rawText: string;
  conversationHistory: ConversationMessage[];
  preferredProvider?: "gemini" | "ollama" | "deterministic";
}

export interface GeneratedDraftResult {
  draftText: string;
  wordCount: number;
  providerUsed: "gemini" | "ollama" | "deterministic";
  isValid: boolean;
  validationErrors: string[];
}

export class DraftGenerator {
  /**
   * Generates a context-aware, proof-first draft following anti-slop guidelines.
   * Dynamically routes to Gemini API, local Ollama, or deterministic fallback.
   */
  public async generateDraft(context: DraftContext): Promise<GeneratedDraftResult> {
    const config = loadConfig();
    const provider = context.preferredProvider || config.llm.provider;

    // Follow-up route: if conversation history exists, craft a follow-up response
    if (context.conversationHistory.length > 0) {
      return this.generateFollowUpDraft(context, provider);
    }

    // 1. Try Gemini if configured
    if (provider === "gemini" && config.llm.geminiApiKey) {
      try {
        const text = await this.callGemini(context, config.llm.geminiApiKey, config.llm.geminiModel);
        const validation = validateDraft(text);
        if (validation.valid) {
          return {
            draftText: text,
            wordCount: text.split(/\s+/).filter(Boolean).length,
            providerUsed: "gemini",
            isValid: true,
            validationErrors: []
          };
        }
      } catch (err: any) {
        console.warn(`[DraftGenerator] Gemini call failed, falling back to local: ${err.message}`);
      }
    }

    // 2. Try Ollama if configured
    if (provider === "ollama" || (provider === "gemini" && !config.llm.geminiApiKey)) {
      try {
        const text = await this.callOllama(context, config.llm.ollamaHost, config.llm.ollamaModel);
        const validation = validateDraft(text);
        if (validation.valid) {
          return {
            draftText: text,
            wordCount: text.split(/\s+/).filter(Boolean).length,
            providerUsed: "ollama",
            isValid: true,
            validationErrors: []
          };
        }
      } catch (err: any) {
        // Ollama offline, fallback to deterministic
      }
    }

    // 3. Deterministic rule-based copy (offline and reliable)
    const fallbackText = this.generateDeterministicDraft(context);
    const validation = validateDraft(fallbackText);
    return {
      draftText: fallbackText,
      wordCount: fallbackText.split(/\s+/).filter(Boolean).length,
      providerUsed: "deterministic",
      isValid: validation.valid,
      validationErrors: validation.errors
    };
  }

  private async callGemini(context: DraftContext, apiKey: string, model: string): Promise<string> {
    const prompt = this.buildPrompt(context);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 250
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as any;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return this.cleanGeneratedText(raw);
  }

  private async callOllama(context: DraftContext, host: string, model: string): Promise<string> {
    const prompt = this.buildPrompt(context);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 200 }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.statusText}`);
    }

    const data = await res.json() as any;
    return this.cleanGeneratedText(data.response?.trim() || "");
  }

  private buildPrompt(context: DraftContext): string {
    const { vacancy, profile, rawText } = context;
    const portfolioLinksStr = Object.entries(profile.portfolioLinks)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    return `You are a principal engineer directly reaching out to a recruiter or client on Telegram.
Write a direct, concise message about this vacancy.

VACANCY:
Role: ${vacancy.roleTitle || "Software Engineer"}
Stack: ${vacancy.detectedStack.join(", ") || "TypeScript"}
Source Text: "${rawText.slice(0, 500)}"

CANDIDATE FACTS (Use ONLY these real facts, no hallucinations):
Candidate: ${profile.name}
Top Skills: ${profile.skills.slice(0, 5).join(", ")}
Key Achievement: ${profile.workExperienceFacts[0] || "Led production architectures with high uptime."}
Links: ${portfolioLinksStr}

STRICT INVARIANTS:
1. Under 80 words.
2. NO fluff or AI openers ("I hope this message finds you well", "I am excited to apply").
3. Cite the exact role and 1 concrete technical metric/achievement from the candidate facts.
4. Include the main GitHub or portfolio link.
5. Close with a low-friction question (e.g. asking for a brief chat this week).
6. Output ONLY the message text. No greeting placeholders like [Your Name].`;
  }

  private cleanGeneratedText(text: string): string {
    return text
      .replace(/^```[a-z]*\n/i, "")
      .replace(/\n```$/i, "")
      .replace(/^"|"$/g, "")
      .trim();
  }

  private generateDeterministicDraft(context: DraftContext): string {
    const { vacancy, profile } = context;
    const role = vacancy.roleTitle || "engineering opportunity";
    const primarySkill = vacancy.detectedStack[0] || profile.skills[0] || "TypeScript";
    const selectedFact = profile.workExperienceFacts[0] || "Led production-grade architectures with high uptime.";
    const portfolioLink = profile.portfolioLinks["github"] || profile.portfolioLinks["portfolio"] || "https://github.com/alexandrmotologa";

    return [
      `Hi, saw your post regarding the ${role}.`,
      `I specialize in ${primarySkill} and autonomous workflows. ${selectedFact}`,
      `Here is my GitHub and past implementations: ${portfolioLink}`,
      `Are you open to a brief 10-minute chat this week to discuss specifics?`
    ].join("\n\n");
  }

  private generateFollowUpDraft(
    context: DraftContext,
    provider: "gemini" | "ollama" | "deterministic"
  ): GeneratedDraftResult {
    const draftText = [
      `Thanks for following up.`,
      `Regarding your message: I am ready to review the codebase and schedule an intro call.`,
      `What time window works best for you today or tomorrow?`
    ].join("\n\n");

    const validation = validateDraft(draftText);
    return {
      draftText,
      wordCount: draftText.split(/\s+/).filter(Boolean).length,
      providerUsed: "deterministic",
      isValid: validation.valid,
      validationErrors: validation.errors
    };
  }
}
