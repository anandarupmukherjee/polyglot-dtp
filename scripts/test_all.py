import json
from test_pg_timescale import run as test_pg
from test_neo4j import run as test_neo
from test_influx import run as test_influx
from test_minio import run as test_minio

def main():
    results = {
        "postgres_timescale": test_pg(),
        "neo4j": test_neo(),
        "influx": test_influx(),
        "minio": test_minio()
    }
    print("\n=== SUMMARY ===")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
