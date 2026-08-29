# Phase 00 — Safe Baseline

**Status:** COMPLETE

**Verified:** 2026-08-29

## Objective

Prevent every inherited n8n workflow from automatically running searches, writing data, generating an adapted CV, or sending notifications while the new architecture is built.

## Files in Scope

- `workflows/generar-cv-adaptado.json`
- `workflows/job-linkedin.json`
- `workflows/jobs-computrabajo.json`
- `workflows/metricas-semanales.json`
- `workflows/resumen-diario-telegram.json`

## Changes

- Confirmed all five workflow documents have root-level `active=false`.
- Four workflows required an `active: true` to `active: false` change during the baseline work; `metricas-semanales.json` was already inactive.
- Did not remove nodes or change workflow IDs, connections, schedules, credential references, or inherited business logic.

## Validations

- All five files parsed as valid JSON.
- All five reported `active=false`.
- Every connection target referenced an existing node.
- Connection-graph validation covered 20 edges for adapted CV generation, 16 for LinkedIn, 19 for Computrabajo, 5 for weekly metrics, and 6 for the Telegram daily summary.
- Diff review confirmed the only functional change was workflow deactivation.
- `git diff --check`, diff statistics, and short status were reviewed at completion.

## Result

Phase 0 is complete. The legacy workflows are inert by configuration but remain unadapted and still contain inherited author-specific data and fragile legacy logic. Their inactive status is a safety baseline, not evidence that they are production-ready.
