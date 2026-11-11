import fs from "node:fs";
import crypto from "node:crypto";
import type { StorageEngine } from "../core/db.js";
import type { Channel, Publication } from "../core/types.js";

export interface TgExportMessage {
  id: number;
  type: string;
  date: string;
  from?: string;
  from_id?: string;
  text: string | Array<string | { type: string; text: string }>;
  text_entities?: Array<{ type: string; text: string }>;
}

export interface TgExportFile {
  name: string;
  type: string;
  id: number;
  messages: TgExportMessage[];
}

export interface ImportResult {
  channelId: string;
  channelTitle: string;
  totalParsed: number;
  newIngested: number;
  skippedDuplicates: number;
}

export class TelegramExportImporter {
  constructor(private storage: StorageEngine) {}

  /**
   * Imports publications from a standard Telegram Desktop JSON export file.
   */
  public importJsonFile(filePath: string): ImportResult {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Telegram export file not found: ${filePath}`);
    }

    const rawContent = fs.readFileSync(filePath, "utf-8");
    const data: TgExportFile = JSON.parse(rawContent);

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error("Invalid Telegram export file: missing 'messages' array.");
    }

    const channelId = `tg_channel_${data.id}`;
    const channelTitle = data.name || `Imported Channel (${data.id})`;

    // Upsert channel
    const channel: Channel = {
      id: channelId,
      title: channelTitle,
      username: null,
      channelType: data.type === "public_channel" ? "channel" : "supergroup",
      isActive: true,
      lastScannedMsgId: 0
    };
    this.storage.upsertChannel(channel);

    let newIngested = 0;
    let skippedDuplicates = 0;

    for (const msg of data.messages) {
      if (msg.type !== "message") continue;

      const rawText = this.flattenTelegramText(msg.text);
      if (!rawText || rawText.trim().length === 0) continue;

      const fingerprint = crypto.createHash("sha256").update(rawText.trim(), "utf-8").digest("hex");
      const pub: Publication = {
        id: `pub_tg_${data.id}_${msg.id}`,
        channelId,
        messageId: msg.id,
        rawText: rawText.trim(),
        publishedAt: msg.date || new Date().toISOString(),
        sourceUrl: null,
        fingerprint,
        status: "INGESTED"
      };

      const inserted = this.storage.insertPublication(pub);
      if (inserted) {
        newIngested++;
      } else {
        skippedDuplicates++;
      }
    }

    return {
      channelId,
      channelTitle,
      totalParsed: data.messages.length,
      newIngested,
      skippedDuplicates
    };
  }

  private flattenTelegramText(text: string | Array<string | { type: string; text: string }>): string {
    if (typeof text === "string") return text;
    if (Array.isArray(text)) {
      return text
        .map((part) => (typeof part === "string" ? part : part.text || ""))
        .join("");
    }
    return "";
  }
}
