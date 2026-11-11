import crypto from "node:crypto";
import pc from "picocolors";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { StorageEngine } from "../core/db.js";
import type { Publication } from "../core/types.js";
import { FilterPipeline } from "../vacancies/filters/pipeline.js";
import { HandoffService } from "../vacancies/handoff.js";
import { DraftGenerator } from "../replies/drafter.js";
import { loadConfig } from "../core/config.js";

export class RealTimeChannelListener {
  private filterPipeline: FilterPipeline;
  private handoffService: HandoffService;
  private draftGenerator: DraftGenerator;
  private isRunning: boolean = false;
  private client: TelegramClient | null = null;

  constructor(private storage: StorageEngine) {
    this.filterPipeline = new FilterPipeline(storage);
    this.handoffService = new HandoffService(storage);
    this.draftGenerator = new DraftGenerator();
  }

  /**
   * Starts active MTProto listening on monitored channels.
   */
  public async start(): Promise<void> {
    const config = loadConfig();
    this.isRunning = true;

    const channels = this.storage.getActiveChannels();
    console.log(pc.cyan(`\n=== RouteReply Real-Time Channel Listener ===`));
    console.log(`Monitoring ${channels.length} configured channels/groups...`);

    if (config.telegram.mode === "live" && config.telegram.apiId && config.telegram.apiHash && config.telegram.sessionString) {
      console.log(pc.green("Starting MTProto Live Event Stream..."));
      const session = new StringSession(config.telegram.sessionString);
      this.client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
        connectionRetries: 5
      });
      await this.client.connect();

      // Listen for new messages across all monitored channel chats
      this.client.addEventHandler(async (event: any) => {
        if (!this.isRunning) return;
        const msg = event.message;
        if (!msg || !msg.message || msg.message.trim().length === 0) return;

        const peerId = msg.peerId?.channelId?.toString() || msg.peerId?.chatId?.toString() || "unknown_channel";
        await this.handleIncomingMessage({
          channelId: `tg_channel_${peerId}`,
          messageId: msg.id,
          rawText: msg.message,
          publishedAt: new Date(msg.date * 1000).toISOString()
        });
      }, new NewMessage({}));

      console.log(pc.green("✓ Connected and actively listening for incoming posts.\n"));
    } else {
      console.log(pc.yellow("Note: Live MTProto credentials not active. Running in simulated poll mode."));
      console.log(pc.gray("Use 'routereply login' to authenticate with real Telegram credentials.\n"));
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    console.log(pc.yellow("[ChannelListener] Listener stopped."));
  }

  public async handleIncomingMessage(params: {
    channelId: string;
    messageId: number;
    rawText: string;
    publishedAt: string;
  }): Promise<boolean> {
    const fingerprint = crypto.createHash("sha256").update(params.rawText.trim(), "utf-8").digest("hex");
    const pub: Publication = {
      id: `pub_live_${params.channelId}_${params.messageId}`,
      channelId: params.channelId,
      messageId: params.messageId,
      rawText: params.rawText,
      publishedAt: params.publishedAt,
      sourceUrl: null,
      fingerprint,
      status: "INGESTED"
    };

    // 1. Idempotent insertion
    const isNew = this.storage.insertPublication(pub);
    if (!isNew) return false;

    // 2. Evaluate filter pipeline
    const profiles = this.storage.getAllProfiles();
    const result = this.filterPipeline.processPublication(pub, profiles);

    if (result.passed && result.vacancy && result.assignedProfileId) {
      const profile = profiles.find((p) => p.id === result.assignedProfileId) || profiles[0];

      // 3. Handoff to replies queue
      const handoff = this.handoffService.executeHandoff(result.vacancy, profile, pub.rawText);

      // 4. Generate context draft
      const draft = await this.draftGenerator.generateDraft({
        vacancy: result.vacancy,
        profile,
        rawText: pub.rawText,
        conversationHistory: []
      });

      if (draft.isValid) {
        const task = this.storage.getReplyTask(handoff.replyTaskId);
        if (task) {
          this.storage.upsertReplyTask({
            ...task,
            draftStatus: "DRAFTED",
            draftText: draft.draftText
          });
        }
      }

      console.log(pc.green(`[MATCH] New qualified vacancy detected: "${result.vacancy.roleTitle}"`));
      console.log(`  Contact: ${pc.yellow(result.vacancy.extractedContact)} | Draft prepared and added to Review Queue.`);
      return true;
    } else {
      console.log(pc.gray(`[DISCARDED] Post ${pub.id} rejected at stage: ${result.failedStage} (${result.failureReason})`));
      return false;
    }
  }
}
