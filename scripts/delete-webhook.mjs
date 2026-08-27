const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Usage: BOT_TOKEN=... npm run webhook:delete");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ drop_pending_updates: true }),
});
console.log(await response.text());
if (!response.ok) process.exit(1);
