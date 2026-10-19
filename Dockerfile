# Stage 1: build React frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + embedded frontend
FROM python:3.11-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
# CPU-only torch first: the default wheel bundles CUDA (several GB) this image never uses.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN useradd --create-home --uid 10001 documind \
    && mkdir -p data/uploads data/chroma_db /home/documind/.cache \
    && chown -R documind:documind /app /home/documind/.cache
USER documind
EXPOSE 8000
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
