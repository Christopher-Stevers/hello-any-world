This is meant to be an easy startup boilerplate for creating and deploying multi-lang applications with languages, message brokers, and DB of your framework.
Goal is to eventually support FE framework of your choice.
Includes support for Node & Next TS, Golang, Python, each with their own MongoDB, PostgreSQL, Redis, and Kafka.
And of course package management, db and message bus connectors/orms, and hot reload is built in to each application.
Applications are run directly from the shell of their directory but pull their .env from the root to make configuration easy.
DBs, message brokers are managed via docker and setup instructions a UI on each DB and message brokers are below.
Mono repo support is being considered for some langs as well.

---

## Quick start

**1. Start databases and Kafka (from repo root)**

```bash
docker compose up -d
```

This brings up Postgres (PostGIS) per stack and Kafka:

| Service    | Host port | DB / use |
|-----------|-----------|----------|
| go-db     | 5433      | Go server |
| python-db | 5434      | Python server |
| express-db| 5435      | Express server |
| web-db    | 5436      | Next.js / Prisma |
| kafka     | 9092 (internal), 9094 (external) | Message broker |

**2. Env**

```bash
cp .env.example .env
```

Edit `.env` if needed; defaults point at `localhost` and the ports above (DB name `genghis`).

**3. Run each app (from repo root)**

| Stack   | Command | DB connection |
|---------|---------|----------------|
| **Go**  | `cd go_server && go run .` | `DATABASE_URL_GO` → `localhost:5433` |
| **Python** | From repo root: `python -m uvicorn pythonapp.api.main:app --reload` → `localhost:5434` |
| **Express** | `cd express_server && npm run start` | `DATABASE_URL_EXPRESS` → `localhost:5435` |
| **Web (Next.js)** | `cd web && npm run dev` | `DATABASE_URL_WEB` → `localhost:5436` |

**Install dependencies before running:**

From the repo root, install all dependencies at once:

- **Go** — from repo root:
  ```bash
  cd go_server && go mod tidy && cd ..
```
- **Python** — from repo root:
```bash
cd python_server && python -m venv venv && source venv/bin/activate && python -m pip install -e . -e ../python_utils -e ../python_db && cd ..
# Windows:
cd python_server; python -m venv venv; .\venv\Scripts\Activate.ps1; python -m pip install -e . -e ..\python_utils -e ..\python_db; cd ..
```
  If you see `ImportError: cannot import name 'get_env_bool' from 'python_utils'`, reinstall the local packages from `python_server` with venv active: `python -m pip install -e . -e ..\python_utils -e ..\python_db --force-reinstall --no-deps`.
- **Node (Express + Web)** — from repo root (install all at once):
```bash

  npm install --workspaces
  ```
  > Requires `workspaces` configured in the root `package.json`. If not yet set up, run individually:
  > ```bash
  > cd express_server && npm install && cd ..
  > cd web && npm install && cd ..
  > ```

---

## Python FastAPI app (pythonapp.api + libs/mypkg)

The app lives under `pythonapp/api/main.py` and is run as `pythonapp.api.main:app`. The local package under `libs/mypkg` can be installed in editable mode and imported (e.g. `from mypkg.stuff import thing`). No `PYTHONPATH` changes are required.

**Run context:** Start the app from the **repo root** so that the in-repo `python_db` package can be found (either because it is installed in the venv, or via the path hack in code). If you see `ModuleNotFoundError: No module named 'python_db'`, install it: `pip install -e python_db` (from repo root with venv active).

**Setup steps:**

```bash
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Unix:
# source .venv/bin/activate
pip install -e libs/mypkg
pip install -e python_db
pip install fastapi uvicorn
```

**Run (from repo root):**

```bash
python -m uvicorn pythonapp.api.main:app --reload
```
