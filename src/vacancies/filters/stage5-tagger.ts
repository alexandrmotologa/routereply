import type { Publication, CandidateProfile } from "../../core/types.js";

export interface TaggerResult {
  roleTitle: string;
  companyName?: string;
  detectedStack: string[];
  tags: string[];
  budgetInfo?: string;
  assignedProfileId: string;
}

export function evaluateTagger(
  pub: Publication,
  profiles: CandidateProfile[]
): TaggerResult {
  const text = pub.rawText;
  const lower = text.toLowerCase();

  // 1. Detect role title
  let roleTitle = "Software Engineer";
  if (lower.includes("fullstack ai")) roleTitle = "Senior Fullstack AI Engineer";
  else if (lower.includes("mobile") || lower.includes("react native") || lower.includes("expo")) roleTitle = "Mobile App Developer";
  else if (lower.includes("frontend") || lower.includes("react")) roleTitle = "Frontend Developer";
  else if (lower.includes("backend") || lower.includes("node")) roleTitle = "Backend Engineer";
  else if (lower.includes("automation")) roleTitle = "Workflow Automation Architect";
  else if (lower.includes("telegram bot")) roleTitle = "Telegram Bot / MTProto Developer";

  // 2. Detect tech stack
  const stackCatalog = [
    "TypeScript", "JavaScript", "Node.js", "Python", "FastAPI", "Next.js",
    "React", "React Native", "Expo", "SQLite", "PostgreSQL", "Tailwind CSS",
    "LangChain", "Vector DB", "Telegram Bot API", "MTProto"
  ];
  const detectedStack: string[] = [];
  for (const tech of stackCatalog) {
    const regex = new RegExp(`\\b${tech.replace(".", "\\.")}\\b`, "i");
    if (regex.test(text)) {
      detectedStack.push(tech);
    }
  }

  // 3. Extract budget/rate
  let budgetInfo: string | undefined;
  const budgetRegex = /(\$\d+(?:[-–]\d+)?(?:\/hr|\/month|\/mo|\s*fixed|\s*total)?|\d+\s*(?:USD|EUR|k|\$))/i;
  const budgetMatch = text.match(budgetRegex);
  if (budgetMatch) {
    budgetInfo = budgetMatch[0];
  }

  // 4. Tags
  const tags: string[] = [];
  if (lower.includes("remote")) tags.push("remote");
  if (lower.includes("contract") || lower.includes("gig")) tags.push("contract");
  if (lower.includes("senior") || lower.includes("lead")) tags.push("senior");
  if (lower.includes("ai") || lower.includes("llm")) tags.push("ai");
  if (lower.includes("mobile") || lower.includes("react native")) tags.push("mobile");

  // 5. Match candidate profile
  let bestProfileId = profiles.find((p) => p.isDefault)?.id || profiles[0]?.id || "profile_default";
  let maxScore = -1;

  for (const prof of profiles) {
    let score = 0;
    for (const skill of prof.skills) {
      if (detectedStack.map((s) => s.toLowerCase()).includes(skill.toLowerCase())) {
        score += 2;
      } else if (lower.includes(skill.toLowerCase())) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestProfileId = prof.id;
    }
  }

  return {
    roleTitle,
    detectedStack,
    tags,
    budgetInfo,
    assignedProfileId: bestProfileId
  };
}
