import type { StorageEngine } from "../core/db.js";
import type { BoundedRunConfig, Publication } from "../core/types.js";
import { FilterPipeline, type PipelineExecutionResult } from "./filters/pipeline.js";
import { HandoffService } from "./handoff.js";
import { DraftGenerator } from "../replies/drafter.js";

export interface BoundedRunSummary {
  runStartedAt: string;
  runFinishedAt: string;
  channelsScanned: number;
  publicationsIngested: number;
  acceptedCount: number;
  discardedCount: number;
  draftsPrepared: number;
  results: PipelineExecutionResult[];
}

export class IngestionController {
  private filterPipeline: FilterPipeline;
  private handoffService: HandoffService;
  private draftGenerator: DraftGenerator;

  constructor(private storage: StorageEngine) {
    this.filterPipeline = new FilterPipeline(storage);
    this.handoffService = new HandoffService(storage);
    this.draftGenerator = new DraftGenerator();
  }

  public async executeBoundedRun(
    config: BoundedRunConfig,
    injectedPublications?: Publication[]
  ): Promise<BoundedRunSummary> {
    const startedAt = new Date().toISOString();
    const channels = this.storage.getActiveChannels();
    const profiles = this.storage.getAllProfiles();

    // Collect publications (either from storage or injected test fixtures)
    let pubsToProcess: Publication[] = [];

    if (injectedPublications && injectedPublications.length > 0) {
      pubsToProcess = injectedPublications;
      for (const p of injectedPublications) {
        this.storage.insertPublication(p);
      }
    } else {
      // Ingest from existing publications stored in DB
      const rows = this.storage.db.prepare("SELECT * FROM publications WHERE status = 'INGESTED'").all() as any[];
      pubsToProcess = rows.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        messageId: r.message_id,
        rawText: r.raw_text,
        publishedAt: r.published_at,
        sourceUrl: r.source_url,
        fingerprint: r.fingerprint,
        status: r.status,
        createdAt: r.created_at
      }));
    }

    const results: PipelineExecutionResult[] = [];
    let acceptedCount = 0;
    let discardedCount = 0;
    let draftsPrepared = 0;

    for (const pub of pubsToProcess) {
      const execResult = this.filterPipeline.processPublication(pub, profiles);
      results.push(execResult);

      if (execResult.passed && execResult.vacancy && execResult.assignedProfileId) {
        acceptedCount++;
        const profile = profiles.find((p) => p.id === execResult.assignedProfileId) || profiles[0];

        // Idempotent handoff to downstream replies queue
        const handoff = this.handoffService.executeHandoff(
          execResult.vacancy,
          profile,
          pub.rawText
        );

        // Prepare context-aware draft
        const draft = await this.draftGenerator.generateDraft({
          vacancy: execResult.vacancy,
          profile,
          rawText: pub.rawText,
          conversationHistory: []
        });

        // Update ReplyTask with prepared draft
        const task = this.storage.getReplyTask(handoff.replyTaskId);
        if (task && draft.isValid) {
          this.storage.upsertReplyTask({
            ...task,
            draftStatus: "DRAFTED",
            draftText: draft.draftText
          });
          draftsPrepared++;
        }
      } else {
        discardedCount++;
      }
    }

    return {
      runStartedAt: startedAt,
      runFinishedAt: new Date().toISOString(),
      channelsScanned: channels.length,
      publicationsIngested: pubsToProcess.length,
      acceptedCount,
      discardedCount,
      draftsPrepared,
      results
    };
  }
}
