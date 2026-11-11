import type { Publication, ContactType } from "../../core/types.js";
import type { StageResult } from "./stage1-sanitization.js";

export interface ContactExtractionResult extends StageResult {
  extractedContact?: string;
  contactType?: ContactType;
}

export function evaluateContactResolution(
  pub: Publication,
  channelUsername?: string | null
): ContactExtractionResult {
  const text = pub.rawText;

  // 1. Email address FIRST (prevent matching @domain as a TG username)
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    return {
      passed: true,
      extractedContact: emailMatch[1].trim(),
      contactType: "email",
      reason: "Resolved email contact. Routed to email workflow."
    };
  }

  // 2. External application form (Google Forms, Typeform, Lever, Greenhouse, etc.)
  const formRegex = /(https?:\/\/[^\s]+(?:forms\.gle|typeform\.com|lever\.co|greenhouse\.io|notion\.site|apply)[^\s]*)/i;
  const formMatch = text.match(formRegex);
  if (formMatch) {
    return {
      passed: true,
      extractedContact: formMatch[1].trim(),
      contactType: "external_link",
      reason: "Resolved external application form link."
    };
  }

  // 3. Telegram direct link: t.me/username
  const tmeRegex = /(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{4,32})/gi;
  const tmeMatches = Array.from(text.matchAll(tmeRegex));
  for (const m of tmeMatches) {
    const username = m[1].toLowerCase();
    // Exclude if it's the channel's own link
    if (channelUsername && username === channelUsername.replace(/^@/, "").toLowerCase()) {
      continue;
    }
    const handle = `@${m[1]}`;
    const isBot = handle.toLowerCase().endsWith("bot");
    return {
      passed: true,
      extractedContact: handle,
      contactType: isBot ? "telegram_bot" : "telegram_user"
    };
  }

  // 4. Telegram username match: @username
  const tgUserRegex = /@([a-zA-Z0-9_]{4,32})/g;
  const tgMatches = Array.from(text.matchAll(tgUserRegex));
  for (const m of tgMatches) {
    const handle = m[0];
    const rawUsername = m[1].toLowerCase();

    // Skip channel's own username or common non-contact bot mentions
    if (channelUsername && rawUsername === channelUsername.replace(/^@/, "").toLowerCase()) {
      continue;
    }

    const isBot = handle.toLowerCase().endsWith("bot");
    return {
      passed: true,
      extractedContact: handle,
      contactType: isBot ? "telegram_bot" : "telegram_user"
    };
  }

  return {
    passed: false,
    reason: "No actionable contact method found (no recruiter @username, t.me link, email, or application form)."
  };
}
