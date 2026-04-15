# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This repository controls a GitHub Action that performs scheduled EXPORTING of an entire Roam Research graph database (BookResearch) via the 'dot menu' → 'EXPORT ALL' capability. Exports are compressed (.rar or .zip) and include .msgpack, .json, .edn, and .md files.

## Key Architecture

**Backup flow:**
1. This repository's workflow runs every 4 hours via cron (`0 */4 * * *`)
2. The workflow runs directly in this repo — no cloning of external repos needed since we already have a local clone
3. Uses Roam Research credentials from GitHub secrets to authenticate
4. Exports via the EXPORT ALL feature (dot menu)
5. The exported files are committed back to this repository

**Note:** The workflow executes directly in this repo. No need to clone anything — we already have the local working copy.

## Workflow File

- `.github/workflows/main.yml` — defines the backup pipeline in YAML
- Triggers: push to main, and every 4 hours via cron (`0 */4 * * *`)

## Important Constraints

- **60-day inactivity rule:** GitHub disables Actions if no repository changes for 60 days. Unlike the README touch-date approach, a dedicated log file (e.g., `.github/logs/backup-log.txt`) should track activity.
- **Secrets required:** `ROAM_EMAIL`, `ROAM_PASSWORD`, `ROAM_GRAPH`, `ACCESS_TOKEN`
- **Backup formats:** EDN, JSON, Markdown, MSGPACK (all enabled)
- **Compression:** Exports are compressed as .rar or .zip

## Development Notes

- No local build/test commands — all work happens in GitHub Actions
- `package.json` exists only as project metadata; no npm scripts are run locally
- Action code is YAML-based workflow definition
- This is a "set and forget" automation repo; changes are typically workflow refinements or log updates