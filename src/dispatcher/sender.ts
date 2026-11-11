import crypto from "node:crypto";
import type { StorageEngine } from "../core/db.js";
import type { Dispatch } from "../core/types.js";
import { FreshnessGuard } from "../replies/freshness.js";
import { DispatchRateLimiter } from "./rate-limiter.js";
import { createTelegramDriver, type ITelegramDriver } from "./mtproto-client.js";

export interface DispatchExecutionResult {
  success: boolean;
  replyTaskId: string;
  dispatchId: string;
  recipientHandle: string;
  tgMessageId?: number;
  isRealDispatch?: boolean;
  errorMessage?: string;
}

export class TelegramDispatcher {
  private isControllerLocked: boolean = false;
  private freshnessGuard: FreshnessGuard;
  private driver: ITelegramDriver;

  constructor(
    private storage: StorageEngine,
    private rateLimiter: DispatchRateLimiter = new DispatchRateLimiter(),
    driver?: ITelegramDriver
  ) {
    this.freshnessGuard = new FreshnessGuard(storage);
    this.driver = driver || createTelegramDriver();
  }

  /**
   * Executes manual dispatch gated by the human operator.
   * Single active controller lock prevents concurrent dispatch races.
   */
  public async executeManualDispatch(replyTaskId: string): Promise<DispatchExecutionResult> {
    if (this.isControllerLocked) {
      throw new Error("Active dispatch controller is locked. Another dispatch operation is currently in flight.");
    }

    this.isControllerLocked = true;
    const dispatchId = `disp_${crypto.randomUUID()}`;

    try {
      // 1. Fetch task
      const task = this.storage.getReplyTask(replyTaskId);
      if (!task) {
        throw new Error(`ReplyTask '${replyTaskId}' not found.`);
      }

      if (task.draftStatus === "SENT") {
        throw new Error(`Task '${replyTaskId}' has already been delivered. Duplicate sends are strictly prohibited.`);
      }

      if (!task.draftText || task.draftText.trim().length === 0) {
        throw new Error(`Task '${replyTaskId}' has no prepared draft text.`);
      }

      // 2. Fetch associated vacancy & recipient
      const vacancy = this.storage.getVacancy(task.vacancyId);
      if (!vacancy) {
        throw new Error(`Vacancy for task '${replyTaskId}' not found.`);
      }

      // 3. Pre-flight Freshness Gate: Invariant from Section 5
      const freshness = this.freshnessGuard.evaluateFreshness(task);
      if (!freshness.isFresh) {
        throw new Error(`Cannot dispatch: Draft is STALE. ${freshness.reason}`);
      }

      // 4. Rate-limiter and Jitter Gate
      await this.rateLimiter.acquireJitteredSlot();

      // 5. Create PENDING dispatch record
      const dispatchRecord: Dispatch = {
        id: dispatchId,
        replyTaskId: task.id,
        recipientHandle: vacancy.extractedContact,
        sentText: task.draftText,
        status: "PENDING"
      };
      this.storage.insertDispatch(dispatchRecord);

      // 6. MTProto / Telegram Send boundary via active driver
      const sendResult = await this.driver.sendMessage(vacancy.extractedContact, task.draftText);

      // 7. Verifiable Delivery Confirmation: Invariant from Section 3
      this.storage.updateDispatchStatus(dispatchId, "CONFIRMED", sendResult.serverMessageId);

      // 8. Update task status to SENT
      this.storage.upsertReplyTask({
        ...task,
        draftStatus: "SENT",
        reviewedAt: new Date().toISOString()
      });

      // 9. Initialize conversation history tracking with outbound message
      this.storage.recordConversationMessage({
        id: crypto.randomUUID(),
        conversationId: vacancy.extractedContact,
        senderType: "OUTBOUND_OPERATOR",
        tgMessageId: sendResult.serverMessageId,
        messageText: task.draftText,
        receivedAt: new Date().toISOString()
      });

      return {
        success: true,
        replyTaskId: task.id,
        dispatchId,
        recipientHandle: vacancy.extractedContact,
        tgMessageId: sendResult.serverMessageId,
        isRealDispatch: sendResult.isRealDispatch
      };
    } catch (err: any) {
      // Record failure on dispatch record if it was inserted
      this.storage.updateDispatchStatus(dispatchId, "FAILED", undefined, err.message);
      return {
        success: false,
        replyTaskId,
        dispatchId,
        recipientHandle: "unknown",
        errorMessage: err.message
      };
    } finally {
      this.isControllerLocked = false;
    }
  }
}
