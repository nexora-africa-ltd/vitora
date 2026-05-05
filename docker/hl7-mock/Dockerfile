FROM python:3.12-slim

RUN pip install --no-cache-dir hl7apy==1.3.4

WORKDIR /app
COPY server.py .

EXPOSE 2575
CMD ["python", "server.py"]
