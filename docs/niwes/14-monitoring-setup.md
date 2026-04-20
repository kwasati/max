# 14-monitoring-setup.md — Niwes Portfolio Monitor Setup

> Plan: `niwes-07-monitoring-update` — automated news monitor for ดร.นิเวศน์ portfolio + thesis changes, Telegram alert via Karl Notify bot.

## What it does

- **1/3 — Scrape**: news from 5 Thai sources (kaohoon, prachachat, thestandard, longtunman, finnomena) mentioning "นิเวศน์ เหมวชิรวรากร". Rate-limited 2s/site, title + URL + snippet only (fair use).
- **2/3 — Detect**: Claude Haiku 4.5 compares headlines + snippets against `docs/niwes/11-current-portfolio.md` baseline, returns structured findings `{change_type, symbol, evidence URL, confidence 0-100, reasoning}`. Uses prompt caching on baseline to cut cost on repeat runs.
- **3/3 — Alert**: findings with `confidence >= 70` and `change_type != 'none'` are grouped into one Telegram message and sent via Karl Notify bot. Dedup by stable SHA1 hash so the same finding never spams twice.

## Files

| Path | Role |
|---|---|
| `scripts/monitor_niwes_news.py` | news scraper (5 sites) |
| `scripts/diff_niwes_portfolio.py` | Haiku-powered portfolio diff detector |
| `scripts/alert_niwes.py` | Telegram alert (Markdown format) |
| `scripts/show_niwes_diff_history.py` | viewer for past detections (trend review) |
| `scripts/_niwes_cache.py` | shared JSON cache helpers (atomic write) |
| `scripts/run_monitor_pipeline.bat` | orchestration — the only thing Task Scheduler should call |
| `data/niwes_news_seen.json` | dedup cache — URLs already scraped |
| `data/niwes_news_YYYY-MM-DD.json` | raw scrape output of the day |
| `data/niwes_diff_history.json` | append-only log of all findings for trend review |
| `data/niwes_diff_latest.json` | high-confidence subset — what alert script reads |
| `data/niwes_alert_sent.json` | dedup cache — finding IDs already alerted |
| `data/monitor_log_YYYY-MM-DD.log` | daily combined pipeline log |

## Windows Task Scheduler — Weekly Monday 09:00

Run this from an elevated Command Prompt:

```
schtasks /create /tn "NiwesMonitor" /tr "C:/WORKSPACE/projects/MaxMahon/scripts/run_monitor_pipeline.bat" /sc weekly /d MON /st 09:00
```

Verify:

```
schtasks /query /tn "NiwesMonitor" /v /fo LIST
```

Remove:

```
schtasks /delete /tn "NiwesMonitor" /f
```

### Why weekly / Monday / 09:00?

- Niwes publishes portfolio updates ~every 6 months (มิ.ย. + ธ.ค.) and gives interviews/articles sporadically. Weekly is enough resolution; daily would just spam.
- Monday 09:00 = start of week, before the market open — if something fires, there's time to think before any action.

## Required environment (`C:/WORKSPACE/.env`)

| Var | Used by | Required? |
|---|---|---|
| `MAX_ANTHROPIC_API_KEY` | `diff_niwes_portfolio.py` | YES — pipeline exits 2 if missing |
| `KARL_NOTIFY_BOT_TOKEN` (or `TELEGRAM_BOT_TOKEN`) | `alert_niwes.py` | YES if you want alerts |
| `KARL_NOTIFY_CHAT_ID` (or `TELEGRAM_CHAT_ID`) | `alert_niwes.py` | YES if you want alerts |

The alert script tries the `KARL_NOTIFY_*` names first (plan spec), falls back to `TELEGRAM_*` (actual workspace env var names).

## Manual test

From `projects/MaxMahon/`:

```
py scripts/diff_niwes_portfolio.py --mock          # inject 1 mock news item, verify Claude works
py scripts/alert_niwes.py --mock --dry-run         # print Telegram message without sending
py scripts/alert_niwes.py --mock                   # really send a smoke-test message
scripts\run_monitor_pipeline.bat                   # full pipeline end-to-end
py scripts/show_niwes_diff_history.py --last 5     # review last 5 detection runs
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Task runs but no output | Task Scheduler swallowed errors | Open `data/monitor_log_YYYY-MM-DD.log` — every step logs there |
| `ERROR: monitor_niwes_news.py failed` | Site blocked / selector changed | Check log, update CSS selectors in `monitor_niwes_news.py` (search `# TODO: verify selector`) |
| `ERROR: diff_niwes_portfolio.py failed` | `MAX_ANTHROPIC_API_KEY` missing or API down | Check `.env`; try manual run to see the traceback |
| `Telegram creds missing` | Env vars not loaded | Confirm `KARL_NOTIFY_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN` is set in `C:/WORKSPACE/.env` |
| Same finding alerted twice | Would indicate `niwes_alert_sent.json` was wiped | Don't delete `data/niwes_alert_sent.json` — it's the dedup source of truth |
| Too many/few scraped items | Expected — Thai news sites are JS-rendered or block bots; fair to have sparse data. The diff step still works on whatever arrives |

## Scope guards (important)

- **NEVER** auto-update `docs/niwes/11-current-portfolio.md`. Detection is advisory. Karl reviews the Telegram alert, clicks through to the source, and manually updates the baseline if the news is verified.
- **NEVER** scrape full article body — just title + snippet + URL (fair use).
- **NEVER** hard-code tokens or chat IDs — always read from `C:/WORKSPACE/.env`.

## Fail-safe behavior

- If a single site returns 403 / timeout, it logs a warning and moves on — the pipeline doesn't block.
- If Claude returns unparseable JSON, the diff step exits with code 4 and no alerts fire.
- If no findings meet the confidence threshold, alert step exits 0 silently (no message = no news is good news).
