const token = process.env.BOT_TOKEN;
const expectedUsername = (process.env.EXPECTED_BOT_USERNAME || 'battles_hip_bot').replace(/^@/, '');

if (!token) {
  console.error('BOT_TOKEN is required. Example: BOT_TOKEN=... npm run bot:configure');
  process.exit(1);
}

async function call(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`${method}: ${body.description || response.statusText}`);
  }
  return body.result;
}

const me = await call('getMe');
if (me.username !== expectedUsername) {
  console.error(`Token belongs to @${me.username}, expected @${expectedUsername}. Nothing was changed.`);
  process.exit(2);
}

await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Открыть Морской бой' },
    { command: 'new', description: 'Начать бой с ботом' },
    { command: 'help', description: 'Правила игры' },
  ],
});

await call('setMyDescription', {
  description:
    '⚓ Классический Морской бой 10×10 прямо в Telegram. Сражайтесь с ботом или отправьте другу ссылку на сетевой бой — без Mini App.',
});

await call('setMyShortDescription', {
  short_description: '⚓ Морской бой 10×10 прямо в Telegram',
});

console.log(`Configured @${me.username} (${me.first_name}).`);
