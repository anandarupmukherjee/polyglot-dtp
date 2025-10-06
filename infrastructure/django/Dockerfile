FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY manage.py /app/manage.py
COPY portalbackend /app/portalbackend
COPY twins /app/twins
COPY scan_and_seed_twins.py /app/scan_and_seed_twins.py
COPY register_services.py /app/infrastructure/django/register_services.py

EXPOSE 8000
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

CMD ["/bin/bash","/app/entrypoint.sh"]
