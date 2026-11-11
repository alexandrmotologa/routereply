import type { Publication } from "../../core/types.js";

export interface StageResult {
  passed: boolean;
  reason?: string;
}

export function evaluateSanitization(pub: Publication): StageResult {
  const text = pub.rawText.trim();

  // 1. Minimum character length (under 60 chars is usually a forwarded meme or link with no context)
  if (text.length < 60) {
    return {
      passed: false,
      reason: `Message length (${text.length} chars) is below minimum threshold (60 chars). Likely a stub or forward.`
    };
  }

  // 2. Maximum character length (over 5000 chars is usually a dump or multi-job newsletter)
  if (text.length > 5000) {
    return {
      passed: false,
      reason: `Message length (${text.length} chars) exceeds maximum threshold (5000 chars).`
    };
  }

  // 3. Obvious spam / scam patterns
  const spamKeywords = [
    "crypto pump",
    "signals group",
    "free bitcoin",
    "make $1000 a day",
    "casino bonus",
    "slots hack"
  ];
  const lower = text.toLowerCase();
  for (const spam of spamKeywords) {
    if (lower.includes(spam)) {
      return {
        passed: false,
        reason: `Flagged by spam heuristic: contains banned pattern '${spam}'.`
      };
    }
  }

  return { passed: true };
}
