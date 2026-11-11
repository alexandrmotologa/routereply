import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { loadConfig } from "../core/config.js";

export async function executeTelegramLogin(): Promise<string> {
  const config = loadConfig();
  const rl = readline.createInterface({ input, output });

  console.log(pc.cyan("\n=== RouteReply: Telegram MTProto Authentication ===\n"));
  console.log(pc.gray("This tool authorizes an authentic Telegram user session via MTProto."));
  console.log(pc.gray("Credentials can be created at https://my.telegram.org\n"));

  try {
    let apiId = config.telegram.apiId;
    if (!apiId) {
      const apiIdStr = await rl.question(pc.yellow("Enter Telegram API_ID: "));
      apiId = parseInt(apiIdStr.trim(), 10);
      if (isNaN(apiId)) throw new Error("Invalid API_ID: must be a valid integer.");
    }

    let apiHash = config.telegram.apiHash;
    if (!apiHash) {
      apiHash = (await rl.question(pc.yellow("Enter Telegram API_HASH: "))).trim();
      if (!apiHash) throw new Error("API_HASH cannot be empty.");
    }

    const session = new StringSession(config.telegram.sessionString || "");
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5
    });

    console.log(pc.cyan("\nConnecting to Telegram servers..."));
    await client.connect();

    await client.start({
      phoneNumber: async () => {
        const phone = await rl.question(pc.yellow("Enter phone number (international format e.g. +123456789): "));
        return phone.trim();
      },
      phoneCode: async () => {
        const code = await rl.question(pc.yellow("Enter the verification code received on Telegram: "));
        return code.trim();
      },
      password: async () => {
        const pass = await rl.question(pc.yellow("Enter your 2FA password (press enter if none): "));
        return pass.trim();
      },
      onError: (err) => console.log(pc.red(`Authentication error: ${err.message}`))
    });

    const sessionString = client.session.save() as unknown as string;
    console.log(pc.green("\n✓ Successfully authenticated with Telegram MTProto!"));

    // Update or create .env file
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

    const updates: Record<string, string> = {
      TELEGRAM_API_ID: apiId.toString(),
      TELEGRAM_API_HASH: apiHash,
      TELEGRAM_SESSION_STRING: sessionString,
      DISPATCH_MODE: "live"
    };

    for (const [k, v] of Object.entries(updates)) {
      const regex = new RegExp(`^${k}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${k}=${v}`);
      } else {
        envContent += `\n${k}=${v}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
    console.log(pc.green(`✓ Saved session to ${envPath}`));
    console.log(pc.cyan("DISPATCH_MODE is now set to 'live' for authentic Telegram messaging.\n"));

    await client.disconnect();
    return sessionString;
  } finally {
    rl.close();
  }
}
