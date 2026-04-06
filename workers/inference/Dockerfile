FROM python:3.11-slim

WORKDIR /app

COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt

COPY packages/ /app/packages/
COPY apps/api/ /app/apps/api/
COPY workers/ /app/workers/

ENV PYTHONPATH=/app

CMD ["python", "-m", "workers.inference.worker"]
