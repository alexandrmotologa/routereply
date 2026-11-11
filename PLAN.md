# RouteReply: Master Architecture & Implementation Plan
**From Telegram Publication to Reviewable Work Route and Human-Gated Dispatch**

> **Authoritative Specification & Execution Blueprint**  
> *Target Location:* `B:\workgit\routereply`  
> *Derived from:* "From Telegram Post to Reviewable Work Route—and a Reply That Still Needs a Human" (Andrew Celcumplit / Andrei Alfarank)  
> *Language & Conventions:* English code, docstrings, schema, and API contracts.

---

## 1. Executive Summary & Vision

### 1.1 The Core Problem
Freelance engineers, agencies, and job seekers frequently monitor 20–50+ Telegram channels and groups for inbound job posts, gigs, and contract opportunities. Traditional approaches suffer from two fatal extremes:
1. **Manual Fatigue:** Hours spent reading noisy channels, copy-pasting posts, searching for past portfolio links, and drafting custom messages.
2. **Blind AI Spamming:** Unbounded bots that automatically scrape and spam recruiter DMs without human oversight. This triggers Telegram spam bans (`FloodWait`, `PEER_FLOOD`), burns professional reputation, and outputs hallucinated AI text.

### 1.2 The RouteReply Solution
`RouteReply` is a **Human-in-the-Loop (HITL) Work Ingestion and Outreach Copilot**. It automates 90% of the cognitive overhead (scraping, filtering, contact extraction, CV matching, and draft preparation) while enforcing a strict **human verification and explicit manual dispatch barrier**.

```
[ Telegram Channels ]
         │
         ▼
[ Bounded Run Ingestion ] (Period-limited, operator-initiated)
         │
         ▼
[ Multi-Stage Explainable Filtering ] (Length ➔ Keywords ➔ Exclusions ➔ Contact Extractor)
         │
         ▼ (Idempotent Handoff)
[ Vacancy Record + CV/Profile Matching ] (Tag heuristics & semantic alignment)
         │
         ▼
[ Context-Aware Draft Generation ] (LLM prompted with exact CV facts & job context)
         │
         ▼ (Stale Draft Detection & Context Fingerprint)
[ Review Surface / Operator Queue ]
         │
 ┌───────┴─────────────────────────────┐
 │  OPERATOR ACTIONS:                  │
 │  • Inspect Provenance & Filter Path │
 │  • Review Matched CV & Facts        │
 │  • Edit Draft or Ask Clarification  │
 │  • Explicit Command: "APPROVE & SEND"│
 └───────┬─────────────────────────────┘
         │
         ▼ (Freshness Check + Rate-Limit Guard)
[ Telegram Dispatcher ] (MTProto Client / GramJS or Telethon)
         │
         ▼ (Recorded Server Confirmation)
[ Message ID & Conversation Tracker ]
```

---

## 2. Invariant Principles & Architectural Guardrails

1. **Bounded Run, Never an Uncontrolled Daemon:**
   - Ingestion is triggered for bounded intervals (e.g., "Process last 24 hours" or "Read up to 100 posts") with an operator run-control panel.
2. **Decoupled Responsibilities:**
   - The *Vacancies Module* owns collection, sanitization, filtering, and tag classification.
   - The *Replies Module* owns draft generation, context preservation, and communication state.
   - Neither module alters the internal state of the other. Handoffs are idempotent (duplicate publications are ignored).
3. **Strict Human Gate for External Communication:**
   - Under no circumstances does the system dispatch an external message to a Telegram contact automatically.
   - Dispatch requires an explicit UI action or CLI command by the operator.
4. **Draft Freshness & Stale-Draft Protection:**
   - Every draft has a `context_hash`.
   - If an incoming message arrives, the CV changes, or prompt rules are updated before dispatch, the draft is marked `STALE` and the send button is disabled until re-evaluated.
5. **Verifiable Delivery Boundary:**
   - Clicking "Send" is not proof of delivery. The system records an external Telegram `message_id` and server timestamp before marking a task as `DELIVERED`.
   - Interrupted or ambiguous sends are **never** blindly retried.

---

## 3. System Architecture & Components

```
┌────────────────────────────────────────────────────────────────────────┐
│                          OPERATOR DASHBOARD                            │
│  (Next.js 15 App Router / Tailwind CSS / Radix UI / Lucide Icons)      │
│  • Bounded Run Controller   • Step-by-Step Filter Funnel Visualizer    │
│  • Split-Screen Queue       • Live Telegram Health & Rate-Limit Gauges │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST / Server Actions / SSE
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           FASTIFY CORE API                             │
│  (Node.js TypeScript / Zod validation / Drizzle ORM / SQLite)          │
├───────────────────────────────────┬────────────────────────────────────┤
│ 1. VACANCIES ENGINE               │ 2. REPLIES & DRAFT COPILOT         │
│  • Telegram Ingest Worker (GramJS)│  • Context Assembler               │
│  • Multi-stage Filter Pipeline    │  • LLM Prompt Builder              │
│  • Contact & Entity Extractor     │  • Anti-Hallucination Validator    │
│  • Idempotent Handoff Service     │  • Stale Hash Guard                │
├───────────────────────────────────┴────────────────────────────────────┤
│ 3. DISPATCHER & CONVERSATION SYNC                                      │
│  • Telegram MTProto Client (Single Controller Lock)                    │
│  • Jittered Rate Limiter (90-240s) & Daily Caps (max 20 DMs/day)       │
│  • Confirmation & Conversation Threading Tracker                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │    LOCAL SQLITE STORE     │
                      │  (Better-SQLite3 / WAL)   │
                      └───────────────────────────┘
```

---

## 4. Database Schema (SQLite + Drizzle ORM)

```sql
-- 1. Monitored Telegram Sources
CREATE TABLE channels (
    id TEXT PRIMARY KEY,               -- e.g. "tg_channel_-100123456789"
    title TEXT NOT NULL,
    username TEXT,                     -- e.g. "remote_job_feed"
    channel_type TEXT NOT NULL,        -- 'channel', 'supergroup', 'group'
    is_active INTEGER DEFAULT 1,
    last_scanned_msg_id INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Raw Ingested Publications
CREATE TABLE publications (
    id TEXT PRIMARY KEY,               -- UUID or SHA256(channel_id + msg_id)
    channel_id TEXT NOT NULL REFERENCES channels(id),
    message_id INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    published_at DATETIME NOT NULL,
    source_url TEXT,
    fingerprint TEXT UNIQUE NOT NULL,  -- Normalized text hash for deduplication
    status TEXT NOT NULL DEFAULT 'INGESTED', -- 'INGESTED', 'FILTERED', 'DISCARDED', 'ACCEPTED'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Filter Stages & Step-by-Step Audit
CREATE TABLE filter_runs (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id),
    stage_index INTEGER NOT NULL,      -- 1: Length, 2: Keywords, 3: Exclusions, 4: Contacts
    stage_name TEXT NOT NULL,
    passed INTEGER NOT NULL,           -- 1 = true, 0 = false
    reason TEXT,                       -- e.g. "Matched negative keyword 'unpaid internship'"
    evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Accepted Vacancies (Upstream Output)
CREATE TABLE vacancies (
    id TEXT PRIMARY KEY,
    publication_id TEXT UNIQUE NOT NULL REFERENCES publications(id),
    role_title TEXT,
    company_name TEXT,
    extracted_contact TEXT,            -- e.g. "@recruiter_dev", "t.me/tech_hr"
    contact_type TEXT,                 -- 'telegram_user', 'telegram_bot', 'email', 'external_link'
    detected_stack TEXT,               -- JSON array: ["React", "TypeScript", "Node.js"]
    tags TEXT,                         -- JSON array: ["fullstack", "remote", "senior"]
    budget_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Candidate Profiles & CV Records (Context Store)
CREATE TABLE candidate_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,                -- e.g. "Fullstack AI Engineer"
    summary TEXT NOT NULL,
    skills TEXT NOT NULL,              -- JSON array: ["Next.js", "Python", "FastAPI"]
    portfolio_links TEXT,              -- JSON object: {"github": "...", "demo": "..."}
    work_experience_facts TEXT,        -- Structured facts for the LLM
    is_default INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Reply Tasks (The Downstream Route)
CREATE TABLE reply_tasks (
    id TEXT PRIMARY KEY,
    vacancy_id TEXT UNIQUE NOT NULL REFERENCES vacancies(id),
    candidate_profile_id TEXT NOT NULL REFERENCES candidate_profiles(id),
    context_hash TEXT NOT NULL,        -- SHA256(vacancy + profile + prompt_version)
    draft_status TEXT NOT NULL,        -- 'PENDING', 'DRAFTED', 'STALE', 'APPROVED', 'DISPATCHING', 'SENT', 'FAILED', 'REJECTED'
    stale_reason TEXT,
    draft_text TEXT,
    operator_notes TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Outbound Telegram Dispatches (Audit & Confirmation)
CREATE TABLE dispatches (
    id TEXT PRIMARY KEY,
    reply_task_id TEXT NOT NULL REFERENCES reply_tasks(id),
    recipient_handle TEXT NOT NULL,
    recipient_tg_id TEXT,
    sent_text TEXT NOT NULL,
    tg_message_id INTEGER,             -- Confirmed server ID from Telegram
    sent_at DATETIME,
    status TEXT NOT NULL,              -- 'PENDING', 'CONFIRMED', 'TIMEOUT', 'FAILED'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Synchronized Conversation History
CREATE TABLE conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,     -- tg_user_id or peer_id
    sender_type TEXT NOT NULL,         -- 'OUTBOUND_OPERATOR', 'INBOUND_RECRUITER'
    tg_message_id INTEGER NOT NULL,
    message_text TEXT NOT NULL,
    received_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. State Machines (FSM)

### 5.1 Publication Lifecycle
```
[ RAW POST ]
     │
     ▼
[ EVALUATING ] ── (Fails filter stage) ──► [ DISCARDED ] (Preserves failure reason)
     │
  (Passes all 4 filter stages)
     │
     ▼
[ ACCEPTED ]
     │
  (Idempotent Handoff)
     │
     ▼
[ HANDED_OFF ] ──► (Creates Vacancy & Queues Reply Task)
```

### 5.2 Reply Task Lifecycle & Freshness Rules
```
[ QUEUED ]
     │
     ▼
[ ASSEMBLING_CONTEXT ] (Fetches Vacancy + Matched CV Profile + Thread History)
     │
     ▼
[ MODEL_PROCESSING ] (LLM generates draft under strict anti-slop rules)
     │
     ▼
[ VALIDATION ] (Verify contact safety, length < 4096 chars, no placeholder leaks)
     │
     ▼
[ READY_FOR_REVIEW ] ◄────────────────────────────────────────┐
     │                                                        │
     ├── (Trigger: Recruiter replies OR Profile updated)      │
     │   │                                                    │
     │   ▼                                                    │
     │ [ STALE ] (Send disabled, prompt to regenerate) ───────┘
     │
     ├── (Operator rejects) ──► [ REJECTED ]
     │
     └── (Operator clicks "APPROVE & SEND")
         │
         ▼
     [ DISPATCHING ] (Pre-flight freshness check + single-controller lock)
         │
         ├── (Telegram confirms: tg_message_id received) ──► [ DELIVERED ]
         │
         └── (Error / Network Drop / FloodWait) ───────────► [ SEND_ERROR ]
             (Uncertain sends are NOT retried automatically)
```

---

## 6. Step-by-Step Explainable Filtering Pipeline

The filtering engine runs deterministically across 5 sequential gates:

| Stage | Name | Description | Failure Example |
|---|---|---|---|
| **Stage 1** | **Sanitization & Length** | Discards empty posts, forwarded memes, bot spam, and messages under 60 chars or over 5000 chars. | `"Join our crypto trading group..."` (Spam detection) |
| **Stage 2** | **Role & Domain Match** | Positive keyword matching against target tech stack (e.g., `Node`, `React`, `Python`, `Fullstack`, `AI`). | Post looking for `"Accountant"` or `"Sales Rep"`. |
| **Stage 3** | **Exclusion & Negative Filters** | Explicit exclusion rules: `"unpaid"`, `"internship"`, `"100% commission"`, `"PHP 5.4"`, `"relocation required to Munich"`. | `"Unpaid 3-month trial for beginners."` |
| **Stage 4** | **Contact Resolution** | Regex parsing to extract viable contacts (`@username`, `t.me/username`, `hr@company.com`). | Post with zero contact method (comment section only). |
| **Stage 5** | **Profile & CV Association** | Scores relevance against candidate profiles and maps the best-fitting CV profile ID. | Assigns `Senior Fullstack CV` over `Junior Mobile CV`. |

---

## 7. Context-Aware Prompt & Anti-Slop Drafting Guidelines

The LLM drafting service uses the following strict guidelines:
- **No Clichés:** Forbid phrases like *"I came across your exciting post"*, *"I believe I am the ideal candidate"*, *"Hope this message finds you well"*.
- **Direct & Proof-First:**
  1. Mention the specific role from the post.
  2. Cite 1–2 relevant production achievements from the matched CV.
  3. Include the designated portfolio/GitHub link.
  4. End with a low-friction question: *"Are you available for a brief chat this Thursday?"*
- **Length Constraint:** Max 3–4 short sentences (under 120 words). Telegram recruiters read on mobile screens.
- **Uncertainty Gate:** If budget, tech stack, or seniority is ambiguous, the model must output an operator flag: `[NEEDS_OPERATOR_INPUT: "Inquire about contract vs FTE"]`.

---

## 8. Safety, Anti-Ban & Operational Invariants

Telegram operates aggressive spam heuristics on direct messages sent to non-mutual contacts (`PEER_FLOOD`). To maintain complete account health:

1. **Jittered Cadence:** Minimum delay between dispatches: **90s to 240s** randomized.
2. **Strict Daily Outreach Caps:** Maximum **15 to 20 initial outreach DMs per day per account**.
3. **FloodWait Handler:** If Telegram returns `FLOOD_WAIT_X`, immediately pause all dispatches for `X + 30` seconds and alert the operator.
4. **Peer Check:** Before queuing dispatch, resolve the username. If the user account has privacy settings disallowing DMs from non-contacts, mark as `REQUIRES_MANUAL_INVITE` instead of failing.
5. **Channel Join Quarantine:** If a channel requires joining before contacting members, log and delay contact to avoid rapid join-and-DM bot patterns.

---

## 9. Value-Add Improvements Beyond the Original Article

1. **Multi-CV / Multi-Persona Switcher:**
   - Operators can switch the matched CV with a single click in the UI, which instantly invalidates the draft and generates a new one aligned with that specific persona.
2. **Multi-Channel Fallback Routing:**
   - When a publication has an **Email** or **Google Form** instead of a Telegram username, route it to an `"Email Tasks"` queue with a pre-filled mailto/draft instead of discarding it.
3. **Synthetic Fixture Test Suite:**
   - End-to-end acceptance tests utilizing 20 mock Telegram publications (10 passing, 10 failing various stages) to test filtering, handoff, stale invalidation, and dispatch doubles without needing a live Telegram connection.
4. **Local LLM Fallback (Privacy & Offline Mode):**
   - Seamless switching between Cloud LLM (Gemini / Claude / OpenAI) and local Ollama (`qwen2.5:14b` or `mistral-small`) for zero API fees and privacy.

---

## 10. Step-by-Step Implementation Roadmap

```
Phase 1: Project Scaffold, SQLite Schema & Fixture Dataset
  ├── Setup Node.js TypeScript project in B:\workgit\routereply
  ├── Drizzle ORM configuration + SQLite Better3 DB with migrations
  └── Seed synthetic fixture dataset (channels, raw publications, CV profiles)

Phase 2: Ingestion & Explainable Multi-Stage Filtering
  ├── GramJS MTProto client service with bounded-run controls
  ├── 5-stage filter pipeline with stage-by-stage audit logger (filter_runs)
  └── Idempotent handoff service to vacancies table

Phase 3: Context Assembler, LLM Copilot & Stale Protection
  ├── CV profile & skills matcher
  ├── Context hashing engine (SHA-256 fingerprinting)
  ├── LLM draft generator with anti-slop rules
  └── Stale draft detection trigger on context/conversation update

Phase 4: Operator Dashboard (Next.js / Tailwind / Shadcn UI)
  ├── Bounded run period controls (Start / Pause / Progress)
  ├── Filter Funnel Inspector (Visual audit of discarded items)
  ├── Split-screen review queue (Original post vs. editable draft + CV)
  └── Single-click "Approve & Send" with instant optimistic status

Phase 5: Telegram Dispatcher & Server Confirmation
  ├── Secure MTProto dispatch worker with single-controller lock
  ├── Jittered rate limiter (90-240s) + FloodWait safety interceptor
  ├── Confirmed message ID persistence
  └── Inbound conversation sync & follow-up queue

Phase 6: Verification, Documentation & Fixture Testing
  ├── E2E acceptance test suite with test doubles
  ├── Humanized README.md with architecture diagrams & setup guide
  └── Production packaging (Docker Compose or single-command local run)
```
