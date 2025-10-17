FROM python:3.11-slim

WORKDIR /app
COPY ping.py /app/ping.py

RUN pip install influxdb-client pythonping

CMD ["python", "ping.py"]
