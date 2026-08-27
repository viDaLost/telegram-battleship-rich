import { readFile, writeFile } from "node:fs/promises";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const databaseName = process.env.D1_DATABASE_NAME?.trim() || "telegram-battleship";

if (!accountId) {
  console.error("CLOUDFLARE_ACCOUNT_ID is required.");
  process.exit(1);
}
if (!apiToken) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
  process.exit(1);
}

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database`;
const headers = {
  authorization: `Bearer ${apiToken}`,
  "content-type": "application/json",
};

async function cloudflare(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const details = body?.errors?.map((item) => item.message).filter(Boolean).join("; ");
    throw new Error(details || `Cloudflare API failed with HTTP ${response.status}`);
  }
  return body;
}

let database;
const listUrl = `${baseUrl}?name=${encodeURIComponent(databaseName)}&per_page=100`;
const listed = await cloudflare(listUrl);
const matches = Array.isArray(listed.result)
  ? listed.result.filter((item) => item?.name === databaseName && item?.uuid)
  : [];

if (matches.length > 1) {
  throw new Error(`More than one D1 database named ${databaseName} was returned; refusing to guess.`);
}

if (matches.length === 1) {
  database = matches[0];
  console.log(`Using existing D1 database: ${databaseName}.`);
} else {
  const created = await cloudflare(baseUrl, {
    method: "POST",
    body: JSON.stringify({ name: databaseName }),
  });
  database = created.result;
  console.log(`Created D1 database: ${databaseName}.`);
}

if (!database?.uuid) {
  throw new Error("Cloudflare did not return a D1 database UUID.");
}

const sourceUrl = new URL("../wrangler.jsonc", import.meta.url);
const targetUrl = new URL("../wrangler.generated.jsonc", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const placeholder = "REPLACE_WITH_D1_DATABASE_ID";

if (!source.includes(placeholder)) {
  throw new Error(`wrangler.jsonc does not contain ${placeholder}.`);
}

await writeFile(targetUrl, source.replace(placeholder, database.uuid), "utf8");
console.log("Generated wrangler.generated.jsonc with the resolved D1 binding.");
