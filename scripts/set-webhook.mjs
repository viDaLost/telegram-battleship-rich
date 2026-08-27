import { resolveWebhookSecret } from "./webhook-secret.mjs";

const [publicUrl] = process.argv.slice(2);
const token = process.env.BOT_TOKEN?.trim();

if (!publicUrl || !token) {
  console.error("Usage: BOT_TOKEN=... npm run webhook:set -- https://your-worker.workers.dev");
  process.exit(1);
}

if (!/^https:\/\//i.test(publicUrl)) {
  console.error("Worker URL must use HTTPS.");
  process.exit(1);
}

let secret;
try {
  secret = resolveWebhookSecret(token, process.env.WEBHOOK_SECRET || "");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const webhookUrl = `${publicUrl.replace(/\/$/, "")}/telegram/webhook`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const body = await response.json().catch(() => null);
if (!response.ok || !body?.ok) {
  console.error(body?.description || `setWebhook failed with HTTP ${response.status}`);
  process.exit(1);
}

console.log(`Webhook configured: ${webhookUrl}`);
