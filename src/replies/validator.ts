export interface DraftValidationResult {
  valid: boolean;
  errors: string[];
}

export const FORBIDDEN_AI_CLICHES = [
  "i hope this message finds you well",
  "i am thrilled to apply",
  "i believe i am the ideal candidate",
  "delve into",
  "testament to",
  "beacon of",
  "in today's fast-paced world",
  "pleased to meet you",
  "look no further"
];

export const PLACEHOLDER_PATTERNS = [
  /\[your\s*name\]/i,
  /\[my\s*name\]/i,
  /\[insert\s*[^\]]+\]/i,
  /\{company\}/i,
  /\{name\}/i,
  /<link>/i
];

export function validateDraft(draftText: string): DraftValidationResult {
  const errors: string[] = [];
  const text = draftText.trim();

  // 1. Length bounds
  if (text.length < 30) {
    errors.push(`Draft is too short (${text.length} chars). Minimum is 30 characters.`);
  }
  if (text.length > 800) {
    errors.push(`Draft is too long (${text.length} chars). Maximum allowed for Telegram outreach is 800 characters.`);
  }

  // 2. Word count
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 120) {
    errors.push(`Draft exceeds word limit (${words.length} words). Max is 120 words for mobile screen readability.`);
  }

  // 3. Placeholder leaks
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(`Draft contains unresolved placeholder matching ${pattern.toString()}.`);
    }
  }

  // 4. Anti-slop / AI Clichés
  const lower = text.toLowerCase();
  for (const cliche of FORBIDDEN_AI_CLICHES) {
    if (lower.includes(cliche)) {
      errors.push(`Draft contains robotic AI cliché: "${cliche}".`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
