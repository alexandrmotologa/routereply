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

program
  .command("import-tg <jsonFile>")
  .description("Import real Telegram Desktop channel/chat export file (result.json)")
  .action(async (jsonFile) => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const { TelegramExportImporter } = await import("../vacancies/importer.js");
    const importer = new TelegramExportImporter(storage);

    try {
      console.log(pc.cyan(`[RouteReply] Importing Telegram export from ${jsonFile}...`));
      const res = importer.importJsonFile(path.resolve(process.cwd(), jsonFile));
      console.log(pc.green(`✓ Imported from channel: ${res.channelTitle} (${res.channelId})`));
      console.log(`• Total messages parsed:  ${res.totalParsed}`);
      console.log(`• New publications saved: ${pc.green(res.newIngested.toString())}`);
      console.log(`• Skipped duplicates:     ${pc.yellow(res.skippedDuplicates.toString())}`);
      console.log(pc.cyan(`Run 'routereply run' to filter and prepare reviewable drafts for these items.`));
    } catch (err: any) {
      console.log(pc.red(`✗ Import failed: ${err.message}`));
    } finally {
      storage.close();
    }
  });

program
  .command("rule")
  .description("Manage dynamic keyword and exclusion filter rules")
  .argument("<action>", "Action: 'list', 'add', or 'remove'")
  .argument("[type]", "Rule type: 'keyword' or 'exclusion'")
  .argument("[pattern...]", "Pattern or keyword phrase")
  .action((action, type, patternParts) => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const pattern = patternParts?.join(" ");

    if (action === "list") {
      const keywords = storage.getFilterRules("keyword");
      const exclusions = storage.getFilterRules("exclusion");
      console.log(pc.cyan("\n=== Dynamic Filter Rules ===\n"));
      console.log(pc.green(`Target Tech Keywords (${keywords.length}):`));
      console.log(keywords.map((k) => `  + ${k}`).join("\n"));
      console.log(pc.red(`\nDisqualifying Exclusions (${exclusions.length}):`));
      console.log(exclusions.map((e) => `  - ${e}`).join("\n"));
      console.log("");
    } else if (action === "add") {
      if (!type || !pattern) {
        console.log(pc.red("Usage: routereply rule add <keyword|exclusion> <phrase>"));
      } else {
        storage.addFilterRule(type as any, pattern);
        console.log(pc.green(`✓ Added ${type} rule: "${pattern}"`));
      }
    } else if (action === "remove") {
      if (!type || !pattern) {
        console.log(pc.red("Usage: routereply rule remove <keyword|exclusion> <phrase>"));
      } else {
        storage.removeFilterRule(type as any, pattern);
        console.log(pc.yellow(`✓ Removed ${type} rule: "${pattern}"`));
      }
    }
    storage.close();
  });

program
  .command("login")
  .description("Interactive MTProto login to generate authorized Telegram session string")
  .action(async () => {
    const { executeTelegramLogin } = await import("../dispatcher/auth.js");
    await executeTelegramLogin();
  });

program
  .command("listen")
  .description("Start real-time MTProto event listener on monitored Telegram channels")
  .action(async () => {
    const dbPath = path.resolve(process.cwd(), "routereply.db");
    const storage = new StorageEngine(dbPath);
    const { RealTimeChannelListener } = await import("../dispatcher/listener.js");
    const listener = new RealTimeChannelListener(storage);

    await listener.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log(pc.yellow("\nShutting down listener..."));
      await listener.stop();
      storage.close();
      process.exit(0);
    });
  });

program.parse(process.argv);
