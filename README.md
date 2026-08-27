# ⚓ Telegram Battleship — Rich Messages

**Целевой бот:** [@battles_hip_bot](https://t.me/battles_hip_bot)

Классический «Морской бой» 10×10, работающий нативно внутри Telegram через Rich Messages Bot API 10.3. Mini App и WebView не нужны.

## Что реализовано

- поле 10×10 через `InputRichBlockTable`;
- два режима управления:
  - **📱 Совместимый** — по умолчанию: строка → столбец через `InputRichBlockButtons` вне таблицы;
  - **⚡ Прямые клетки (beta)** — выстрел одним нажатием по `RichTextButton` внутри клетки таблицы;
- классический флот: 1×4, 2×3, 3×2, 4×1;
- корабли не соприкасаются даже по диагонали;
- ручная и автоматическая расстановка;
- попадание даёт дополнительный ход;
- периметр потопленного корабля автоматически помечается проверенным;
- AI `hunt/target`: после попадания ищет продолжение корабля и не выбирает выстрел из скрытых координат флота;
- переключение «Поле противника / Мой флот»;
- сдача и новая игра;
- одно игровое Telegram-сообщение обновляется через `editMessageText + rich_message`;
- защита от двойных и устаревших нажатий через `revision` + optimistic CAS в D1;
- автоматическое восстановление UI, если Telegram повторно прислал callback после неудачного редактирования сообщения;
- webhook с проверкой `X-Telegram-Bot-Api-Secret-Token`;
- партии доступны только в личном чате с ботом;
- Cloudflare Workers + D1;
- GitHub Actions: тест → найти/создать D1 → миграция → deploy с Worker secrets → настройка Telegram → webhook → health check.

## Важный нюанс Telegram на Apple

Bot API 10.3 добавил `RichMessageButton`, `RichTextButton` и `InputRichBlockButtons`. Технически это позволяет сделать кликабельную таблицу 10×10.

Однако на момент разработки существует открытый баг Telegram iOS/macOS: кнопки, помещённые **внутрь ячеек Rich Message table**, отображаются, но могут не получать нажатия. При этом кнопки **вне таблицы** работают.

Поэтому production-режим по умолчанию — **Совместимый**: поле остаётся красивой таблицей 10×10, а координата выбирается двумя быстрыми нажатиями — сначала строка, затем столбец. Пользователь может вручную включить «Прямые клетки (beta)» на клиентах, где это уже работает.

Ссылки:

- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/api-changelog
- https://github.com/TelegramMessenger/Telegram-iOS/issues/2299

## Архитектура

```text
Telegram
   │ webhook + secret token
   ▼
Cloudflare Worker
   ├── Telegram adapter
   ├── callback router
   ├── Rich Message renderer
   ├── Battleship game engine
   ├── AI hunt/target
   └── D1 repository (optimistic CAS)
            │
            ▼
       Cloudflare D1
```

Game engine не зависит от Telegram/Cloudflare и тестируется отдельно.

## Рекомендуемый deploy: GitHub Actions

После первичной настройки каждый push в `main` автоматически обновляет бота. D1 вручную создавать не нужно: workflow сначала ищет базу `telegram-battleship`, а если её нет — создаёт через официальный Cloudflare D1 API.

### 1. Создать Cloudflare API Token

Токен должен иметь права:

```text
Workers Scripts Write
D1 Write
```

Не коммитьте токен и не отправляйте его в чаты. Также скопируйте **Cloudflare Account ID**.

### 2. Добавить GitHub Actions Secrets

В репозитории: `Settings → Secrets and variables → Actions → New repository secret`.

Нужны только три secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
BOT_TOKEN
```

`BOT_TOKEN` — токен именно `@battles_hip_bot` от @BotFather.

Отдельный `WEBHOOK_SECRET` в GitHub создавать не требуется: CI детерминированно выводит его через SHA-256 из `BOT_TOKEN`, загружает как Cloudflare Worker Secret и использует то же значение при `setWebhook`. Сам токен при этом нигде не раскрывается. При ручном deploy можно задать собственный `WEBHOOK_SECRET`.

Ни `BOT_TOKEN`, ни Cloudflare API token не нужно вставлять в исходный код.

### 3. Запустить workflow

Workflow находится в:

```text
.github/workflows/deploy.yml
```

Он автоматически:

1. устанавливает зависимости;
2. запускает TypeScript typecheck;
3. запускает тесты игрового движка;
4. через Cloudflare API находит существующую D1 `telegram-battleship` или создаёт её;
5. генерирует временный `wrangler.generated.jsonc` с реальным D1 UUID;
6. применяет D1 migrations;
7. выводит стабильный `WEBHOOK_SECRET` из `BOT_TOKEN` через SHA-256 и деплоит Worker вместе с обоими secrets через Wrangler `--secrets-file`;
8. проверяет через `getMe`, что токен принадлежит именно `@battles_hip_bot`;
9. задаёт `/start`, `/new`, `/help`, описание и short description;
10. устанавливает Telegram webhook;
11. проверяет `/health` опубликованного Worker.

`wrangler.generated.jsonc` и временный `.worker-secrets.json` не коммитятся. Файл с secrets удаляется с GitHub-hosted runner после deploy.

## Ручной deploy

Если GitHub Actions не используется:

```bash
npm install
npm run typecheck
npm test
npx wrangler login
npm run db:create
```

После `db:create` вставьте полученный D1 `database_id` в локальную копию `wrangler.jsonc` вместо `REPLACE_WITH_D1_DATABASE_ID`, затем:

```bash
npm run db:migrate:remote
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npm run deploy
```

Настройка бота:

```bash
BOT_TOKEN='...' npm run bot:configure
```

Webhook:

```bash
BOT_TOKEN='...' WEBHOOK_SECRET='...' npm run webhook:set -- https://YOUR-WORKER.workers.dev
```

## Локальная разработка

Скопируйте `.dev.vars.example` в `.dev.vars` и подставьте локальные secrets. `.dev.vars` игнорируется Git.

```bash
npm install
npm run typecheck
npm test
npm run db:migrate:local
npm run dev
```

Health check:

```text
GET /health
```

Telegram webhook endpoint:

```text
POST /telegram/webhook
```

## Структура

```text
.github/workflows/deploy.yml   CI/CD
migrations/                    D1 schema
scripts/                       deploy / Bot API helpers
src/game/                      чистый game engine + AI
src/storage/                   D1 repository
src/telegram/                  Bot API transport/types
src/ui/                        Rich Message renderer
tests/                         game-engine tests
wrangler.jsonc                 Worker config template
```

## Следующие версии

Текущее ядро — PvE против компьютера. Архитектура допускает следующий слой: PvP по invite-ссылке/коду комнаты, отдельные приватные представления флота и, при необходимости, ephemeral messages для группового сценария.
