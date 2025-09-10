FROM influxdb:2 as influx

FROM grafana/grafana:10.4.5

USER root
RUN apk add --no-cache bash python3 py3-pip

# Copy InfluxDB 2 server + CLI from official image
COPY --from=influx /usr/local/bin/influxd /usr/local/bin/influxd
COPY --from=influx /usr/local/bin/influx /usr/local/bin/influx

RUN pip3 install --break-system-packages --no-cache-dir influxdb-client==1.45.0 paho-mqtt==1.6.1

WORKDIR /app
COPY entrypoint.sh /app/entrypoint.sh
COPY generator.py /app/generator.py
RUN chmod +x /app/entrypoint.sh

# Provisioning dirs for Grafana
RUN mkdir -p /etc/grafana/provisioning/datasources /etc/grafana/provisioning/dashboards /var/lib/influxdb2

EXPOSE 3000
CMD ["/bin/bash","/app/entrypoint.sh"]
