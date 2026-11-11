import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  telegram: {
    apiId?: number;
    apiHash?: string;
    sessionString?: string;
    phone?: string;
    mode: "live" | "simulation";
  };
  llm: {
    provider: "gemini" | "ollama" | "deterministic";
    geminiApiKey?: string;
    geminiModel: string;
    ollamaHost: string;
    ollamaModel: string;
  };
  rateLimit: {
    minDelayMs: number;
    maxDelayMs: number;
    maxDailyDms: number;
  };
}

export function loadConfig(envFilePath?: string): AppConfig {
  // Load .env file if present
  const targetEnv = envFilePath || path.resolve(process.cwd(), ".env");
  if (fs.existsSync(targetEnv)) {
    const content = fs.readFileSync(targetEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }

  const apiIdStr = process.env.TELEGRAM_API_ID;
  const apiId = apiIdStr ? parseInt(apiIdStr, 10) : undefined;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionString = process.env.TELEGRAM_SESSION_STRING;

  // Determine dispatch mode: live only if apiId & apiHash exist
  const hasLiveCredentials = Boolean(apiId && apiHash);
  const mode = process.env.DISPATCH_MODE === "live" && hasLiveCredentials ? "live" : "simulation";

  // LLM Provider selection
  const geminiKey = process.env.GEMINI_API_KEY;
  let defaultProvider: "gemini" | "ollama" | "deterministic" = "deterministic";
  if (process.env.LLM_PROVIDER === "ollama") {
    defaultProvider = "ollama";
  } else if (geminiKey || process.env.LLM_PROVIDER === "gemini") {
    defaultProvider = "gemini";
  }

  return {
    telegram: {
      apiId,
      apiHash,
      sessionString,
      phone: process.env.TELEGRAM_PHONE,
      mode
    },
    llm: {
      provider: defaultProvider,
      geminiApiKey: geminiKey,
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ollamaHost: process.env.OLLAMA_HOST || "http://localhost:11434",
      ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5-coder:latest"
    },
    rateLimit: {
      minDelayMs: parseInt(process.env.MIN_DELAY_MS || "2000", 10),
      maxDelayMs: parseInt(process.env.MAX_DELAY_MS || "4000", 10),
      maxDailyDms: parseInt(process.env.MAX_DAILY_DMS || "20", 10)
    }
  };
}
