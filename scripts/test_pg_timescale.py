import os, uuid, time
import psycopg
from datetime import datetime, timezone

PG_DSN = f"dbname={os.getenv('PGDATABASE','dtp')} user={os.getenv('PGUSER','dtp')} password={os.getenv('PGPASSWORD','dtp')} host=db port=5432"

def run():
    sig_id = uuid.uuid4()
    with psycopg.connect(PG_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("insert into signal(signal_id,name,unit) values(%s,%s,%s) on conflict do nothing",
                    (sig_id, "temp_room_1", "C"))
        now = datetime.now(timezone.utc)
        for i in range(5):
            cur.execute("""
              insert into observation(signal_id, ts, value_double, source)
              values (%s, %s, %s, %s)
              on conflict do nothing
            """, (sig_id, now, 20.0 + i, "test_pg"))
        cur.execute("select count(*) from observation where signal_id=%s", (sig_id,))
        count = cur.fetchone()[0]
    assert count >= 1, "Timescale insert failed"
    print(f"[PG] OK: wrote {count} rows for signal {sig_id}")
    return {"signal_id": str(sig_id), "rows": count}

if __name__ == "__main__":
    run()
