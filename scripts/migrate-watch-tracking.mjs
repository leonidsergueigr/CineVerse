import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyWatchTrackingSchema } from "../src/lib/watch-schema.ts";

const dataDir = process.env.CINEVERSE_DATA_DIR?.trim()
  ? path.resolve(process.env.CINEVERSE_DATA_DIR.trim())
  : path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const databasePath = path.join(dataDir, "cineverse.sqlite");
const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
applyWatchTrackingSchema(database);
database.close();
console.log(`Migrations de suivi de lecture appliquees: ${databasePath}`);
