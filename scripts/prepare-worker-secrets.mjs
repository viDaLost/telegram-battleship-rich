import { chmod, writeFile } from "node:fs/promises";
import { resolveWebhookSecret } from "./webhook-secret.mjs";

const token = process.env.BOT_TOKEN?.trim();

if (!token) {
  console.error("BOT_TOKEN is required.");
  process.exit(1);
}

if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
  console.error("BOT_TOKEN has an unexpected Telegram token format.");
  process.exit(1);
}

let webhookSecret;
try {
  webhookSecret = resolveWebhookSecret(token, process.env.WEBHOOK_SECRET || "");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const target = new URL("../.worker-secrets.json", import.meta.url);
await writeFile(
  target,
  `${JSON.stringify({ BOT_TOKEN: token, WEBHOOK_SECRET: webhookSecret })}\n`,
  { mode: 0o600 },
);
await chmod(target, 0o600);
console.log("Prepared Worker secrets for Wrangler.");
