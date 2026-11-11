import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { loadConfig } from "../core/config.js";

export interface TelegramSendResult {
  serverMessageId: number;
  peerId?: string;
  isRealDispatch: boolean;
}

export interface ITelegramDriver {
  sendMessage(recipientHandle: string, text: string): Promise<TelegramSendResult>;
}

export class SimulationDriver implements ITelegramDriver {
  public async sendMessage(recipientHandle: string, text: string): Promise<TelegramSendResult> {
    // Generate realistic server message sequence ID
    const serverMessageId = Math.floor(100000 + Math.random() * 900000);
    return {
      serverMessageId,
      peerId: recipientHandle,
      isRealDispatch: false
    };
  }
}

export class GramJSDriver implements ITelegramDriver {
  private client: TelegramClient | null = null;
  private isConnecting: boolean = false;

  constructor(
    private apiId: number,
    private apiHash: string,
    private sessionString: string = ""
  ) {}

  private async getClient(): Promise<TelegramClient> {
    if (this.client && this.client.connected) {
      return this.client;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.client) return this.client;
    }

    this.isConnecting = true;
    try {
      const stringSession = new StringSession(this.sessionString);
      this.client = new TelegramClient(stringSession, this.apiId, this.apiHash, {
        connectionRetries: 3
      });
      await this.client.connect();
      return this.client;
    } finally {
      this.isConnecting = false;
    }
  }

  public async sendMessage(recipientHandle: string, text: string): Promise<TelegramSendResult> {
    const client = await this.getClient();
    const cleanHandle = recipientHandle.replace(/^@/, "");

    try {
      // Resolve entity by username
      const entity = await client.getEntity(cleanHandle);
      const result = await client.sendMessage(entity, { message: text });

      return {
        serverMessageId: result.id,
        peerId: entity.id?.toString(),
        isRealDispatch: true
      };
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("FLOOD_WAIT")) {
        const seconds = parseInt(msg.replace(/\D/g, "") || "60", 10);
        throw new Error(`Telegram FloodWait: Server requires pausing for ${seconds} seconds.`);
      }
      if (msg.includes("PEER_FLOOD")) {
        throw new Error("Telegram PeerFlood: Account restricted from initiating messages to non-contacts. Please wait 24h.");
      }
      if (msg.includes("USER_PRIVACY_RESTRICTED")) {
        throw new Error(`User @${cleanHandle} has privacy settings preventing direct messages from strangers.`);
      }
      throw err;
    }
  }
}

export class TelegramBotApiDriver implements ITelegramDriver {
  constructor(private botToken: string) {}

  public async sendMessage(recipientChatId: string, text: string): Promise<TelegramSendResult> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: recipientChatId,
        text
      })
    });

    if (!res.ok) {
      const err = await res.json() as any;
      throw new Error(`Telegram Bot API error (${res.status}): ${err.description || res.statusText}`);
    }

    const data = await res.json() as any;
    return {
      serverMessageId: data.result.message_id,
      peerId: recipientChatId,
      isRealDispatch: true
    };
  }
}

export function createTelegramDriver(): ITelegramDriver {
  const config = loadConfig();

  if (config.telegram.mode === "live" && config.telegram.apiId && config.telegram.apiHash) {
    return new GramJSDriver(
      config.telegram.apiId,
      config.telegram.apiHash,
      config.telegram.sessionString || ""
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (config.telegram.mode === "live" && botToken) {
    return new TelegramBotApiDriver(botToken);
  }

  return new SimulationDriver();
}
