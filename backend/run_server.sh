#!/usr/bin/env bash
# Run the REFLECT backend from the backend directory so 'server' module is found.
cd "$(dirname "$0")"
uvicorn server:app --reload --port 8000
