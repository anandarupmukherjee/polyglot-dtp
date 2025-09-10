import os, io, uuid
from urllib.parse import urlparse
from minio import Minio


def _build_client():
    # Pick endpoint from env. Locally this will be http://localhost:9000 (MinIO),
    # in CI it will be http://localhost:4566 (LocalStack S3).
    endpoint_env = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    parsed = urlparse(endpoint_env)
    endpoint = parsed.netloc or endpoint_env  # strip scheme for Minio client
    secure = (parsed.scheme == "https")

    access = os.getenv("MINIO_ACCESS_KEY", "miniouser")
    secret = os.getenv("MINIO_SECRET_KEY", "miniopass123")

    # Region not required for MinIO/LocalStack in path-style mode
    return Minio(endpoint, access_key=access, secret_key=secret, secure=secure)


client = _build_client()
bucket = os.getenv("MINIO_BUCKET", "dtp-artifacts")


def run():
    # Ensure bucket exists
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)

    # Put an object
    key = f"tenant-demo/{uuid.uuid4()}.txt"
    data = io.BytesIO(b"hello-dtp")
    client.put_object(
        bucket_name=bucket,
        object_name=key,
        data=data,
        length=len(b"hello-dtp"),
        content_type="text/plain",
    )

    # Get it back and verify
    obj = client.get_object(bucket, key)
    body = obj.read()
    assert body == b"hello-dtp", "Object content mismatch"

    print(f"[S3] OK: put/get s3://{bucket}/{key}")
    return {"key": key, "len": len(body)}


if __name__ == "__main__":
    run()
