import { createHash } from "node:crypto";

export function resolveWebhookSecret(botToken, explicitSecret = "") {
  const custom = explicitSecret.trim();
  if (custom) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(custom)) {
      throw new Error("WEBHOOK_SECRET must be 1-256 characters and contain only A-Z, a-z, 0-9, _ or -.");
    }
    return custom;
  }

  if (!botToken) throw new Error("BOT_TOKEN is required to derive WEBHOOK_SECRET.");
  return createHash("sha256")
    .update(`telegram-battleship-webhook:v1:${botToken}`)
    .digest("base64url");
}
