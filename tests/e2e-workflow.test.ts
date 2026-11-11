import { describe, it, expect, beforeEach } from "vitest";
import { StorageEngine } from "../src/core/db.js";
import { IngestionController } from "../src/vacancies/ingest.js";
import { TelegramDispatcher } from "../src/dispatcher/sender.js";
import { seedDatabase } from "../src/fixtures/seed.js";

describe("E2E Acceptance Workflow - RouteReply", () => {
  let storage: StorageEngine;
  let controller: IngestionController;
  let dispatcher: TelegramDispatcher;

  beforeEach(() => {
    storage = new StorageEngine(":memory:");
    seedDatabase(storage);
    controller = new IngestionController(storage);
    dispatcher = new TelegramDispatcher(storage);
  });

  it("should process synthetic publications, filter, prepare drafts, and dispatch on command", async () => {
    // 1. Execute bounded run
    const summary = await controller.executeBoundedRun({ sinceHours: 24, maxItemsPerChannel: 50 });

    expect(summary.publicationsIngested).toBe(20);
    expect(summary.acceptedCount).toBeGreaterThan(0);
    expect(summary.discardedCount).toBeGreaterThan(0);
    expect(summary.draftsPrepared).toBe(summary.acceptedCount);

    // 2. Query review queue
    const queue = storage.listReviewQueue();
    expect(queue.length).toBe(summary.acceptedCount);

    const firstTask = queue[0];
    expect(firstTask.draftStatus).toBe("DRAFTED");
    expect(firstTask.draftText).toBeTruthy();
    expect(firstTask.vacancy.extractedContact).toBeTruthy();

    // 3. Operator manual dispatch
    const dispatchResult = await dispatcher.executeManualDispatch(firstTask.id);
    expect(dispatchResult.success).toBe(true);
    expect(dispatchResult.tgMessageId).toBeGreaterThan(0);

    // 4. Verify post-dispatch status
    const updatedTask = storage.getReplyTask(firstTask.id)!;
    expect(updatedTask.draftStatus).toBe("SENT");

    // 5. Verify cannot re-dispatch already sent task
    const retryResult = await dispatcher.executeManualDispatch(firstTask.id);
    expect(retryResult.success).toBe(false);
    expect(retryResult.errorMessage).toContain("Duplicate sends are strictly prohibited");
  });
});
