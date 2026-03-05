# Python Server

## Quick start (from repo root)

1. **Create/activate venv** at repo root:  
   `python -m venv .venv` then activate (Windows: `.venv\Scripts\activate`; macOS/Linux: `source .venv/bin/activate`).

2. **Install packages:**  
   `pip install -e ./python_db -e ./python_utils -e ./python_server`

3. **Set the DB URL** in the root `.env` (copy from `.env.example` if needed):  
   `PYTHON_DATABASE_URL=postgresql://user:pass@host:port/dbname`  
   (Or use `DATABASE_URL_PYTHON`; the server and migrations use whichever is set.)

4. **Start the server:**  
   `python run_python_server.py`  
   That’s it — one command from the repo root. The script loads root `.env` and passes the DB URL through to the app and `python_db`.

5. **(Optional) Migrations** from root (with venv active and `PYTHON_DATABASE_URL` or `DATABASE_URL` set):  
   `alembic -c python_db/alembic.ini upgrade head`

## Run from repo root (other options)

- **Scripts:** `.\run_python_server.ps1` (Windows) or `./run_python_server.sh` (macOS/Linux) — same as `python run_python_server.py` but via shell.

## Run from python_server directory

1. Create/activate venv, then: `pip install -e . && pip install -e ../python_db && pip install -e ../python_utils`
2. Put `PYTHON_DATABASE_URL` or `DATABASE_URL_PYTHON` in `python_server/.env` or the repo root `.env`.
3. Run: `python index.py`  
   Migrations: `alembic -c ../python_db/alembic.ini upgrade head` (set `PYTHON_DATABASE_URL` or `DATABASE_URL` in env first).