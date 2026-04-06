import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function readLocalMessage() {
  try {
    return fs.readFileSync(path.join(rootDir, "message.txt"), "utf8").trim();
  } catch {
    return "";
  }
}

export const config = {
  rootDir,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  botAdminSecret: process.env.BOT_ADMIN_SECRET || "",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  defaultMessage: (process.env.DEFAULT_MESSAGE || readLocalMessage()).trim(),
  staleClaimMinutes: Number(process.env.STALE_CLAIM_MINUTES || "30"),
};

export function requireConfig(keys) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
