FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir cherrypy==18.10.0 influxdb-client==1.45.0
COPY app.py /app/app.py
EXPOSE 3000
CMD ["python","/app/app.py"]
