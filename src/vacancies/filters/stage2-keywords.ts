import type { Publication } from "../../core/types.js";
import type { StageResult } from "./stage1-sanitization.js";

export const DEFAULT_TECH_KEYWORDS = [
  "typescript",
  "javascript",
  "node",
  "nodejs",
  "python",
  "fastapi",
  "react",
  "react native",
  "next.js",
  "nextjs",
  "expo",
  "sqlite",
  "fullstack",
  "frontend",
  "backend",
  "engineer",
  "developer",
  "contract",
  "agent",
  "llm",
  "ai",
  "telegram bot",
  "mtproto",
  "automation"
];

export function evaluateKeywords(
  pub: Publication,
  keywords: string[] = DEFAULT_TECH_KEYWORDS
): StageResult & { matchedKeywords?: string[] } {
  const lower = pub.rawText.toLowerCase();
  const matched = keywords.filter((kw) => {
    // Word boundary or substring matching for technical terms
    const regex = new RegExp(`\\b${kw.replace(".", "\\.")}\\b`, "i");
    return regex.test(lower) || lower.includes(kw);
  });

  // Requires at least 2 distinct tech/role keyword matches to prevent false positives
  if (matched.length >= 2) {
    return {
      passed: true,
      matchedKeywords: matched
    };
  }

  return {
    passed: false,
    reason: `Insufficient technical keyword matches (${matched.length} matched: ${matched.join(", ") || "none"}). Expected at least 2.`
  };
}
