# Theme DB & Asset Deployment

Purpose
- Document the steps to deploy theme-related database changes and theme assets to production.

When to run
- You have a schema migration that adds or modifies theme tables/columns.
- You updated theme seed data (default themes, tokens) that must exist in prod.
- You changed theme asset files (images/PNGs) that need to be applied to tenant records.

Prerequisites
- `DATABASE_URL` set to the production database.
- Ensure you have a recent backup and tested migrations in staging.
- For local testing, use `DISABLE_REDIS=true` if Redis isn't available (dev convenience).

Primary production commands
- Run Prisma migrations (recommended for production):

```bash
npx prisma migrate deploy
```

- If you prefer `package.json` script, add and run:

```json
"db:deploy": "prisma migrate deploy"
```

```bash
npm run db:deploy
```

Data/seed changes
- If your theme changes include seed data (rows), run:

```bash
npm run db:seed
```

Theme assets
- To apply generated theme image assets (if your change includes new PNGs/icons):

```bash
npm run theme:assets:apply
```

Notes and warnings
- Do NOT use `npm run db:migrate` (this runs `prisma migrate dev` and is intended for development).
- `npm run db:push` writes the Prisma schema directly to the DB (no migrations). Avoid in production because it bypasses migration history.
- Always test `prisma migrate dev` and `prisma db seed` in a staging environment first.

Rollback strategy
- Prisma migrations are linear; to revert, restore the DB from backup or write a reversing migration.
- Keep backups before running production migrations.

CI/CD snippet (GitHub Actions)
```yaml
- name: Run DB migrations
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: npx prisma migrate deploy

- name: Seed DB (optional)
  if: success()
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: npm run db:seed

- name: Apply theme assets (optional)
  if: success()
  env:
    NODE_ENV: production
  run: npm run theme:assets:apply
```

Troubleshooting
- "ECONNREFUSED 127.0.0.1:6379": set `DISABLE_REDIS=true` in environment to skip Redis during dev/testing.
- Migration errors: inspect SQL in `prisma/migrations`, test on a copy of prod DB.

Contact
- If unsure, ask the platform/DB owner to coordinate the migration window.

---
File: docs/THEME_DB_DEPLOY.md
