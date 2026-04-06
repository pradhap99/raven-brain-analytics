FROM python:3.11-slim

WORKDIR /app

# Install deps
COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt

# Copy source
COPY packages/ /app/packages/
COPY apps/api/ /app/apps/api/
COPY workers/ /app/workers/

ENV PYTHONPATH=/app

CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
