import crypto from "node:crypto";
import type { ConversationMessage } from "../core/types.js";

export const CURRENT_PROMPT_VERSION = "v1.2.0";

export interface ContextPayload {
  publicationText: string;
  candidateProfileId: string;
  candidateProfileVersion: number;
  conversationHistory: ConversationMessage[];
  promptVersion?: string;
}

export function computeContextHash(payload: ContextPayload): string {
  const historyFingerprint = payload.conversationHistory
    .map((m) => `${m.senderType}:${m.tgMessageId}:${m.messageText.trim()}`)
    .join("||");

  const normalized = [
    `PUB:${payload.publicationText.trim()}`,
    `PROFILE:${payload.candidateProfileId}:v${payload.candidateProfileVersion}`,
    `HISTORY:${historyFingerprint}`,
    `PROMPT:${payload.promptVersion || CURRENT_PROMPT_VERSION}`
  ].join("###");

  return crypto.createHash("sha256").update(normalized, "utf-8").digest("hex");
}
