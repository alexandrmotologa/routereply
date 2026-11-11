import fs from "node:fs";
import path from "node:path";
import { StorageEngine } from "../core/db.js";
import type { Channel, CandidateProfile, Publication } from "../core/types.js";

export function seedDatabase(storage: StorageEngine): {
  channelsCount: number;
  profilesCount: number;
  publicationsCount: number;
} {
  // Look for fixtures in src/fixtures or current dir
  let fixturesDir = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname));
  if (!fs.existsSync(path.join(fixturesDir, "mock-channels.json"))) {
    fixturesDir = path.resolve(process.cwd(), "src", "fixtures");
  }

  const channelsData: Channel[] = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "mock-channels.json"), "utf-8")
  );
  const profilesData: CandidateProfile[] = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "mock-profiles.json"), "utf-8")
  );
  const publicationsData: Publication[] = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "mock-publications.json"), "utf-8")
  );

  for (const channel of channelsData) {
    storage.upsertChannel(channel);
  }

  for (const profile of profilesData) {
    storage.upsertProfile(profile);
  }

  let publicationsCount = 0;
  for (const pub of publicationsData) {
    const inserted = storage.insertPublication({
      ...pub,
      status: "INGESTED"
    });
    if (inserted) publicationsCount++;
  }

  return {
    channelsCount: channelsData.length,
    profilesCount: profilesData.length,
    publicationsCount
  };
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const dbPath = path.resolve(process.cwd(), "routereply.db");
  const storage = new StorageEngine(dbPath);
  const counts = seedDatabase(storage);
  console.log(`[Seed] Seeded ${counts.channelsCount} channels, ${counts.profilesCount} profiles, and ${counts.publicationsCount} publications into ${dbPath}`);
  storage.close();
}
