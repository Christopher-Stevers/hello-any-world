#!/usr/bin/env bash
# Run the Python FastAPI server from repo root.
# Requires: venv at repo root with packages installed (pip install -e ./python_db -e ./python_utils -e ./python_server)
set -e
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root/python_server"
exec python index.py
