FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Install runtime deps needed by psycopg2-binary and TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for better layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Copy app source (api + local libs used by imports)
COPY python_server /app/python_server
COPY python_db /app/python_db
COPY python_utils /app/python_utils

EXPOSE 8000

# Optional runtime env vars (override at deploy time)
ENV DATABASE_URL_PYTHON=postgresql+psycopg://postgres:postgres@python-db:5432/genghis

# Start FastAPI with Uvicorn
CMD ["python", "-m", "uvicorn", "python_server.api.main:app", "--host", "0.0.0.0", "--port", "8000"]