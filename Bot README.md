# OutageNotifyBot 🚨

Telegram bot that tells you **only when a major outage happens** — across 20 services — with **no server to host**. GitHub Actions is the runtime; state lives in a tiny free Turso (libSQL / SQLite) database.

Every 15 minutes two workflows (shards A and B) fetch each service's status feed (RSS / Atom / JSON), compare against the last-seen incident ids stored in the database, and send a Telegram message to everyone subscribed to an affected service. Bot commands (`/start`, `/subscribe github`, …) are processed by a separate polling workflow that calls `getUpdates`.

> **Why not webhooks?** GitHub Actions cannot receive HTTP callbacks, and free serverless tiers time out / sleep. Polling on a schedule + push messages via the Bot API needs nothing but this repo and a free DB.

## How it works

```text
┌─────────────────────────┐
│ GitHub Actions (cron)   │
│  notify-a   */15 min    │  shard A = services 1–10
│  notify-b   */15 min    │  shard B = services 11–20
│  subscribe   */5 min    │  polls getUpdates, handles /commands
└─────────┬───────────────┘
          │ fetch feeds            │ get/set JSON
          ▼                        ▼
   20 status feeds          Turso libSQL DB (free)
   (RSS/Atom/JSON)          ├─ subscribers      {all:[...], services:{github:[...], ...}}
                            ├─ seen:<serviceId> [last 100 incident ids]
                            ├─ tg_offset        last processed update id
                            └─ stats:last-run:{shard}
```

First run of each feed **bootstraps silently** — existing incidents are recorded, nothing is sent. After that, only brand-new incidents that look like a **major outage** (see below) trigger alerts.

## Tracked services

| Shard | Service | Feed |
|-------|---------|------|
| A | OpenAI | `https://status.openai.com/feed.rss` |
| A | xAI / Grok | `https://status.x.ai/feed.xml` |
| A | Slack | `https://slack-status.com/feed/rss` |
| A | GitLab | `https://status.gitlab.com/pages/5b36dc6502d06804c08349f7/rss` |
| A | Docker | `https://www.dockerstatus.com/pages/533c6539221ae15e3f000031/rss` |
| A | Algolia | `https://status.algolia.com/history.rss` |
| A | Microsoft Azure | `https://rssfeed.azure.status.microsoft/en-us/status/feed/` |
| A | AWS (EC2 us-east-1) | `https://status.aws.amazon.com/rss/ec2-us-east-1.rss` |
| A | Google Cloud | `https://status.cloud.google.com/incidents.json` (JSON, `SERVICE_OUTAGE`-class only) |
| A | GitHub | `https://www.githubstatus.com/history.rss` |
| B | Meta Ads Manager | `https://metastatus.com/outage-events-feed-ads-manager.rss` |
| B | Cloudflare | `https://www.cloudflarestatus.com/history.atom` |
| B | Anthropic / Claude | `https://status.claude.com/history.rss` ⚠️ verify |
| B | Discord | `https://discordstatus.com/history.rss` ⚠️ verify |
| B | Stripe | `https://www.stripestatus.com/history.rss` |
| B | Netlify | `https://www.netlifystatus.com/history.rss` |
| B | Zoom | `https://www.zoomstatus.com/history.rss` |
| B | Vercel | `https://www.vercel-status.com/history.rss` ⚠️ verify |
| B | Supabase | `https://status.supabase.com/history.rss` ⚠️ verify |
| B | Arena AI | `https://status.arena.ai/feed.rss` |

⚠️ = flagged "verify before use" in the source list. Run the **Smoke Feeds** workflow after setup (see below) and fix `src/services.js` if any of these fail. Note AWS feed covers one service/region only; consumer Facebook/Instagram/WhatsApp are **not** covered (Meta's feed is Ads Manager only).

**Alert policy:** an incident alerts only if it is brand-new *and* either (a) a Google Cloud incident with `status_impact` containing `OUTAGE` / `severity` high, or (b) its title/description matches the keyword list `MAJOR_KEYWORDS` (default: `major, outage, critical, unavailable, down, disruption, service_outage`). Scheduled maintenance and minor informational notices do not alert.

## Setup (all free)

### 1. Create the bot
1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → follow the prompts.
2. Copy the token (looks like `123456:ABC-DEF...`). This is `TELEGRAM_BOT_TOKEN`.

### 2. Create the state database (Turso, free)
1. Sign up at [turso.tech](https://turso.tech) (free tier, no card required).
2. Create a database named e.g. `outagenotifybot`:
   - **CLI:** `turso db create outagenotifybot`
   - **Or:** create it from the dashboard at [app.turso.tech](https://app.turso.tech).
3. Copy the two values:
   - Database URL — `turso db show --url outagenotifybot` (looks like `libsql://outagenotifybot-....turso.io`)
   - Auth token — `turso db tokens create outagenotifybot`
4. No schema setup needed — the `kv` table is created automatically on first run.

> Privacy: subscribers' chat IDs live in **your** database, not in this (public) repo.

### 3. Add secrets to this repo
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from step 1 |
| `TURSO_DATABASE_URL` | from step 2 |
| `TURSO_AUTH_TOKEN` | from step 2 |

### 4. Verify the feeds
Repo → **Actions → Smoke Feeds → Run workflow**. The run first does a **Turso connection check** (exact host, token shape and a read/write ping — exits fast with an actionable message if your credentials are off), then every feed line should print ✅. Fix any ❌ by editing `src/services.js` (the ⚠️ "verify" feeds are the most likely to move). The smoke run sends **no** alerts.

### 5. Bootstrap (important)
Run **Notify A** and **Notify B** once via **Run workflow**. The first run records existing incidents silently — that's what prevents alert spam on day one.

### 6. Talk to your bot
Open your bot in Telegram:

| Command | What it does |
|---|---|
| `/start` | Welcome + help |
| `/services` | List all 20 tracked services and their ids |
| `/subscribe <id>` | Subscribe to a service, e.g. `/subscribe github` |
| `/subscribe all` | Subscribe to everything |
| `/unsubscribe <id\|all>` | Unsubscribe |
| `/myservices` | See your subscriptions |
| `/stop` | Unsubscribe from everything |

Subscriptions are processed by the **Subscribe** workflow, so allow up to ~5 minutes for them to take effect.

## Local development

```bash
npm install
npm test                 # 22 unit tests, no network needed
node src/smoke.js        # check feeds (needs real network access)
node src/notify.js --shard=a --dry-run
node src/subscribe.js --dry-run
```

Without `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` set, a local file store under `state/*.local.json` is used instead (git-ignored, override dir with `STATE_DIR`). Copy `.env.example` to `.env` if you have real credentials locally.

## Configuration

- `MAJOR_KEYWORDS` (optional env / workflow env): comma-separated override of the alert keywords.
- `--shard=a|b`: notify checks only that shard.
- Seen-incident history is capped at 100 ids per service.
- Chats that block the bot (403) or vanish (400) are pruned automatically on the next notify run.
- `stats:last-run:{a,b}` in the DB holds per-feed results of the last run for debugging.

## Limitations / honest caveats

- **Cron schedules may not register on first push.** GitHub has a known quirk where newly pushed scheduled workflows silently never trigger (manual `workflow_dispatch` still works). Workaround: any small push touching the workflow files re-registers them — see the `# schedules re-registered` comment commit. If `Actions` shows zero schedule-triggered runs, push a trivial commit to `main` and wait for the next UTC cron window.
- **Cron is best-effort.** Telegram delivery can lag a few minutes behind the 15-minute schedule (GitHub delays scheduled workflows under load). It is not real-time.
- **One `getUpdates` consumer only.** Never set a webhook for this bot (`setWebhook`) or the Subscribe workflow will receive nothing.
- **Public repo inactivity.** GitHub disables scheduled workflows after 60 days without repository activity — the monthly `keepalive` workflow (commits `data/heartbeat.txt`) prevents that.
- **Sharding & state.** Each shard tracks `seen:*` per service, so the two shards never conflict. `subscribers` and `tg_offset` are shared; the workflows use concurrency groups to avoid simultaneous writes, but keep in mind this is a single-writer design.
- **AWS scope.** Only the configured AWS feed URL is watched (default `ec2-us-east-1`). Add more regional feeds to `src/services.js` if you need them (mind shard timing; 20 feeds fit comfortably in two shards).
- **No "resolved" messages by design** — alerts fire on new major incidents only.

## Project layout

```text
src/
  services.js    the 20 services, shard assignment, feed URLs
  feeds.js       fetch + parse RSS/Atom/Google Cloud JSON, major-outage filter
  subscribers.js DB record shapes, diff/merge of seen ids
  commands.js    pure bot-command handler (unit-tested)
  notify.js      shard runner — diffs feeds, alerts subscribers
  subscribe.js   getUpdates poller — handles /commands
  smoke.js       feed health check (no alerts)
  telegram.js    minimal Bot API client
  db.js          Turso (libSQL) backend + local file fallback
.github/workflows/
  notify-a.yml   every 15 min, services 1–10
  notify-b.yml   every 15 min, services 11–20
  subscribe.yml  every 5 min, bot commands
  smoke.yml      manual feed verification
  keepalive.yml  monthly heartbeat (public-repo scheduled-workflow safety net)
test/            node:test unit tests + fixtures (RSS/Atom/JSON)
```
