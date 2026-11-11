import { Command } from "commander";
import path from "node:path";
import pc from "picocolors";
import { StorageEngine } from "../core/db.js";
import { IngestionController } from "../vacancies/ingest.js";
import { TelegramDispatcher } from "../dispatcher/sender.js";
import { DispatchRateLimiter } from "../dispatcher/rate-limiter.js";
import { seedDatabase } from "../fixtures/seed.js";
import { createServer } from "../api/server.js";

const program = new Command();

program
  .name("routereply")
  .description("Human-in-the-loop Telegram vacancy ingestion, explainable filtering, and outreach copilot")
  .version("1.0.0");

program
  .command("run")
  .description("Execute a bounded ingestion run across active Telegram channels")
  .option("-h, --hours <number>", "Scan window in hours", "24")
  .option("-m, --max <number>", "Max publications per channel", "50")
  .action(async (options) => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const controller = new IngestionController(storage);

    console.log(pc.cyan(`[RouteReply] Initiating bounded run (window: ${options.hours}h, max: ${options.max}/channel)...`));
    const summary = await controller.executeBoundedRun({
      sinceHours: parseInt(options.hours, 10),
      maxItemsPerChannel: parseInt(options.max, 10)
    });

    console.log(pc.green(`\n=== Bounded Run Complete ===`));
    console.log(`• Publications scanned:  ${summary.publicationsIngested}`);
    console.log(`• Accepted vacancies:    ${pc.green(summary.acceptedCount.toString())}`);
    console.log(`• Discarded (filtered):  ${pc.yellow(summary.discardedCount.toString())}`);
    console.log(`• Ready AI Drafts:       ${pc.cyan(summary.draftsPrepared.toString())}`);
    storage.close();
  });

program
  .command("queue")
  .description("List reviewable tasks in the operator queue")
  .action(() => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const queue = storage.listReviewQueue();

    console.log(pc.cyan(`\n=== Operator Review Queue (${queue.length} items) ===\n`));
    if (queue.length === 0) {
      console.log(pc.gray("No items in queue. Run 'routereply run' to ingest."));
    }

    for (const item of queue) {
      const statusColor = item.draftStatus === "SENT" ? pc.magenta : item.draftStatus === "STALE" ? pc.red : pc.green;
      console.log(`${pc.bold(item.id)} | Contact: ${pc.yellow(item.vacancy.extractedContact)} | Role: ${pc.white(item.vacancy.roleTitle || "Unknown")}`);
      console.log(`  Status: ${statusColor(item.draftStatus)} | Budget: ${item.vacancy.budgetInfo || "N/A"}`);
      console.log(`  Matched CV: ${item.profile.name}`);
      console.log(`  Draft Preview: ${pc.gray((item.draftText || "No draft").replace(/\n/g, " ").slice(0, 100))}...`);
      console.log("");
    }

    storage.close();
  });

program
  .command("refresh <taskId>")
  .description("Re-evaluate context and refresh a stale draft")
  .action(async (taskId) => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const task = storage.getReplyTask(taskId);
    if (!task) {
      console.log(pc.red(`Task '${taskId}' not found.`));
      storage.close();
      return;
    }

    const vacancy = storage.getVacancy(task.vacancyId);
    const publication = storage.getPublication(vacancy?.publicationId || "");
    const profile = storage.getProfile(task.candidateProfileId);

    if (!vacancy || !publication || !profile) {
      console.log(pc.red("Missing vacancy, publication, or profile context records."));
      storage.close();
      return;
    }

    const { computeContextHash } = await import("../replies/context.js");
    const { DraftGenerator } = await import("../replies/drafter.js");

    const history = storage.getConversationHistory(vacancy.extractedContact);
    const newHash = computeContextHash({
      publicationText: publication.rawText,
      candidateProfileId: profile.id,
      candidateProfileVersion: profile.version,
      conversationHistory: history
    });

    const drafter = new DraftGenerator();
    const draftResult = await drafter.generateDraft({
      vacancy,
      profile,
      rawText: publication.rawText,
      conversationHistory: history
    });

    storage.upsertReplyTask({
      ...task,
      contextHash: newHash,
      draftStatus: "DRAFTED",
      staleReason: null,
      draftText: draftResult.draftText
    });

    console.log(pc.green(`✓ Draft for task '${taskId}' refreshed with latest evidence (Profile v${profile.version}).`));
    storage.close();
  });

program
  .command("dispatch <taskId>")
  .description("Explicitly authorize and dispatch a prepared draft to Telegram")
  .action(async (taskId) => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const rateLimiter = new DispatchRateLimiter();
    const dispatcher = new TelegramDispatcher(storage, rateLimiter);

    console.log(pc.cyan(`[RouteReply] Authorizing manual dispatch for task: ${taskId}...`));
    try {
      const result = await dispatcher.executeManualDispatch(taskId);
      if (result.success) {
        console.log(pc.green(`✓ Dispatch Confirmed by Telegram!`));
        console.log(`• Server Message ID: ${pc.bold(result.tgMessageId?.toString() || "N/A")}`);
        console.log(`• Recipient:         ${result.recipientHandle}`);
      } else {
        console.log(pc.red(`✗ Dispatch Failed: ${result.errorMessage}`));
      }
    } catch (err: any) {
      console.log(pc.red(`✗ Dispatch Error: ${err.message}`));
    } finally {
      storage.close();
    }
  });

program
  .command("studio")
  .description("Launch the RouteReply web dashboard & API server")
  .option("-p, --port <number>", "Port number", "3333")
  .action(async (options) => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const port = parseInt(options.port, 10);
    const { app } = await createServer(dbPath);
    app.listen({ port, host: "0.0.0.0" }, (err, address) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(pc.green(`\n[RouteReply Studio] Online at ${address}`));
      console.log(pc.cyan(`Open ${address} in your browser to inspect the review queue.\n`));
    });
  });

program
  .command("seed")
  .description("Seed synthetic channels, publications, and profiles for offline testing")
  .action(() => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const counts = seedDatabase(storage);
    console.log(pc.green(`[Seed] Seeded ${counts.channelsCount} channels, ${counts.profilesCount} profiles, and ${counts.publicationsCount} publications into ${dbPath}`));
    storage.close();
  });

program.parse(process.argv);
