FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY manage.py /app/manage.py
COPY portalbackend /app/portalbackend
COPY twins /app/twins

EXPOSE 8000

CMD ["bash","-lc","python manage.py migrate && python manage.py loaddata initial_data.json || true; python manage.py runserver 0.0.0.0:8000"]
