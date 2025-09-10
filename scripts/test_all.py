import os, json
from test_pg_timescale import run as test_pg
from test_neo4j import run as test_neo
from test_influx import run as test_influx
from test_minio import run as test_minio

def main():
    results = {
        "postgres_timescale": test_pg(),
        "neo4j": test_neo(),
        "influx": test_influx(),
    }

    skip_minio = os.getenv("DTP_SKIP_MINIO", "").lower() in ("1", "true", "yes")
    minio_endpoint = os.getenv("MINIO_ENDPOINT", "")
    if skip_minio or not minio_endpoint:
        print("[S3] SKIP: MinIO/LocalStack test disabled")
    else:
        results["minio"] = test_minio()
    print("\n=== SUMMARY ===")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
