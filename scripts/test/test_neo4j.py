import os, uuid
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()
URI = "bolt://localhost:7687"
AUTH = ("neo4j", os.getenv("NEO4J_PASSWORD","neo"))

def run():
    driver = GraphDatabase.driver(URI, auth=AUTH)
    twin_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    with driver.session() as s:
        s.run("CREATE CONSTRAINT IF NOT EXISTS FOR (t:Twin) REQUIRE t.twin_id IS UNIQUE")
        s.run("CREATE CONSTRAINT IF NOT EXISTS FOR (a:Asset) REQUIRE a.asset_id IS UNIQUE")
        s.run("MERGE (t:Twin {twin_id:$tid}) SET t.kind='demo'", tid=twin_id)
        s.run("MERGE (a:Asset {asset_id:$aid}) SET a.type='room'", aid=asset_id)
        s.run("""
            MATCH (t:Twin {twin_id:$tid}), (a:Asset {asset_id:$aid})
            MERGE (t)-[:MIRRORS]->(a)
        """, tid=twin_id, aid=asset_id)
        rels = s.run("""
            MATCH (t:Twin {twin_id:$tid})-[:MIRRORS]->(a:Asset {asset_id:$aid})
            RETURN count(*) AS c
        """, tid=twin_id, aid=asset_id).single()["c"]
    assert rels == 1, "Neo4j relation missing"
    print(f"[NEO4J] OK: Twin {twin_id} MIRRORS Asset {asset_id}")
    driver.close()
    return {"twin_id": twin_id, "asset_id": asset_id}

if __name__ == "__main__":
    run()
