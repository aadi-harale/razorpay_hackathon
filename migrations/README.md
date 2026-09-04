# Database migrations

`001_initial.sql` is the committed schema snapshot used by ShadowFunnel. The local demo uses the idempotent schema initializer in `lib/db.ts` so first-run setup remains one-click. Keep this migration and `lib/db.ts` in sync when changing schema. Production deployment should apply equivalent ordered migrations through the deployment database workflow rather than depending on application startup DDL.
