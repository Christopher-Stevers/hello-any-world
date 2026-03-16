# Plan: Simplest Implementation for `python_server` Pod to Use Its Own DB (Same RDS Instance)

## Goal
Connect the `python_server` pod to a dedicated PostgreSQL database (`python_db`) while continuing to use the existing single RDS Postgres instance and existing EKS network/security setup.

## Why this approach
- Minimal infrastructure change
- Fastest path to service-level schema ownership
- Lowest operational complexity right now
- Keeps cost lower than provisioning a second DB instance/cluster

---

## Scope

### In scope
1. Create a new logical database: `python_db`
2. Create a dedicated DB user: `python_user`
3. Grant `python_user` access only to `python_db`
4. Add a Python-specific AWS secret containing `DATABASE_URL`
5. Add a Python-specific Kubernetes secret (`python-server-db`)
6. Wire `python_server` pod to consume that secret
7. Run Python migrations against `python_db`
8. Validate runtime DB connectivity

### Out of scope (for now)
- New Aurora cluster/instance
- Automated DB bootstrap custom resource
- Secret rotation automation
- Cross-service data sharing patterns

---

## Prerequisites
- Existing stack with EKS + RDS deployed
- Ability to connect to Postgres with admin-capable credentials
- `python_server` can read `DATABASE_URL` from env or mounted `.env`
- CI/deploy permissions to roll out CDK and Kubernetes changes

---

## Implementation Phases

## Phase 1 — One-time DB bootstrap (manual)
1. Connect to the existing Postgres instance.
2. Create database:
   - `python_db`
3. Create role/user:
   - `python_user` with a strong password
4. Grant privileges:
   - `python_user` has required rights on `python_db` only
5. Verify login and access to `python_db` using `python_user`.

**Exit criteria:**  
`python_db` exists and `python_user` can connect and run expected DDL/DML for migrations.

---

## Phase 2 — CDK secrets and K8s secret
1. In `infra/cdk/lib/eks-stack.ts`, add a new Secrets Manager secret for Python DB URL:
   - Suggested logical ID: `PythonDatabaseUrlSecret`
   - Contains key:
     - `DATABASE_URL=postgresql://python_user:<password>@<rds-endpoint>:<port>/python_db?sslmode=require`
2. Extend the current manifest list (Namespace + express secret) with a second app secret:
   - Name: `python-server-db`
   - Namespace: `config.namespace`
   - Type: `Opaque`
   - `stringData[".env"]` includes:
     - `PYTHON_ENV=production`
     - `DATABASE_URL=<python DATABASE_URL>`
3. (Optional) Add stack output:
   - `KubernetesPythonDatabaseSecretName = python-server-db`

**Exit criteria:**  
After deploy, Kubernetes contains `python-server-db` in the app namespace.

---

## Phase 3 — Python deployment wiring
1. Update `python_server` deployment to consume `python-server-db`:
   - Option A: mount `.env` file from secret
   - Option B: map env vars from secret
2. Ensure app boot path reads `DATABASE_URL`.
3. Deploy `python_server`.

**Exit criteria:**  
Pod starts and reads a non-empty `DATABASE_URL` pointing to `python_db`.

---

## Phase 4 — Migrations and validation
1. Run Python ORM migrations against `python_db`.
2. Confirm schema objects are created in `python_db` only.
3. Validate app health and DB connectivity via logs/health endpoints.
4. Execute one write + one read smoke test from `python_server`.

**Exit criteria:**  
Migrations succeed and app serves requests with successful DB operations.

---

## Security and ownership rules
- Do not reuse Express credentials for Python.
- Keep separate secrets:
  - Express → `express-server-db`
  - Python → `python-server-db`
- Restrict DB user privileges to owned database only.
- No cross-service joins or direct table access across service boundaries.

---

## Acceptance Criteria
- `python_server` runs with a valid `DATABASE_URL`
- Python migrations apply to `python_db` only
- Express service remains unaffected
- DB credentials are isolated per service
- Kubernetes secrets are namespaced and correctly mounted/injected

---

## Rollback Plan
1. Revert `python_server` deployment env/secret reference to previous state.
2. Re-deploy prior working image/config.
3. Keep `python_db` and secret objects for later retry (safe).
4. Investigate logs and migration output, then reattempt in a controlled deploy.

---

## Suggested Naming
- Database: `python_db`
- DB user: `python_user`
- AWS secret: `PythonDatabaseUrlSecret`
- K8s secret: `python-server-db`

---

## Next Iteration (optional, later)
- Automate DB/user creation in infrastructure pipeline
- Enable managed secret rotation
- Add CI guardrails to prevent wrong-target migrations
- Add per-service DB metrics/alerts (connections, CPU, slow queries)