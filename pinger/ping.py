import time
import os
from pythonping import ping
from influxdb_client import InfluxDBClient, Point

INFLUX_URL = os.environ.get("INFLUX_URL", "http://influxdb:8086")
INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN")
INFLUX_ORG = os.environ.get("INFLUX_ORG", "org")
INFLUX_BUCKET = os.environ.get("INFLUX_BUCKET", "bucket")
TARGET = os.environ.get("PING_TARGET", "1.1.1.1")
INTERVAL = int(os.environ.get("PING_INTERVAL", "30"))

client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
write_api = client.write_api()

while True:
    try:
        response = ping(TARGET, size=40, count=4, timeout=2)
        rtt = response.rtt_avg_ms
        packet_loss = (1 - (response.success_count / response.packets_sent)) * 100
        p = Point("ping") \
            .tag("target", TARGET) \
            .field("rtt_ms", float(rtt if rtt is not None else 0.0)) \
            .field("packet_loss_pct", float(packet_loss))
        write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=p)
    except Exception as e:
        p = Point("ping_error").field("error", 1).field("msg", str(e))
        try:
            write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=p)
        except:
            pass
    time.sleep(INTERVAL)
