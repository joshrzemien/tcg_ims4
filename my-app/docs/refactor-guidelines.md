# Refactor Guidelines

- Do not change public route paths or Convex endpoint paths during housekeeping refactors.
- Keep feature entrypoints focused on composition. UI, formatting, and domain helpers should live in separate modules.
- Keep low-level reusable primitives in `src/components/ui` or `src/features/shared`; do not create duplicate local helper patterns once a shared version exists.
- Target file sizes:
- feature entrypoints: under 300 LOC
- extracted UI components: under 400 LOC unless they are table definition modules
- Convex endpoint files: exported handlers plus minimal orchestration only
- Extract repeated Convex reads into `loaders`, repeated writes into `writers`, and backfill/admin flows into `maintenance`.
- Run `npm run check` after each refactor batch.
