import type { Publication, ContactType } from "../../core/types.js";
import type { StageResult } from "./stage1-sanitization.js";

export interface ContactExtractionResult extends StageResult {
  extractedContact?: string;
  contactType?: ContactType;
}

export function evaluateContactResolution(pub: Publication): ContactExtractionResult {
  const text = pub.rawText;

  // 1. Telegram username match: @username
  const tgUserRegex = /@([a-zA-Z0-9_]{4,32})/g;
  const tgMatches = Array.from(text.matchAll(tgUserRegex));
  if (tgMatches.length > 0) {
    const handle = tgMatches[0][0]; // e.g. "@tech_recruiter_sam"
    const isBot = handle.toLowerCase().endsWith("bot");
    return {
      passed: true,
      extractedContact: handle,
      contactType: isBot ? "telegram_bot" : "telegram_user"
    };
  }

  // 2. Telegram direct link: t.me/username
  const tmeRegex = /(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{4,32})/i;
  const tmeMatch = text.match(tmeRegex);
  if (tmeMatch) {
    const handle = `@${tmeMatch[1]}`;
    const isBot = handle.toLowerCase().endsWith("bot");
    return {
      passed: true,
      extractedContact: handle,
      contactType: isBot ? "telegram_bot" : "telegram_user"
    };
  }

  // 3. Email address fallback
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    return {
      passed: true,
      extractedContact: emailMatch[1],
      contactType: "email",
      reason: "Resolved email contact. Marked for email fallback route."
    };
  }

  // 4. External application form fallback (Google Forms, Typeform, Lever, Greenhouse, etc.)
  const formRegex = /(https?:\/\/[^\s]+(?:forms\.gle|typeform|lever\.co|greenhouse\.io)[^\s]*)/i;
  const formMatch = text.match(formRegex);
  if (formMatch) {
    return {
      passed: true,
      extractedContact: formMatch[1],
      contactType: "external_link",
      reason: "Resolved external application form. Marked for external route."
    };
  }

  return {
    passed: false,
    reason: "No actionable contact method found (no @username, t.me link, email, or application form)."
  };
}
