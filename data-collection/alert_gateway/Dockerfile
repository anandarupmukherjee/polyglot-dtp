FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir paho-mqtt==1.6.1 influxdb-client==1.45.0
COPY app.py /app/app.py
CMD ["python","/app/app.py"]
