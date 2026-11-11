import { z } from "zod";

// --- Channels ---
export const ChannelSchema = z.object({
  id: z.string(),
  title: z.string(),
  username: z.string().nullable().optional(),
  channelType: z.enum(["channel", "supergroup", "group"]),
  isActive: z.boolean().default(true),
  lastScannedMsgId: z.number().int().default(0),
  createdAt: z.string().optional()
});
export type Channel = z.infer<typeof ChannelSchema>;

// --- Publications ---
export const PublicationStatusSchema = z.enum(["INGESTED", "FILTERED", "DISCARDED", "ACCEPTED"]);
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;

export const PublicationSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  messageId: z.number().int(),
  rawText: z.string(),
  publishedAt: z.string(),
  sourceUrl: z.string().nullable().optional(),
  fingerprint: z.string(),
  status: PublicationStatusSchema.default("INGESTED"),
  createdAt: z.string().optional()
});
export type Publication = z.infer<typeof PublicationSchema>;

// --- Filter Audit ---
export const FilterStageNameSchema = z.enum([
  "sanitization_and_length",
  "role_and_domain_keywords",
  "exclusion_and_negatives",
  "contact_resolution",
  "profile_and_cv_mapping"
]);
export type FilterStageName = z.infer<typeof FilterStageNameSchema>;

export const FilterRunSchema = z.object({
  id: z.string(),
  publicationId: z.string(),
  stageIndex: z.number().int(),
  stageName: FilterStageNameSchema,
  passed: z.boolean(),
  reason: z.string().nullable().optional(),
  evaluatedAt: z.string().optional()
});
export type FilterRun = z.infer<typeof FilterRunSchema>;

// --- Vacancies ---
export const ContactTypeSchema = z.enum(["telegram_user", "telegram_bot", "email", "external_link"]);
export type ContactType = z.infer<typeof ContactTypeSchema>;

export const VacancySchema = z.object({
  id: z.string(),
  publicationId: z.string(),
  roleTitle: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  extractedContact: z.string(),
  contactType: ContactTypeSchema,
  detectedStack: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  budgetInfo: z.string().nullable().optional(),
  createdAt: z.string().optional()
});
export type Vacancy = z.infer<typeof VacancySchema>;

// --- Candidate Profiles & CV Records ---
export const CandidateProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  skills: z.array(z.string()),
  portfolioLinks: z.record(z.string()),
  workExperienceFacts: z.array(z.string()),
  isDefault: z.boolean().default(false),
  version: z.number().int().default(1),
  updatedAt: z.string().optional()
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

// --- Reply Tasks ---
export const DraftStatusSchema = z.enum([
  "PENDING",
  "DRAFTED",
  "STALE",
  "APPROVED",
  "DISPATCHING",
  "SENT",
  "FAILED",
  "REJECTED"
]);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const ReplyTaskSchema = z.object({
  id: z.string(),
  vacancyId: z.string(),
  candidateProfileId: z.string(),
  contextHash: z.string(),
  draftStatus: DraftStatusSchema.default("PENDING"),
  staleReason: z.string().nullable().optional(),
  draftText: z.string().nullable().optional(),
  operatorNotes: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type ReplyTask = z.infer<typeof ReplyTaskSchema>;

// --- Dispatches ---
export const DispatchStatusSchema = z.enum(["PENDING", "CONFIRMED", "TIMEOUT", "FAILED"]);
export type DispatchStatus = z.infer<typeof DispatchStatusSchema>;

export const DispatchSchema = z.object({
  id: z.string(),
  replyTaskId: z.string(),
  recipientHandle: z.string(),
  recipientTgId: z.string().nullable().optional(),
  sentText: z.string(),
  tgMessageId: z.number().int().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  status: DispatchStatusSchema.default("PENDING"),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().optional()
});
export type Dispatch = z.infer<typeof DispatchSchema>;

// --- Conversation Messages ---
export const ConversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderType: z.enum(["OUTBOUND_OPERATOR", "INBOUND_RECRUITER"]),
  tgMessageId: z.number().int(),
  messageText: z.string(),
  receivedAt: z.string(),
  createdAt: z.string().optional()
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

// --- Bounded Run Control ---
export const BoundedRunConfigSchema = z.object({
  sinceHours: z.number().positive().default(24),
  maxItemsPerChannel: z.number().positive().default(50),
  channelIds: z.array(z.string()).optional()
});
export type BoundedRunConfig = z.infer<typeof BoundedRunConfigSchema>;
