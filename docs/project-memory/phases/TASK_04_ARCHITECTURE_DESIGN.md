# Task 04 Architecture transition design

Status: COMPLETE for design only, 2026-11-06. Runtime migration remains pending in subsequent tasks.

## Deliverables

- `../../architecture/TRANSITION_PLAN.md`: target layers, module/table/function mapping, identity and file migration, execution gates, tests and rollback.
- `../../architecture/current-dependencies.json`: local static inventory from baseline `8c1bfe4`, including dynamic RPC names known from code.
- Updated PROJECT_CONTEXT, checklist, ADR-039, risks and memory to distinguish target from current Supabase behavior.

## Validation scope

Validate JSON, referenced local paths, complete table/function classification and diff integrity. No functional test or production acceptance is claimed by this documentation milestone. No infrastructure, package, private configuration or data changes were performed.

## Next

Task 05: automatic validation and business coverage. Then implement M1 and later phases according to the design, using synthetic isolated data before production access or migration.
