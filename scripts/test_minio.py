import os, io, uuid
from minio import Minio

client = Minio("localhost:9000",
               access_key=os.getenv("MINIO_ACCESS_KEY","miniouser"),
               secret_key=os.getenv("MINIO_SECRET_KEY","miniopass123"),
               secure=False)
bucket = os.getenv("MINIO_BUCKET","dtp-artifacts")

def run():
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    key = f"tenant-demo/{uuid.uuid4()}.txt"
    data = io.BytesIO(b"hello-dtp")
    client.put_object(bucket, key, data, length=len(b"hello-dtp"),
                      content_type="text/plain")
    obj = client.get_object(bucket, key)
    body = obj.read()
    assert body == b"hello-dtp", "MinIO object mismatch"
    print(f"[MINIO] OK: put/get s3://{bucket}/{key}")
    return {"key": key, "len": len(body)}

if __name__ == "__main__":
    run()
