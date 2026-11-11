import type { Publication } from "../../core/types.js";
import type { StageResult } from "./stage1-sanitization.js";

export const DEFAULT_EXCLUSIONS = [
  "unpaid",
  "unpaid internship",
  "100% commission",
  "commission only",
  "native tokens after pre-sale",
  "must relocate",
  "relocation required",
  "no remote",
  "onsite only",
  "volunteer",
  "financial accountant",
  "customer support",
  "barista"
];

export function evaluateExclusions(
  pub: Publication,
  exclusions: string[] = DEFAULT_EXCLUSIONS
): StageResult & { triggeredExclusion?: string } {
  const lower = pub.rawText.toLowerCase();

  for (const exc of exclusions) {
    if (lower.includes(exc.toLowerCase())) {
      return {
        passed: false,
        triggeredExclusion: exc,
        reason: `Matched exclusion rule: contains disqualified term '${exc}'.`
      };
    }
  }

  return { passed: true };
}
