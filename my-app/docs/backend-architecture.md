# Backend Architecture

This document defines the housekeeping structure for Convex backend code under `my-app/convex`.

## Goals

- Keep public Convex endpoint paths stable.
- Keep endpoint files thin and easy to scan.
- Isolate pure helpers from database orchestration.
- Make maintenance and repair flows explicit instead of mixing them into live endpoints.

## File Layout

Each backend domain should prefer this layout:

- `shared/`: constants, validators, keys, normalization, and other pure helpers
- `loaders/`: repeated indexed reads and lookup helpers
- `writers/`: repeated inserts, patches, deletes, and state transitions
- `readModels/`: response shaping and row/dashboard builders
- `workflows/`: multi-step orchestration, scheduler calls, chunked action flows
- `maintenance/`: backfills, rebuilds, repair jobs, and one-off admin routines
- `sources/`: external API adapters only

## Entrypoint Rule

- `queries.ts`, `mutations.ts`, `actions.ts`, and `sync.ts` are stable public entrypoints.
- Keep those files focused on exported Convex handlers plus any validators needed directly by the exports.
- Move implementation details into supporting modules and have the entrypoint delegate or re-export.

## Dependency Rule

Cross-domain imports should be limited to:

- `convex/lib/*`
- `convex/_generated/*`
- explicit shared type files
- explicit external source adapters under `sources/*`

Avoid importing another domain's endpoint file or domain-private implementation module.

## Refactor Guardrails

- Do not rename public Convex endpoints during housekeeping.
- Do not change schema tables or indexes unless the task explicitly calls for it.
- Prefer pure helper extraction before orchestration changes.
- Add tests for extracted pure logic before moving high-risk workflow code.
