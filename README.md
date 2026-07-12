# roam-book-research-backup-actions

[![Roam Research backup](https://github.com/sc0ttwad3/roam-book-research-backup-actions/actions/workflows/main.yml/badge.svg)](https://github.com/sc0ttwad3/roam-book-research-backup-actions/actions/workflows/main.yml)

Scheduled GitHub Action that backs up the **BookResearch** Roam Research graph. This repo is public (unlimited Actions minutes); the backups land in the private repo [sc0ttwad3/roam-book-research](https://github.com/sc0ttwad3/roam-book-research).

## How it works

- [.github/workflows/main.yml](.github/workflows/main.yml) runs daily at 07:17 UTC, or on manual dispatch.
- [backup.js](backup.js) (Puppeteer, derived from [everruler12/roam2github](https://github.com/everruler12/roam2github)) signs in to Roam, opens the graph, and runs "Export All" for **Markdown, JSON, EDN, and msgpack**.
- Markdown is extracted into `markdown/BookResearch/` -- one diffable file per page. JSON/EDN/msgpack are saved raw under stable names (`json/BookResearch.json`, `edn/BookResearch.edn`, `msgpack/BookResearch.msgpack`) so git delta-compresses daily runs. Any file over 99 MB is gzipped in place to stay under GitHub's 100 MB blob limit.
- The results are committed and pushed to the private repo, then a `LAST_BACKUP` heartbeat commit here keeps the schedule from GitHub's 60-day auto-disable (replaces the old manual README "touches").
- Logs show step names only, never graph content or credentials.

## Secrets (Actions secrets in this repo)

| Secret | Value |
|---|---|
| `ROAM_EMAIL` | Roam account email |
| `ROAM_PASSWORD` | Roam account password |
| `ROAM_GRAPH` | `BookResearch` |
| `BACKUP_REPO_TOKEN` | Fine-grained PAT scoped to only `roam-book-research`, permission Contents: Read and write |

## Operations

```sh
# run a backup now
gh workflow run main.yml -R sc0ttwad3/roam-book-research-backup-actions

# watch it
gh run watch -R sc0ttwad3/roam-book-research-backup-actions

# run locally instead (writes to ./backup): put R2G_EMAIL, R2G_PASSWORD, R2G_GRAPH in .env
npm run backup
```

Per-format switches: set `R2G_BACKUP_JSON` / `R2G_BACKUP_EDN` / `R2G_BACKUP_MARKDOWN` / `R2G_BACKUP_MSGPACK` to `"false"` in the workflow env (all default to on).
