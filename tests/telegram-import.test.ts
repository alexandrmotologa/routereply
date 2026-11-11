import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { StorageEngine } from "../src/core/db.js";
import { TelegramExportImporter } from "../src/vacancies/importer.js";

describe("Telegram Desktop Export Importer", () => {
  let storage: StorageEngine;
  let importer: TelegramExportImporter;
  let tempFilePath: string;

  beforeEach(() => {
    storage = new StorageEngine(":memory:");
    importer = new TelegramExportImporter(storage);

    const sampleExport = {
      name: "Global Tech Leads",
      type: "public_channel",
      id: 99887766,
      messages: [
        {
          id: 1,
          type: "message",
          date: "2026-11-11T14:00:00",
          text: "Looking for Senior Rust & TypeScript developer. Remote $85/hr. Contact @rust_hiring_lead"
        },
        {
          id: 2,
          type: "message",
          date: "2026-11-11T14:05:00",
          text: [
            "We are hiring a Fullstack AI Architect. Apply at ",
            { type: "mention", text: "@ai_founder_recruiter" },
            " with your GitHub."
          ]
        },
        {
          id: 3,
          type: "service",
          text: "Channel photo updated"
        }
      ]
    };

    tempFilePath = path.join(os.tmpdir(), `tg_export_test_${Date.now()}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(sampleExport, null, 2), "utf-8");
  });

  afterEach(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("should import messages from Telegram Desktop JSON and deduplicate", () => {
    const result = importer.importJsonFile(tempFilePath);
    expect(result.channelId).toBe("tg_channel_99887766");
    expect(result.channelTitle).toBe("Global Tech Leads");
    expect(result.newIngested).toBe(2); // Only type: "message" (service message skipped)
    expect(result.skippedDuplicates).toBe(0);

    // Repeated import should skip duplicates
    const secondPass = importer.importJsonFile(tempFilePath);
    expect(secondPass.newIngested).toBe(0);
    expect(secondPass.skippedDuplicates).toBe(2);
  });
});
