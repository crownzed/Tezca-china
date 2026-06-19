FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY raw_data ./raw_data

ENV PYTHONPATH=/app

CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"
