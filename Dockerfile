# Multi-stage Dockerfile for HexPanel (Frontend + Backend)

# 1. Build frontend SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Python Backend & Static Server
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ ./backend/
RUN pip install --no-cache-dir ./backend

COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

ENV HEXPANEL_FRONTEND_DIST=/app/frontend/dist
ENV HEXPANEL_SERVE_FRONTEND=true
ENV HEXPANEL_DATA_DIR=/app/data
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
