# ⚓ Telegram Battleship — Rich Messages

**Бот:** https://t.me/battles_hip_bot

Классический «Морской бой» 10×10 внутри одного Telegram Rich Message. Без Mini App/WebView. Backend — Cloudflare Worker + D1, production deploy — GitHub Actions.

## Что реализовано

- PvE против AI `hunt/target`;
- PvP по персональной deep-link комнате `t.me/battles_hip_bot?start=join_<CODE>`;
- кнопка **«📨 Отправить вызов другу»** через Telegram share flow;
- отдельное приватное поле для каждого участника PvP;
- синхронное обновление сообщений обоих игроков после выстрела;
- классический флот `1×4, 2×3, 3×2, 4×1`;
- попадание даёт дополнительный ход, промах передаёт ход;
- корабли не соприкасаются даже по диагонали;
- D1 optimistic CAS защищает от двойных/устаревших callback;
- Rich Message table 10×10;
- iPhone-safe **Radar 5×5** для выстрелов и ручной расстановки;
- beta direct-grid для Android/Desktop;
- `RichTextCustomEmoji` theme hooks для кастомных кораблей, попаданий и воды.

## Почему на iPhone не используется прямой tap по таблице

Bot API 10.3 (24 Aug 2026) добавил `RichMessageButton`, `RichTextButton`, `RichBlockButtons`/`InputRichBlockButtons` и `is_compact` для Rich tables. Формально это позволяет поместить callback button в каждую клетку 10×10.

Но в Telegram iOS/macOS на момент разработки есть открытый client bug: `RichTextButton` внутри table cell рендерится, но tap может не отправлять `callback_query`. На Android/Desktop те же кнопки работают.

Поэтому production default — **Radar**:

1. пользователь видит полное поле 10×10;
2. выбирает одну из 4 четвертей;
3. бот показывает 25 обычных `RichBlockButtons` как компактную 5×5 сетку;
4. tap по `А1`, `Б1` и т.д. выполняет выстрел.

Эти кнопки находятся **вне таблицы**, поэтому не попадают под Apple table hit-testing bug. Все button rows содержат максимум 5 кнопок при лимите Telegram 8.

Direct-grid остаётся доступным как beta режим для клиентов, где table-cell buttons работают.

Полезные ссылки:

- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/api-changelog#august-24-2026
- https://github.com/TelegramMessenger/Telegram-iOS/issues/2299

## PvP flow

```text
Игрок A
  ↓ «Играть с другом»
Room ABCD1234
  ↓ share link
Игрок B → /start join_ABCD1234
  ↓
оба получают приватную расстановку
  ↓ Ready / Ready
Battle
  ↓
каждый callback → D1 CAS → edit обоих Rich Messages
```

Комната хранится в `pvp_matches`, связь пользователя с текущей комнатой — в `pvp_members`. Callback data содержит code + revision, поэтому старые кнопки не могут случайно изменить новую версию боя.

## Кастомные корабли как фигуры в Rich Chess

Правильный механизм — **Telegram Custom Emoji + `RichTextCustomEmoji`**. RichMessageButton также может содержать custom emoji в `text`.

Важное отличие от шахмат: шахматная фигура занимает 1 клетку, а корабль занимает 1–4. Поэтому один emoji на корабль визуально не склеит корпус. Рендерер уже поддерживает сегментную схему:

```text
ship_h_bow   ship_h_mid   ship_h_stern
ship_v_bow
ship_v_mid
ship_v_stern
ship_single
```

Плюс отдельные иконки класса корабля для дока:

```text
ship4  ship3  ship2  ship1
```

И состояния поля:

```text
water  miss  hit  sunk
```

Итого оптимальный pack — 15 custom emoji. Для static custom emoji Telegram использует квадрат `100×100` с прозрачностью. Для максимально «шахматного» вида стоит нарисовать bow/middle/stern так, чтобы соседние 100×100 glyphs визуально продолжали корпус.

### Ограничение Telegram Premium

Bot API разрешает custom emoji в сообщениях бота, если бот имеет соответствующее право — в частности, для сообщений напрямую в private/group/supergroup это доступно, когда **владелец бота имеет Telegram Premium** (либо бот удовлетворяет альтернативному условию Telegram для purchased additional usernames).

### Подключение pack к Worker

После создания custom emoji pack получаем `custom_emoji_id` каждого элемента и добавляем GitHub Actions secret `SHIP_EMOJI_IDS`:

```json
{
  "ship4": "...",
  "ship3": "...",
  "ship2": "...",
  "ship1": "...",
  "ship_h_bow": "...",
  "ship_h_mid": "...",
  "ship_h_stern": "...",
  "ship_v_bow": "...",
  "ship_v_mid": "...",
  "ship_v_stern": "...",
  "ship_single": "...",
  "water": "...",
  "miss": "...",
  "hit": "...",
  "sunk": "..."
}
```

Без этого secret бот использует лёгкие Unicode fallbacks и продолжает работать.

## Rich Message возможности, которые используются

- `InputRichBlockTable` — полное поле 10×10; Telegram допускает до 20 колонок;
- `is_compact` — уменьшенные table cell paddings;
- `InputRichBlockButtons` — Radar, меню и действия, максимум 8 buttons в row;
- `RichMessageButton.callback_data` — игровые действия, 1–64 bytes;
- `RichMessageButton.url` — отправка PvP invite через Telegram share URL;
- `RichTextCustomEmoji` — кастомная графика клеток/кораблей;
- `RichBlockDetails` — сворачиваемая легенда, чтобы интерфейс не разрастался;
- headings, pull quotes, dividers, footer — визуальная иерархия статуса боя.

Мы сознательно **не** используем photo/video blocks на каждом ходе: медиа утяжелило бы edit path и не даёт преимуществ для интерактивной 10×10 сетки.

## Архитектура

```text
Telegram Bot API 10.3
        │ webhook
        ▼
Cloudflare Worker
 ├── Telegram transport
 ├── PvE engine + AI
 ├── PvP match engine
 ├── Rich Message renderer
 ├── Radar controller
 └── Custom Emoji theme
        │
        ▼
Cloudflare D1
 ├── games
 ├── pvp_matches
 └── pvp_members
```

## Deploy

Secrets already required by CI:

```text
BOT_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Optional:

```text
SHIP_EMOJI_IDS
```

Workflow `.github/workflows/deploy.yml` performs:

1. install;
2. TypeScript check;
3. tests;
4. find/create D1;
5. all D1 migrations;
6. Worker deploy with secrets;
7. verify token belongs to `@battles_hip_bot`;
8. configure bot profile/commands;
9. set webhook;
10. `/health` check.

Every push to `main` deploys production.

## Local checks

```bash
npm install
npm run typecheck
npm test
```
