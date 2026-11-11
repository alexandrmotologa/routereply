import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import type {
  Channel,
  Publication,
  FilterRun,
  Vacancy,
  CandidateProfile,
  ReplyTask,
  Dispatch,
  ConversationMessage
} from "./types.js";

function getDatabaseSync(): new (path: string) => DatabaseSyncType {
  const req = createRequire(import.meta.url);
  return req("node:sqlite").DatabaseSync;
}

export class StorageEngine {
  public db: DatabaseSyncType;

  constructor(dbPath: string = ":memory:") {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    const DatabaseSync = getDatabaseSync();
    this.db = new DatabaseSync(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Pragmas for performance and data safety
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    // Schema DDL
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        username TEXT,
        channel_type TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_scanned_msg_id INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES channels(id),
        message_id INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        published_at TEXT NOT NULL,
        source_url TEXT,
        fingerprint TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'INGESTED',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_publications_channel ON publications(channel_id);
      CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);
      CREATE INDEX IF NOT EXISTS idx_publications_fingerprint ON publications(fingerprint);

      CREATE TABLE IF NOT EXISTS filter_runs (
        id TEXT PRIMARY KEY,
        publication_id TEXT NOT NULL REFERENCES publications(id),
        stage_index INTEGER NOT NULL,
        stage_name TEXT NOT NULL,
        passed INTEGER NOT NULL,
        reason TEXT,
        evaluated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_filter_runs_pub ON filter_runs(publication_id);

      CREATE TABLE IF NOT EXISTS vacancies (
        id TEXT PRIMARY KEY,
        publication_id TEXT UNIQUE NOT NULL REFERENCES publications(id),
        role_title TEXT,
        company_name TEXT,
        extracted_contact TEXT NOT NULL,
        contact_type TEXT NOT NULL,
        detected_stack TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        budget_info TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS candidate_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        summary TEXT NOT NULL,
        skills TEXT NOT NULL,
        portfolio_links TEXT NOT NULL,
        work_experience_facts TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reply_tasks (
        id TEXT PRIMARY KEY,
        vacancy_id TEXT UNIQUE NOT NULL REFERENCES vacancies(id),
        candidate_profile_id TEXT NOT NULL REFERENCES candidate_profiles(id),
        context_hash TEXT NOT NULL,
        draft_status TEXT NOT NULL DEFAULT 'PENDING',
        stale_reason TEXT,
        draft_text TEXT,
        operator_notes TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_reply_tasks_status ON reply_tasks(draft_status);

      CREATE TABLE IF NOT EXISTS dispatches (
        id TEXT PRIMARY KEY,
        reply_task_id TEXT NOT NULL REFERENCES reply_tasks(id),
        recipient_handle TEXT NOT NULL,
        recipient_tg_id TEXT,
        sent_text TEXT NOT NULL,
        tg_message_id INTEGER,
        sent_at TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        tg_message_id INTEGER NOT NULL,
        message_text TEXT NOT NULL,
        received_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_id ON conversation_messages(conversation_id);
    `);
  }

  // --- Channel Operations ---
  public upsertChannel(channel: Channel): void {
    const stmt = this.db.prepare(`
      INSERT INTO channels (id, title, username, channel_type, is_active, last_scanned_msg_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        username = excluded.username,
        is_active = excluded.is_active,
        last_scanned_msg_id = excluded.last_scanned_msg_id
    `);
    stmt.run(
      channel.id,
      channel.title,
      channel.username ?? null,
      channel.channelType,
      channel.isActive ? 1 : 0,
      channel.lastScannedMsgId
    );
  }

  public getActiveChannels(): Channel[] {
    const rows = this.db.prepare("SELECT * FROM channels WHERE is_active = 1").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      username: r.username,
      channelType: r.channel_type,
      isActive: Boolean(r.is_active),
      lastScannedMsgId: r.last_scanned_msg_id,
      createdAt: r.created_at
    }));
  }

  // --- Publication Operations ---
  public insertPublication(pub: Publication): boolean {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO publications (id, channel_id, message_id, raw_text, published_at, source_url, fingerprint, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        pub.id,
        pub.channelId,
        pub.messageId,
        pub.rawText,
        pub.publishedAt,
        pub.sourceUrl ?? null,
        pub.fingerprint,
        pub.status
      );
      return true;
    } catch (err: any) {
      if (err.message && err.message.includes("UNIQUE constraint failed: publications.fingerprint")) {
        return false; // Idempotent: already ingested
      }
      throw err;
    }
  }

  public getPublication(id: string): Publication | null {
    const row = this.db.prepare("SELECT * FROM publications WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      channelId: row.channel_id,
      messageId: row.message_id,
      rawText: row.raw_text,
      publishedAt: row.published_at,
      sourceUrl: row.source_url,
      fingerprint: row.fingerprint,
      status: row.status,
      createdAt: row.created_at
    };
  }

  public updatePublicationStatus(id: string, status: string): void {
    this.db.prepare("UPDATE publications SET status = ? WHERE id = ?").run(status, id);
  }

  // --- Filter Audit Operations ---
  public recordFilterRun(run: FilterRun): void {
    const stmt = this.db.prepare(`
      INSERT INTO filter_runs (id, publication_id, stage_index, stage_name, passed, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.id,
      run.publicationId,
      run.stageIndex,
      run.stageName,
      run.passed ? 1 : 0,
      run.reason ?? null
    );
  }

  public getFilterRunsForPublication(pubId: string): FilterRun[] {
    const rows = this.db.prepare("SELECT * FROM filter_runs WHERE publication_id = ? ORDER BY stage_index ASC").all(pubId) as any[];
    return rows.map((r) => ({
      id: r.id,
      publicationId: r.publication_id,
      stageIndex: r.stage_index,
      stageName: r.stage_name,
      passed: Boolean(r.passed),
      reason: r.reason,
      evaluatedAt: r.evaluated_at
    }));
  }

  // --- Vacancy Operations ---
  public insertVacancy(vac: Vacancy): boolean {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO vacancies (id, publication_id, role_title, company_name, extracted_contact, contact_type, detected_stack, tags, budget_info)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        vac.id,
        vac.publicationId,
        vac.roleTitle ?? null,
        vac.companyName ?? null,
        vac.extractedContact,
        vac.contactType,
        JSON.stringify(vac.detectedStack),
        JSON.stringify(vac.tags),
        vac.budgetInfo ?? null
      );
      return true;
    } catch (err: any) {
      if (err.message && err.message.includes("UNIQUE constraint failed: vacancies.publication_id")) {
        return false;
      }
      throw err;
    }
  }

  public getVacancy(id: string): Vacancy | null {
    const row = this.db.prepare("SELECT * FROM vacancies WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      publicationId: row.publication_id,
      roleTitle: row.role_title,
      companyName: row.company_name,
      extractedContact: row.extracted_contact,
      contactType: row.contact_type,
      detectedStack: JSON.parse(row.detected_stack || "[]"),
      tags: JSON.parse(row.tags || "[]"),
      budgetInfo: row.budget_info,
      createdAt: row.created_at
    };
  }

  // --- Candidate Profile Operations ---
  public upsertProfile(profile: CandidateProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO candidate_profiles (id, name, summary, skills, portfolio_links, work_experience_facts, is_default, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        summary = excluded.summary,
        skills = excluded.skills,
        portfolio_links = excluded.portfolio_links,
        work_experience_facts = excluded.work_experience_facts,
        is_default = excluded.is_default,
        version = candidate_profiles.version + 1,
        updated_at = datetime('now')
    `);
    stmt.run(
      profile.id,
      profile.name,
      profile.summary,
      JSON.stringify(profile.skills),
      JSON.stringify(profile.portfolioLinks),
      JSON.stringify(profile.workExperienceFacts),
      profile.isDefault ? 1 : 0,
      profile.version
    );
  }

  public getProfile(id: string): CandidateProfile | null {
    const row = this.db.prepare("SELECT * FROM candidate_profiles WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      summary: row.summary,
      skills: JSON.parse(row.skills),
      portfolioLinks: JSON.parse(row.portfolio_links),
      workExperienceFacts: JSON.parse(row.work_experience_facts),
      isDefault: Boolean(row.is_default),
      version: row.version,
      updatedAt: row.updated_at
    };
  }

  public getAllProfiles(): CandidateProfile[] {
    const rows = this.db.prepare("SELECT * FROM candidate_profiles").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      summary: r.summary,
      skills: JSON.parse(r.skills),
      portfolioLinks: JSON.parse(r.portfolio_links),
      workExperienceFacts: JSON.parse(r.work_experience_facts),
      isDefault: Boolean(r.is_default),
      version: r.version,
      updatedAt: r.updated_at
    }));
  }

  // --- Reply Tasks Operations ---
  public upsertReplyTask(task: ReplyTask): void {
    const stmt = this.db.prepare(`
      INSERT INTO reply_tasks (id, vacancy_id, candidate_profile_id, context_hash, draft_status, stale_reason, draft_text, operator_notes, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(vacancy_id) DO UPDATE SET
        candidate_profile_id = excluded.candidate_profile_id,
        context_hash = excluded.context_hash,
        draft_status = excluded.draft_status,
        stale_reason = excluded.stale_reason,
        draft_text = excluded.draft_text,
        operator_notes = excluded.operator_notes,
        reviewed_at = excluded.reviewed_at,
        updated_at = datetime('now')
    `);
    stmt.run(
      task.id,
      task.vacancyId,
      task.candidateProfileId,
      task.contextHash,
      task.draftStatus,
      task.staleReason ?? null,
      task.draftText ?? null,
      task.operatorNotes ?? null,
      task.reviewedAt ?? null
    );
  }

  public getReplyTask(id: string): ReplyTask | null {
    const row = this.db.prepare("SELECT * FROM reply_tasks WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      vacancyId: row.vacancy_id,
      candidateProfileId: row.candidate_profile_id,
      contextHash: row.context_hash,
      draftStatus: row.draft_status,
      staleReason: row.stale_reason,
      draftText: row.draft_text,
      operatorNotes: row.operator_notes,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  public getReplyTaskByVacancy(vacancyId: string): ReplyTask | null {
    const row = this.db.prepare("SELECT * FROM reply_tasks WHERE vacancy_id = ?").get(vacancyId) as any;
    if (!row) return null;
    return {
      id: row.id,
      vacancyId: row.vacancy_id,
      candidateProfileId: row.candidate_profile_id,
      contextHash: row.context_hash,
      draftStatus: row.draft_status,
      staleReason: row.stale_reason,
      draftText: row.draft_text,
      operatorNotes: row.operator_notes,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  public listReviewQueue(): Array<ReplyTask & { vacancy: Vacancy; publication: Publication; profile: CandidateProfile }> {
    const query = `
      SELECT 
        rt.id AS rt_id, rt.vacancy_id, rt.candidate_profile_id, rt.context_hash, rt.draft_status,
        rt.stale_reason, rt.draft_text, rt.operator_notes, rt.reviewed_at, rt.created_at AS rt_created_at, rt.updated_at AS rt_updated_at,
        v.id AS v_id, v.publication_id, v.role_title, v.company_name, v.extracted_contact, v.contact_type, v.detected_stack, v.tags, v.budget_info, v.created_at AS v_created_at,
        p.id AS p_id, p.channel_id, p.message_id, p.raw_text, p.published_at, p.source_url, p.fingerprint, p.status AS p_status, p.created_at AS p_created_at,
        cp.id AS cp_id, cp.name AS cp_name, cp.summary AS cp_summary, cp.skills AS cp_skills, cp.portfolio_links AS cp_portfolio_links, cp.work_experience_facts AS cp_work_experience_facts, cp.is_default AS cp_is_default, cp.version AS cp_version
      FROM reply_tasks rt
      JOIN vacancies v ON rt.vacancy_id = v.id
      JOIN publications p ON v.publication_id = p.id
      JOIN candidate_profiles cp ON rt.candidate_profile_id = cp.id
      ORDER BY rt.created_at DESC
    `;
    const rows = this.db.prepare(query).all() as any[];
    return rows.map((r) => ({
      id: r.rt_id,
      vacancyId: r.vacancy_id,
      candidateProfileId: r.candidate_profile_id,
      contextHash: r.context_hash,
      draftStatus: r.draft_status,
      staleReason: r.stale_reason,
      draftText: r.draft_text,
      operatorNotes: r.operator_notes,
      reviewedAt: r.reviewed_at,
      createdAt: r.rt_created_at,
      updatedAt: r.rt_updated_at,
      vacancy: {
        id: r.v_id,
        publicationId: r.publication_id,
        roleTitle: r.role_title,
        companyName: r.company_name,
        extractedContact: r.extracted_contact,
        contactType: r.contact_type,
        detectedStack: JSON.parse(r.detected_stack || "[]"),
        tags: JSON.parse(r.tags || "[]"),
        budgetInfo: r.budget_info,
        createdAt: r.v_created_at
      },
      publication: {
        id: r.p_id,
        channelId: r.channel_id,
        messageId: r.message_id,
        rawText: r.raw_text,
        publishedAt: r.published_at,
        sourceUrl: r.source_url,
        fingerprint: r.fingerprint,
        status: r.p_status,
        createdAt: r.p_created_at
      },
      profile: {
        id: r.cp_id,
        name: r.cp_name,
        summary: r.cp_summary,
        skills: JSON.parse(r.cp_skills),
        portfolioLinks: JSON.parse(r.cp_portfolio_links),
        workExperienceFacts: JSON.parse(r.cp_work_experience_facts),
        isDefault: Boolean(r.cp_is_default),
        version: r.cp_version
      }
    }));
  }

  // --- Dispatches ---
  public insertDispatch(dispatch: Dispatch): void {
    const stmt = this.db.prepare(`
      INSERT INTO dispatches (id, reply_task_id, recipient_handle, recipient_tg_id, sent_text, tg_message_id, sent_at, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      dispatch.id,
      dispatch.replyTaskId,
      dispatch.recipientHandle,
      dispatch.recipientTgId ?? null,
      dispatch.sentText,
      dispatch.tgMessageId ?? null,
      dispatch.sentAt ?? null,
      dispatch.status,
      dispatch.errorMessage ?? null
    );
  }

  public updateDispatchStatus(id: string, status: string, tgMessageId?: number, error?: string): void {
    const stmt = this.db.prepare(`
      UPDATE dispatches
      SET status = ?, tg_message_id = COALESCE(?, tg_message_id), error_message = ?, sent_at = CASE WHEN ? = 'CONFIRMED' THEN datetime('now') ELSE sent_at END
      WHERE id = ?
    `);
    stmt.run(status, tgMessageId ?? null, error ?? null, status, id);
  }

  // --- Conversation Messages ---
  public recordConversationMessage(msg: ConversationMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO conversation_messages (id, conversation_id, sender_type, tg_message_id, message_text, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(msg.id, msg.conversationId, msg.senderType, msg.tgMessageId, msg.messageText, msg.receivedAt);
  }

  public getConversationHistory(conversationId: string): ConversationMessage[] {
    const rows = this.db.prepare("SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY received_at ASC").all(conversationId) as any[];
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderType: r.sender_type,
      tgMessageId: r.tg_message_id,
      messageText: r.message_text,
      receivedAt: r.received_at,
      createdAt: r.created_at
    }));
  }

  public close(): void {
    this.db.close();
  }
}
