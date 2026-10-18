"""
Smoke test to verify FalkorDB connection, write, and read-only query capabilities.
"""
from falkordb import FalkorDB
from backend.app.config import settings

def main():
    print(f"Connecting to FalkorDB on {settings.FALKORDB_HOST}:{settings.FALKORDB_PORT}...")
    db = FalkorDB(
        host=settings.FALKORDB_HOST,
        port=settings.FALKORDB_PORT,
        password=settings.FALKORDB_PASSWORD
    )
    
    graph_name = "recallai_smoke_test"
    g = db.select_graph(graph_name)
    
    # 1. Clean previous smoke test node if any
    g.query("MATCH (n:SmokeTestNode) DELETE n")
    
    # 2. Write test using query() with parameters
    write_cypher = "CREATE (n:SmokeTestNode {name: $name, marker: $marker}) RETURN n.name, n.marker"
    params = {"name": "FalkorPersistenceTest", "marker": "phase_1_verified"}
    write_res = g.query(write_cypher, params)
    print("Write result rows:", write_res.result_set)
    print("Write run time (ms):", write_res.run_time_ms)
    
    # 3. Read test using ro_query()
    read_cypher = "MATCH (n:SmokeTestNode {name: $name}) RETURN n.name, n.marker"
    read_res = g.ro_query(read_cypher, {"name": "FalkorPersistenceTest"})
    print("Read-only result rows:", read_res.result_set)
    print("Read run time (ms):", read_res.run_time_ms)
    
    assert len(read_res.result_set) == 1
    assert read_res.result_set[0][0] == "FalkorPersistenceTest"
    assert read_res.result_set[0][1] == "phase_1_verified"
    print("SMOKE TEST SUCCESS: FalkorDB read & write verified!")

if __name__ == "__main__":
    main()
