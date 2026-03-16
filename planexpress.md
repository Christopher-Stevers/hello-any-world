# Plan: Fresh-Slate Migration to Service-Owned Express DB (Same Postgres Instance)

## Goal
Move from the current default/shared-style Express DB connection to a clean, service-owned setup where `express_server` connects to its own logical database (`express_db`) on the same Postgres instance.

This plan assumes:
- Fresh slate (no existing production data to preserve)
- No hardening tasks in this document
- Custom resource will be used for DB bootstrap

---

## Target State
- One Postgres instance (existing)
- Express owns:
  - database: `express_db`
  - user: `express_user`
  - app secret: `ExpressDatabaseUrlSecret`
  - k8s secret: `express-server-db`
- Bootstrap runs via custom resource in the CDK stack to create DB/user/grants idempotently
- Express pod receives `DATABASE_URL` that points to `express_db`

---

## Scope

### In scope
1. Refactor config to Express-specific DB settings
2. Create dedicated Express DB credentials secret
3. Add custom resource for DB bootstrap (create DB/user/grants)
4. Replace generic/shared DB URL secret with Express-specific DB URL secret
5. Ensure Kubernetes secret `express-server-db` points to Express DB URL
6. Deploy stack and validate Express connectivity

### Out of scope
- Security hardening
- Data migration/preservation from existing DB contents
- Python rollout details (can be added later)

---

## Implementation Steps

## Phase 1 — Config refactor
1. Update config to include service-specific Express DB properties:
   - `postgres.express.dbName = "express_db"`
   - `postgres.express.username = "express_user"`
2. Keep shared instance-level settings unchanged (instance type, storage, port, etc.).

**Exit criteria:** stack references Express DB name/username through `postgres.express.*` values.

---

## Phase 2 — Express credentials secret
1. Add a dedicated DB credentials secret for Express:
   - logical id suggestion: `ExpressDbCredentialsSecret`
2. Stop using a generic/shared service DB credential for Express runtime URL construction.

**Exit criteria:** Express has its own DB credential source.

---

## Phase 3 — Custom resource bootstrap
1. Add a Lambda-backed custom resource in the same CDK stack.
2. Lambda connects to Postgres and runs idempotent SQL on create/update:
   - create database `express_db` if missing
   - create role/user `express_user` if missing
   - grant privileges on `express_db` to `express_user`
3. Configure resource dependencies so bootstrap runs only after DB is available.

**Exit criteria:** after deploy, `express_db` and `express_user` exist and are usable.

---

## Phase 4 — Express DATABASE_URL secret
1. Replace generic/shared URL secret usage with Express-specific secret:
   - logical id suggestion: `ExpressDatabaseUrlSecret`
2. Set:
   - `DATABASE_URL=postgresql://express_user:<password>@<endpoint>:<port>/express_db?sslmode=require`
3. Ensure this secret is created after bootstrap dependency is satisfied.

**Exit criteria:** AWS secret resolves to Express-specific DB URL.

---

## Phase 5 — Kubernetes secret wiring
1. Ensure `express-server-db` in app namespace points to the Express URL secret value.
2. Keep current `.env` pattern for Express pod consumption.

**Exit criteria:** `express_server` pod receives `DATABASE_URL` for `express_db`.

---

## Phase 6 — Deploy and verify
1. Deploy CDK changes.
2. Run Express migrations against `express_db`.
3. Deploy/restart `express_server`.
4. Validate:
   - app boots successfully
   - DB connection succeeds
   - migrations applied to `express_db`
   - one read + one write app smoke test succeeds

**Exit criteria:** Express is fully operational on dedicated logical DB `express_db`.

---

## Dependency Order (important)
1. Postgres instance exists
2. Express credential secret exists
3. Bootstrap custom resource runs
4. Express DATABASE_URL secret is created
5. Kubernetes `express-server-db` secret is applied
6. Express deployment uses that secret

---

## Deliverables
- Updated config with `postgres.express.*`
- New Express DB credentials secret resource
- New custom resource for DB bootstrap
- New/updated `ExpressDatabaseUrlSecret`
- Updated `express-server-db` k8s secret mapping
- Successful Express connectivity + migration verification

---

## Completion Checklist
- [ ] Config includes `postgres.express.dbName` and `postgres.express.username`
- [ ] `ExpressDbCredentialsSecret` added
- [ ] Custom resource added and idempotent
- [ ] `ExpressDatabaseUrlSecret` points to `/express_db`
- [ ] `express-server-db` references Express URL secret
- [ ] CDK deploy succeeds
- [ ] Express migrations succeed
- [ ] Express read/write smoke test succeeds