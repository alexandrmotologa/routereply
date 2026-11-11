import fastify from "fastify";
import cors from "@fastify/cors";
import path from "node:path";
import { StorageEngine } from "../core/db.js";
import { DispatchRateLimiter } from "../dispatcher/rate-limiter.js";
import { TelegramDispatcher } from "../dispatcher/sender.js";
import { registerRoutes } from "./routes.js";
import { loadConfig } from "../core/config.js";

export async function createServer(dbPath: string = ":memory:") {
  const app = fastify({ logger: false });
  await app.register(cors, { origin: true });

  const storage = new StorageEngine(dbPath);
  const rateLimiter = new DispatchRateLimiter();
  const dispatcher = new TelegramDispatcher(storage, rateLimiter);

  registerRoutes(app, storage, rateLimiter, dispatcher);

  // Serve Embedded Operator Dashboard at root
  app.get("/", async (req, reply) => {
    reply.type("text/html");
    return getDashboardHtml();
  });

  return { app, storage, rateLimiter, dispatcher };
}

function getDashboardHtml(): string {
  const config = loadConfig();
  const isLive = config.telegram.mode === "live";
  const provider = config.llm.provider.toUpperCase();

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RouteReply - Telegram Ingestion & Reviewable Work Route</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #080c14; color: #f1f5f9; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .card { background-color: #0f172a; border: 1px solid #1e293b; }
    .badge-dev { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); }
    .badge-stale { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); }
    .badge-fresh { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.35); }
    .badge-sent { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); }
    .badge-live { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0b0f17; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }
  </style>
</head>
<body class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-screen flex flex-col justify-between">
  <div>
    <!-- Top Navigation & Health Bar -->
    <header class="flex flex-col md:flex-row items-start md:items-center justify-between pb-5 border-b border-slate-800 gap-4">
      <div>
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-white">RouteReply</h1>
          <span class="px-2.5 py-0.5 text-[11px] font-semibold rounded-full badge-dev whitespace-nowrap">HITL Work Copilot</span>
          <span class="px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${isLive ? 'badge-live' : 'badge-dev'} whitespace-nowrap">
            ${isLive ? '● LIVE MTPROTO' : '○ SIMULATION SAFE MODE'}
          </span>
          <span class="text-xs text-slate-400 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 whitespace-nowrap">AI: ${provider}</span>
        </div>
        <p class="text-xs sm:text-sm text-slate-400 mt-1">From Telegram post to reviewable work route and human-gated dispatch</p>
      </div>

      <!-- Live Telegram Gauges -->
      <div class="flex flex-wrap items-center gap-3 sm:gap-4 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center gap-2 shrink-0">
          <span class="w-2.5 h-2.5 rounded-full ${isLive ? 'bg-purple-500 animate-pulse' : 'bg-emerald-500'}"></span>
          <span class="text-slate-300 font-medium">Dispatcher: <strong class="${isLive ? 'text-purple-400' : 'text-emerald-400'}">${isLive ? 'Live MTProto' : 'Verified Sandbox'}</strong></span>
        </div>
        <div class="border-l border-slate-700/80 pl-3 shrink-0">
          <span class="text-slate-400">Daily DMs: </span>
          <span id="daily-count" class="font-bold text-white font-mono">0 / 20</span>
        </div>
        <div class="border-l border-slate-700/80 pl-3 shrink-0">
          <span class="text-slate-400">FloodWait: </span>
          <span id="flood-wait" class="font-bold text-emerald-400 font-mono">0s</span>
        </div>
      </div>
    </header>

    <!-- Controls & Action Surfaces -->
    <div class="my-5 grid grid-cols-1 md:grid-cols-12 gap-4">
      <!-- Bounded Run Control -->
      <section class="md:col-span-8 p-4 sm:p-5 card rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-white flex items-center gap-2">
              <span>Bounded Ingestion Run</span>
              <span class="text-[11px] font-normal text-slate-400">(Operator-initiated)</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">Collect publications, run 5-stage explainable filters, and prepare draft context.</p>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <select id="run-hours" class="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 shrink-0">
              <option value="6">Last 6 Hours</option>
              <option value="24" selected>Last 24 Hours</option>
              <option value="48">Last 48 Hours</option>
            </select>
            <button id="btn-run" onclick="triggerBoundedRun()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-sm">
              <span>Start Bounded Run</span>
            </button>
          </div>
        </div>
        <div id="run-summary" class="hidden mt-3 pt-3 border-t border-slate-800 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3"></div>
      </section>

      <!-- Manage Rules & Personas Triggers -->
      <section class="md:col-span-4 p-4 sm:p-5 card rounded-xl shadow-sm flex flex-col justify-between gap-2.5">
        <div>
          <h3 class="text-sm font-semibold text-white">System Controls</h3>
          <p class="text-xs text-slate-400 mt-0.5">Manage filter keywords, exclusions, and candidate CV personas.</p>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-1">
          <button onclick="toggleRulesModal()" class="px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors text-center truncate">
            Filter Rules
          </button>
          <button onclick="togglePersonasModal()" class="px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors text-center truncate">
            CV Personas
          </button>
        </div>
      </section>
    </div>

    <!-- Review Queue Layout -->
    <main class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- Queue Sidebar -->
      <aside class="lg:col-span-5 flex flex-col gap-3">
        <!-- Search and Filter Bar -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">Review Queue</h3>
            <span id="queue-badge" class="px-2 py-0.5 text-[11px] rounded-full bg-slate-800 text-slate-300 font-mono">0 items</span>
          </div>
          <!-- Filter Tabs -->
          <div class="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-[11px]">
            <button onclick="setStatusFilter('ALL')" id="filter-all" class="px-2.5 py-1 rounded font-medium bg-blue-600 text-white transition-colors">All</button>
            <button onclick="setStatusFilter('READY')" id="filter-ready" class="px-2.5 py-1 rounded font-medium text-slate-400 hover:text-white transition-colors">Ready</button>
            <button onclick="setStatusFilter('STALE')" id="filter-stale" class="px-2.5 py-1 rounded font-medium text-slate-400 hover:text-white transition-colors">Stale</button>
            <button onclick="setStatusFilter('SENT')" id="filter-sent" class="px-2.5 py-1 rounded font-medium text-slate-400 hover:text-white transition-colors">Sent</button>
          </div>
          <!-- Search Input -->
          <input id="search-input" oninput="applyFilters()" type="text" placeholder="Search contact, role, or stack..." class="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>

        <!-- Scrollable Queue Cards -->
        <div id="queue-list" class="flex flex-col gap-2.5 max-h-[600px] overflow-y-auto pr-1">
          <div class="text-xs text-slate-500 p-6 text-center">Loading queue...</div>
        </div>
      </aside>

      <!-- Detail Review Surface -->
      <section class="lg:col-span-7 card rounded-xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
        <div id="detail-view" class="h-full flex flex-col justify-center items-center text-slate-500 text-xs text-center p-8">
          Select a task from the review queue to inspect provenance, matched CV facts, and authorize human-gated dispatch.
        </div>
      </section>
    </main>
  </div>

  <!-- Filter Rules Modal -->
  <div id="rules-modal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-700 rounded-xl p-5 sm:p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-base font-bold text-white">Manage Filter Rules</h3>
        <button onclick="toggleRulesModal()" class="text-slate-400 hover:text-white text-xs font-mono">&times; Close</button>
      </div>

      <div class="flex gap-2">
        <select id="new-rule-type" class="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none">
          <option value="keyword">Target Keyword (+)</option>
          <option value="exclusion">Exclusion (-)</option>
        </select>
        <input id="new-rule-pattern" type="text" placeholder="e.g. rust, golang, wordpress" class="flex-1 bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        <button onclick="addNewRule()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shrink-0">Add</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">Target Keywords</h4>
          <div id="rules-keywords-list" class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800"></div>
        </div>
        <div>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2">Disqualifying Exclusions</h4>
          <div id="rules-exclusions-list" class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Candidate Personas Modal -->
  <div id="personas-modal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-700 rounded-xl p-5 sm:p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-base font-bold text-white">Candidate Personas & CV Profiles</h3>
          <p class="text-xs text-slate-400 mt-0.5">Manage target personas for intelligent skill matching and draft generation.</p>
        </div>
        <button onclick="togglePersonasModal()" class="text-slate-400 hover:text-white text-xs font-mono">&times; Close</button>
      </div>

      <!-- Add New Persona Form -->
      <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
        <h4 class="text-xs font-semibold text-slate-200 uppercase tracking-wider">Add or Update Persona</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input id="persona-id" type="text" placeholder="Profile ID (e.g. prof_rust_dev)" class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
          <input id="persona-name" type="text" placeholder="Display Title (e.g. Senior Rust Engineer)" class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        </div>
        <input id="persona-skills" type="text" placeholder="Skills comma-separated (e.g. Rust, Tokio, Axum, SQLite)" class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
        <textarea id="persona-summary" rows="2" placeholder="Summary statement for context..." class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500"></textarea>
        <textarea id="persona-facts" rows="2" placeholder="Key facts / achievements (one per line)..." class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500"></textarea>
        <div class="flex justify-end">
          <button onclick="savePersona()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">Save Persona</button>
        </div>
      </div>

      <!-- Existing Personas List -->
      <div class="mt-2">
        <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registered Personas</h4>
        <div id="personas-container" class="flex flex-col gap-2"></div>
      </div>
    </div>
  </div>

  <footer class="mt-8 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
    RouteReply &bull; Human-in-the-Loop Telegram Outreach Engine &bull; Safe MTProto Dispatch
  </footer>

  <script>
    let currentTasks = [];
    let filteredTasks = [];
    let selectedTaskId = null;
    let candidateProfiles = [];
    let activeStatusFilter = 'ALL';

    async function loadData() {
      try {
        const [healthRes, queueRes, profilesRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/queue'),
          fetch('/api/profiles')
        ]);
        const health = await healthRes.json();
        const queue = await queueRes.json();
        candidateProfiles = await profilesRes.json();

        document.getElementById('daily-count').textContent = health.rateLimiter.dailyCount + ' / ' + health.rateLimiter.maxDaily;
        document.getElementById('flood-wait').textContent = health.rateLimiter.floodWaitRemainingSec + 's';

        currentTasks = queue;
        applyFilters();

        if (selectedTaskId) {
          const updated = queue.find(t => t.id === selectedTaskId);
          if (updated) renderDetailView(updated);
        } else if (filteredTasks.length > 0) {
          selectTask(filteredTasks[0].id);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }

    function setStatusFilter(status) {
      activeStatusFilter = status;
      ['all', 'ready', 'stale', 'sent'].forEach(s => {
        const btn = document.getElementById('filter-' + s);
        if (s === status.toLowerCase()) {
          btn.className = 'px-2.5 py-1 rounded font-medium bg-blue-600 text-white transition-colors';
        } else {
          btn.className = 'px-2.5 py-1 rounded font-medium text-slate-400 hover:text-white transition-colors';
        }
      });
      applyFilters();
    }

    function applyFilters() {
      const q = document.getElementById('search-input').value.toLowerCase().trim();
      filteredTasks = currentTasks.filter(t => {
        const isStale = !t.isFresh || t.draftStatus === 'STALE';
        const isSent = t.draftStatus === 'SENT';
        const isReady = !isSent && !isStale;

        if (activeStatusFilter === 'READY' && !isReady) return false;
        if (activeStatusFilter === 'STALE' && !isStale) return false;
        if (activeStatusFilter === 'SENT' && !isSent) return false;

        if (q) {
          const contact = (t.vacancy.extractedContact || '').toLowerCase();
          const role = (t.vacancy.roleTitle || '').toLowerCase();
          const text = (t.publication.rawText || '').toLowerCase();
          const stack = (t.vacancy.detectedStack || []).join(' ').toLowerCase();
          if (!contact.includes(q) && !role.includes(q) && !text.includes(q) && !stack.includes(q)) {
            return false;
          }
        }
        return true;
      });

      document.getElementById('queue-badge').textContent = filteredTasks.length + ' / ' + currentTasks.length;
      renderQueueList();
    }

    function renderQueueList() {
      const container = document.getElementById('queue-list');
      if (filteredTasks.length === 0) {
        container.innerHTML = '<div class="text-xs text-slate-500 p-6 text-center card rounded-xl">No tasks matching current filter.</div>';
        return;
      }

      container.innerHTML = filteredTasks.map(t => {
        const isSelected = t.id === selectedTaskId;
        const isStale = !t.isFresh || t.draftStatus === 'STALE';
        const isSent = t.draftStatus === 'SENT';
        const badgeClass = isSent ? 'badge-sent' : isStale ? 'badge-stale' : 'badge-fresh';
        const badgeText = isSent ? 'SENT' : isStale ? 'STALE' : 'READY';

        return \`
          <div onclick="selectTask('\${t.id}')" class="cursor-pointer p-3.5 rounded-xl border transition-all \${isSelected ? 'bg-slate-800/90 border-blue-500 shadow-sm' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}">
            <div class="flex items-start justify-between gap-2">
              <span class="text-xs font-bold text-white truncate max-w-[200px]">\${t.vacancy.roleTitle || 'Opportunity'}</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full \${badgeClass} shrink-0">\${badgeText}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1 flex items-center gap-1.5 truncate">
              <span class="text-blue-400 font-mono shrink-0">\${t.vacancy.extractedContact}</span>
              <span class="text-slate-600">&bull;</span>
              <span class="truncate">\${t.vacancy.budgetInfo || 'Rate not specified'}</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">\${t.publication.rawText}</div>
          </div>
        \`;
      }).join('');
    }

    function selectTask(taskId) {
      selectedTaskId = taskId;
      renderQueueList();
      const task = currentTasks.find(t => t.id === taskId);
      if (task) renderDetailView(task);
    }

    function renderDetailView(task) {
      const container = document.getElementById('detail-view');
      const isSent = task.draftStatus === 'SENT';
      const isStale = !task.isFresh || task.draftStatus === 'STALE';

      const profileOptions = candidateProfiles.map(p =>
        \`<option value="\${p.id}" \${p.id === task.candidateProfileId ? 'selected' : ''}>\${p.name}</option>\`
      ).join('');

      container.innerHTML = \`
        <div class="w-full h-full flex flex-col justify-between gap-4">
          <div>
            <!-- Header & Recipient -->
            <div class="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-800 pb-3 gap-2">
              <div>
                <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Target Contact</span>
                <div class="flex items-center gap-2 mt-0.5">
                  <h2 class="text-base sm:text-lg font-bold text-white font-mono truncate">\${task.vacancy.extractedContact}</h2>
                  <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] shrink-0">\${task.vacancy.contactType}</span>
                </div>
                <div class="text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-2">
                  <span>Persona:</span>
                  <select onchange="switchPersona('\${task.id}', this.value)" class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none">
                    \${profileOptions}
                  </select>
                </div>
              </div>
              <div class="sm:text-right shrink-0">
                <span class="text-[10px] text-slate-500 font-mono">Context: \${task.contextHash.slice(0, 10)}...</span>
                <div class="mt-1">
                  \${isSent ? '<span class="text-xs text-purple-400 font-bold">✓ DELIVERED TO TELEGRAM</span>' : isStale ? '<span class="text-xs text-red-400 font-bold">⚠ STALE DRAFT (BLOCKED)</span>' : '<span class="text-xs text-emerald-400 font-bold">● READY FOR DISPATCH</span>'}
                </div>
              </div>
            </div>

            <!-- Provenance & Source Text -->
            <div class="mt-3.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Originating Telegram Publication</span>
              <p class="text-xs text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">\${task.publication.rawText}</p>
            </div>

            <!-- Editable Draft Section -->
            <div class="mt-4">
              <div class="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <span class="text-xs font-semibold text-slate-300">Context-Aware Outreach Draft</span>
                <div class="flex items-center gap-2">
                  <select id="ai-provider" class="bg-slate-900 border border-slate-700 text-slate-300 text-[11px] rounded px-2 py-1">
                    <option value="gemini">Gemini API</option>
                    <option value="ollama">Ollama Local</option>
                    <option value="deterministic">Deterministic Fast</option>
                  </select>
                  <button onclick="regenerateDraft('\${task.id}')" \${isSent ? 'disabled' : ''} class="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium disabled:opacity-40">
                    Regenerate AI
                  </button>
                </div>
              </div>
              <textarea id="draft-text" rows="5" \${isSent ? 'disabled' : ''} class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 leading-relaxed font-sans focus:outline-none focus:border-blue-500 disabled:opacity-60 resize-none">\${task.draftText || ''}</textarea>
            </div>
          </div>

          <!-- Human Action Control Footer -->
          <div class="pt-3 border-t border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
            <button onclick="rejectTask('\${task.id}')" \${isSent ? 'disabled' : ''} class="w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/40 border border-rose-900/60 transition-colors disabled:opacity-40 shrink-0">
              Reject Lead
            </button>
            <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button onclick="saveDraft('\${task.id}')" \${isSent ? 'disabled' : ''} class="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors disabled:opacity-40 shrink-0">
                Save Draft
              </button>
              <button onclick="dispatchTask('\${task.id}')" \${isSent || isStale ? 'disabled' : ''} class="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5">
                <span>Approve & Send</span>
              </button>
            </div>
          </div>
        </div>
      \`;
    }

    async function switchPersona(taskId, profileId) {
      await fetch(\`/api/tasks/\${taskId}/update-draft\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateProfileId: profileId })
      });
      await loadData();
    }

    async function regenerateDraft(taskId) {
      const provider = document.getElementById('ai-provider').value;
      const res = await fetch(\`/api/tasks/\${taskId}/regenerate\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (data.task) {
        document.getElementById('draft-text').value = data.task.draftText;
        await loadData();
      }
    }

    async function triggerBoundedRun() {
      const btn = document.getElementById('btn-run');
      btn.disabled = true;
      btn.innerHTML = '<span>Processing...</span>';

      const hours = parseInt(document.getElementById('run-hours').value, 10);
      try {
        const res = await fetch('/api/runs/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sinceHours: hours })
        });
        const summary = await res.json();

        const sumBox = document.getElementById('run-summary');
        sumBox.classList.remove('hidden');
        sumBox.innerHTML = \`
          <div><span class="text-slate-400">Scanned:</span> <strong class="text-white font-mono">\${summary.publicationsIngested}</strong></div>
          <div><span class="text-slate-400">Accepted:</span> <strong class="text-emerald-400 font-mono">\${summary.acceptedCount}</strong></div>
          <div><span class="text-slate-400">Discarded:</span> <strong class="text-rose-400 font-mono">\${summary.discardedCount}</strong></div>
          <div><span class="text-slate-400">Drafts Ready:</span> <strong class="text-blue-400 font-mono">\${summary.draftsPrepared}</strong></div>
        \`;

        await loadData();
      } catch (err) {
        alert('Run failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Start Bounded Run</span>';
      }
    }

    async function saveDraft(taskId) {
      const text = document.getElementById('draft-text').value;
      await fetch(\`/api/tasks/\${taskId}/update-draft\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftText: text })
      });
      await loadData();
    }

    async function rejectTask(taskId) {
      if (!confirm('Discard this lead and cancel draft?')) return;
      await fetch(\`/api/tasks/\${taskId}/reject\`, { method: 'POST' });
      await loadData();
    }

    async function dispatchTask(taskId) {
      if (!confirm('Explicit Command Confirmation: Send this approved draft to Telegram now?')) return;
      try {
        const res = await fetch(\`/api/tasks/\${taskId}/dispatch\`, { method: 'POST' });
        const result = await res.json();
        if (result.error) {
          alert('Dispatch Blocked: ' + result.error);
        } else {
          alert('✓ Confirmed by Telegram Server! Message ID: ' + result.tgMessageId + (result.isRealDispatch ? ' (Live MTProto)' : ' (Verified Sandbox)'));
        }
        await loadData();
      } catch (err) {
        alert('Network or dispatch error: ' + err.message);
      }
    }

    function toggleRulesModal() {
      const modal = document.getElementById('rules-modal');
      modal.classList.toggle('hidden');
      if (!modal.classList.contains('hidden')) {
        loadRules();
      }
    }

    async function loadRules() {
      const res = await fetch('/api/rules');
      const data = await res.json();
      const kwContainer = document.getElementById('rules-keywords-list');
      const excContainer = document.getElementById('rules-exclusions-list');

      kwContainer.innerHTML = data.keywords.map(k => \`
        <span class="inline-flex items-center gap-1 text-[11px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded-full shrink-0">
          \${k}
          <button onclick="removeRule('keyword', '\${k}')" class="hover:text-white font-bold ml-1">&times;</button>
        </span>
      \`).join('');

      excContainer.innerHTML = data.exclusions.map(e => \`
        <span class="inline-flex items-center gap-1 text-[11px] bg-rose-950/60 text-rose-300 border border-rose-800/80 px-2 py-0.5 rounded-full shrink-0">
          \${e}
          <button onclick="removeRule('exclusion', '\${e}')" class="hover:text-white font-bold ml-1">&times;</button>
        </span>
      \`).join('');
    }

    async function addNewRule() {
      const type = document.getElementById('new-rule-type').value;
      const pattern = document.getElementById('new-rule-pattern').value.trim();
      if (!pattern) return;
      await fetch('/api/rules/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, pattern })
      });
      document.getElementById('new-rule-pattern').value = '';
      await loadRules();
    }

    async function removeRule(type, pattern) {
      await fetch('/api/rules/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, pattern })
      });
      await loadRules();
    }

    function togglePersonasModal() {
      const modal = document.getElementById('personas-modal');
      modal.classList.toggle('hidden');
      if (!modal.classList.contains('hidden')) {
        renderPersonasManager();
      }
    }

    function renderPersonasManager() {
      const container = document.getElementById('personas-container');
      container.innerHTML = candidateProfiles.map(p => \`
        <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white">\${p.name}</span>
              <span class="text-[10px] font-mono text-slate-400">(\${p.id})</span>
              \${p.isDefault ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-300 border border-blue-800">DEFAULT</span>' : ''}
            </div>
            <p class="text-[11px] text-slate-400 mt-1 line-clamp-1">\${p.summary}</p>
            <div class="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-1">
              \${p.skills.slice(0, 6).map(s => \`<span class="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">\${s}</span>\`).join('')}
            </div>
          </div>
          <button onclick="deletePersona('\${p.id}')" class="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded border border-rose-900/60 shrink-0">Delete</button>
        </div>
      \`).join('');
    }

    async function savePersona() {
      const id = document.getElementById('persona-id').value.trim();
      const name = document.getElementById('persona-name').value.trim();
      const skillsStr = document.getElementById('persona-skills').value.trim();
      const summary = document.getElementById('persona-summary').value.trim();
      const factsStr = document.getElementById('persona-facts').value.trim();

      if (!id || !name) {
        alert('ID and Name are required.');
        return;
      }

      const skills = skillsStr.split(',').map(s => s.trim()).filter(Boolean);
      const workExperienceFacts = factsStr.split('\\n').map(f => f.trim()).filter(Boolean);

      await fetch('/api/profiles/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          summary,
          skills,
          portfolioLinks: { github: "https://github.com/alexandrmotologa" },
          workExperienceFacts,
          isDefault: false
        })
      });

      document.getElementById('persona-id').value = '';
      document.getElementById('persona-name').value = '';
      document.getElementById('persona-skills').value = '';
      document.getElementById('persona-summary').value = '';
      document.getElementById('persona-facts').value = '';

      await loadData();
      renderPersonasManager();
    }

    async function deletePersona(id) {
      if (!confirm(\`Delete persona "\${id}"?\`)) return;
      await fetch(\`/api/profiles/\${id}\`, { method: 'DELETE' });
      await loadData();
      renderPersonasManager();
    }

    // Auto-refresh every 10 seconds
    setInterval(loadData, 10000);
    loadData();
  </script>
</body>
</html>`;
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const dbPath = path.resolve(process.cwd(), "routereply.db");
  createServer(dbPath).then(({ app }) => {
    app.listen({ port: 3333, host: "0.0.0.0" }, (err, address) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(`[RouteReply API & Dashboard] Running at ${address}`);
    });
  });
}
