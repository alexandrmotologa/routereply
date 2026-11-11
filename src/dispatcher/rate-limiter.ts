export interface RateLimitConfig {
  minDelayMs: number;
  maxDelayMs: number;
  maxDailyDms: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  minDelayMs: 2000,    // In synthetic/test mode: 2-4 seconds; In live production: 90000 - 240000 ms
  maxDelayMs: 4000,
  maxDailyDms: 20
};

export class DispatchRateLimiter {
  private lastDispatchTimestamp: number = 0;
  private dailyDispatchesCount: number = 0;
  private dayResetTimestamp: number = Date.now() + 86400000;
  private floodWaitUntilTimestamp: number = 0;

  constructor(private config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {}

  public getStatus(): {
    dailyCount: number;
    maxDaily: number;
    isFloodWaiting: boolean;
    floodWaitRemainingSec: number;
  } {
    const now = Date.now();
    const floodRemaining = Math.max(0, Math.ceil((this.floodWaitUntilTimestamp - now) / 1000));
    return {
      dailyCount: this.dailyDispatchesCount,
      maxDaily: this.config.maxDailyDms,
      isFloodWaiting: floodRemaining > 0,
      floodWaitRemainingSec: floodRemaining
    };
  }

  public assertCanDispatch(): void {
    const now = Date.now();

    // Check FloodWait barrier
    if (now < this.floodWaitUntilTimestamp) {
      const waitSec = Math.ceil((this.floodWaitUntilTimestamp - now) / 1000);
      throw new Error(`Telegram FloodWait active. Dispatch blocked for ${waitSec} more seconds.`);
    }

    // Check daily cap
    if (now > this.dayResetTimestamp) {
      this.dailyDispatchesCount = 0;
      this.dayResetTimestamp = now + 86400000;
    }

    if (this.dailyDispatchesCount >= this.config.maxDailyDms) {
      throw new Error(`Daily dispatch limit reached (${this.dailyDispatchesCount}/${this.config.maxDailyDms}). Halting to protect Telegram account reputation.`);
    }
  }

  public async acquireJitteredSlot(): Promise<number> {
    this.assertCanDispatch();

    const now = Date.now();
    const elapsed = now - this.lastDispatchTimestamp;
    const jitter = Math.floor(
      this.config.minDelayMs + Math.random() * (this.config.maxDelayMs - this.config.minDelayMs)
    );

    const requiredWait = Math.max(0, jitter - elapsed);
    if (requiredWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, requiredWait));
    }

    this.lastDispatchTimestamp = Date.now();
    this.dailyDispatchesCount++;
    return requiredWait;
  }

  public triggerFloodWait(seconds: number): void {
    this.floodWaitUntilTimestamp = Date.now() + (seconds + 30) * 1000; // Extra 30s safety margin
  }
}
