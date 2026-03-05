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
| **Go**  | `go run ./go_server` | `DATABASE_URL_GO` → `localhost:5433` |
| **Python** | `python run_python_server.py` | `DATABASE_URL_PYTHON` → `localhost:5434` |
| **Express** | `npm run express:start` | `DATABASE_URL_EXPRESS` → `localhost:5435` |
| **Web (Next.js)** | `npm run dev` | `DATABASE_URL_WEB` → `localhost:5436` |

Install deps first where needed: `npm install` (root) for Node/Express/Web; Python/Go per your usual setup.
