FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    PYTHONPATH=/app

WORKDIR /app

# Install runtime deps needed by psycopg2-binary and TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install the repo-root Python dependencies used by the server image.
# This Dockerfile is built from the repository root in CI/Kubernetes deploys.
COPY ./requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip \
 && python -m pip install -r /app/requirements.txt \
 && python -m pip check

# Copy app source (api + local libs used by imports)
COPY python_server /app/python_server
COPY python_db /app/python_db
COPY python_utils /app/python_utils

EXPOSE 8000

# Optional runtime env vars (override at deploy time)
ENV DATABASE_URL_PYTHON=postgresql+psycopg2://postgres:postgres@python-db:5432/genghis

# Start FastAPI with Uvicorn
CMD ["python", "-m", "uvicorn", "python_server.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
