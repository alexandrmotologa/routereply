import fastify from "fastify";
import cors from "@fastify/cors";
import path from "node:path";
import { StorageEngine } from "../core/db.js";
import { DispatchRateLimiter } from "../dispatcher/rate-limiter.js";
import { TelegramDispatcher } from "../dispatcher/sender.js";
import { registerRoutes } from "./routes.js";
import { seedDatabase } from "../fixtures/seed.js";

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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RouteReply - Telegram Ingestion & Reviewable Work Route</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f17; color: #f1f5f9; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .badge-dev { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge-stale { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-fresh { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); }
    .card { background-color: #131c2e; border: 1px solid #1e293b; }
  </style>
</head>
<body class="p-6 max-w-7xl mx-auto">
  <!-- Top Navigation & Health Bar -->
  <header class="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold tracking-tight text-white">RouteReply</h1>
        <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full badge-dev">HITL Work Copilot</span>
        <span class="text-xs text-slate-400">Node.js + MTProto Guard</span>
      </div>
      <p class="text-sm text-slate-400 mt-1">From Telegram post to reviewable work route and human-gated dispatch</p>
    </div>

    <!-- Live Telegram Gauges -->
    <div class="flex items-center gap-4 bg-slate-900/80 px-4 py-2.5 rounded-lg border border-slate-800 text-xs">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="text-slate-300 font-medium">Telegram MTProto: <strong class="text-emerald-400">Online</strong></span>
      </div>
      <div class="border-l border-slate-700 pl-4">
        <span class="text-slate-400">Daily DMs: </span>
        <span id="daily-count" class="font-bold text-white">0 / 20</span>
      </div>
      <div class="border-l border-slate-700 pl-4">
        <span class="text-slate-400">FloodWait: </span>
        <span id="flood-wait" class="font-bold text-emerald-400">0s</span>
      </div>
    </div>
  </header>

  <!-- Bounded Run Control Surface -->
  <section class="my-6 p-5 card rounded-xl shadow-lg">
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <h2 class="text-base font-semibold text-white flex items-center gap-2">
          <span>Bounded Ingestion Run</span>
          <span class="text-xs font-normal text-slate-400">(Operator-initiated, non-continuous)</span>
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">Collect publications, run multi-stage explainable filters, and prepare draft context.</p>
      </div>
      <div class="flex items-center gap-3">
        <select id="run-hours" class="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2">
          <option value="6">Last 6 Hours</option>
          <option value="24" selected>Last 24 Hours</option>
          <option value="48">Last 48 Hours</option>
        </select>
        <button id="btn-run" onclick="triggerBoundedRun()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
          <span>Start Bounded Run</span>
        </button>
      </div>
    </div>
    <div id="run-summary" class="hidden mt-4 pt-4 border-t border-slate-800 text-xs grid grid-cols-2 sm:grid-cols-4 gap-4"></div>
  </section>

  <!-- Review Queue Layout -->
  <main class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Queue Sidebar -->
    <aside class="lg:col-span-5 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-slate-400">Review Queue</h3>
        <span id="queue-badge" class="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">0 items</span>
      </div>
      <div id="queue-list" class="flex flex-col gap-3 max-h-[750px] overflow-y-auto pr-1">
        <div class="text-sm text-slate-500 p-4 text-center">Loading queue...</div>
      </div>
    </aside>

    <!-- Detail Review Surface -->
    <section class="lg:col-span-7 card rounded-xl p-6 shadow-xl flex flex-col">
      <div id="detail-view" class="h-full flex flex-col justify-center items-center text-slate-500 text-sm">
        Select a task from the queue to inspect provenance, matched CV facts, and authorize dispatch.
      </div>
    </section>
  </main>

  <script>
    let currentTasks = [];
    let selectedTaskId = null;

    async function loadData() {
      try {
        const [healthRes, queueRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/queue')
        ]);
        const health = await healthRes.json();
        const queue = await queueRes.json();

        document.getElementById('daily-count').textContent = health.rateLimiter.dailyCount + ' / ' + health.rateLimiter.maxDaily;
        document.getElementById('flood-wait').textContent = health.rateLimiter.floodWaitRemainingSec + 's';

        currentTasks = queue;
        document.getElementById('queue-badge').textContent = queue.length + ' items';
        renderQueueList();

        if (selectedTaskId) {
          const updated = queue.find(t => t.id === selectedTaskId);
          if (updated) renderDetailView(updated);
        } else if (queue.length > 0) {
          selectTask(queue[0].id);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }

    function renderQueueList() {
      const container = document.getElementById('queue-list');
      if (currentTasks.length === 0) {
        container.innerHTML = '<div class="text-xs text-slate-500 p-6 text-center card rounded-lg">No pending tasks in queue. Run a bounded run above.</div>';
        return;
      }

      container.innerHTML = currentTasks.map(t => {
        const isSelected = t.id === selectedTaskId;
        const isStale = !t.isFresh || t.draftStatus === 'STALE';
        const isSent = t.draftStatus === 'SENT';
        const badgeClass = isSent ? 'bg-purple-900/40 text-purple-400 border border-purple-800' : isStale ? 'badge-stale' : 'badge-fresh';
        const badgeText = isSent ? 'SENT' : isStale ? 'STALE' : 'READY';

        return \`
          <div onclick="selectTask('\${t.id}')" class="cursor-pointer p-4 rounded-xl border transition-all \${isSelected ? 'bg-slate-800/90 border-blue-500 shadow-md' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}">
            <div class="flex items-start justify-between gap-2">
              <span class="text-xs font-bold text-white truncate">\${t.vacancy.roleTitle || 'Developer Opportunity'}</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full \${badgeClass}">\${badgeText}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span class="text-blue-400 font-mono">\${t.vacancy.extractedContact}</span>
              <span>•</span>
              <span>\${t.vacancy.budgetInfo || 'Rate not specified'}</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-2 line-clamp-2">\${t.publication.rawText}</div>
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

      container.innerHTML = \`
        <div class="w-full h-full flex flex-col justify-between">
          <div>
            <!-- Header & Recipient -->
            <div class="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <span class="text-xs text-slate-400 uppercase tracking-wider font-semibold">Target Contact</span>
                <h2 class="text-lg font-bold text-white font-mono mt-0.5">\${task.vacancy.extractedContact}</h2>
                <div class="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300">\${task.vacancy.contactType}</span>
                  <span>•</span>
                  <span>Matched Persona: <strong class="text-slate-200">\${task.profile.name}</strong></span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-[11px] text-slate-500 font-mono">Context Hash: \${task.contextHash.slice(0, 12)}...</span>
                <div class="mt-1">
                  \${isSent ? '<span class="text-xs text-purple-400 font-bold">✓ DELIVERED TO TELEGRAM</span>' : isStale ? '<span class="text-xs text-red-400 font-bold">⚠ STALE DRAFT (BLOCKED)</span>' : '<span class="text-xs text-emerald-400 font-bold">● READY FOR HUMAN DISPATCH</span>'}
                </div>
              </div>
            </div>

            <!-- Provenance & Source Text -->
            <div class="mt-4 bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80">
              <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Originating Telegram Publication</span>
              <p class="text-xs text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">\${task.publication.rawText}</p>
            </div>

            <!-- Editable Draft Section -->
            <div class="mt-5">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-semibold text-slate-300">Context-Aware AI Draft</span>
                <span class="text-[11px] text-slate-500">Anti-Slop Direct Copy</span>
              </div>
              <textarea id="draft-text" rows="5" \${isSent ? 'disabled' : ''} class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 leading-relaxed font-sans focus:outline-none focus:border-blue-500 disabled:opacity-60">\${task.draftText || ''}</textarea>
            </div>
          </div>

          <!-- Human Action Control Footer -->
          <div class="pt-5 mt-5 border-t border-slate-800 flex items-center justify-between gap-4">
            <button onclick="rejectTask('\${task.id}')" \${isSent ? 'disabled' : ''} class="px-3.5 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/40 border border-rose-900/60 transition-colors disabled:opacity-40">
              Reject Lead
            </button>
            <div class="flex items-center gap-3">
              <button onclick="saveDraft('\${task.id}')" \${isSent ? 'disabled' : ''} class="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors disabled:opacity-40">
                Save Draft
              </button>
              <button onclick="dispatchTask('\${task.id}')" \${isSent || isStale ? 'disabled' : ''} class="px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                <span>Approve & Send to Telegram</span>
              </button>
            </div>
          </div>
        </div>
      \`;
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
          <div><span class="text-slate-400">Scanned:</span> <strong class="text-white">\${summary.publicationsIngested}</strong></div>
          <div><span class="text-slate-400">Accepted:</span> <strong class="text-emerald-400">\${summary.acceptedCount}</strong></div>
          <div><span class="text-slate-400">Discarded:</span> <strong class="text-rose-400">\${summary.discardedCount}</strong></div>
          <div><span class="text-slate-400">Drafts Ready:</span> <strong class="text-blue-400">\${summary.draftsPrepared}</strong></div>
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
          alert('✓ Confirmed by Telegram Server! Message ID: ' + result.tgMessageId);
        }
        await loadData();
      } catch (err) {
        alert('Network or dispatch error: ' + err.message);
      }
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
