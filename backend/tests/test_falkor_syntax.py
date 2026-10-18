from falkordb import FalkorDB
from backend.app.config import settings

def test_syntax():
    db = FalkorDB(
        host=settings.FALKORDB_HOST,
        port=settings.FALKORDB_PORT,
        password=settings.FALKORDB_PASSWORD
    )
    g = db.select_graph("test_traversal_syntax")
    try:
        # Create small test path: a -> b -> c
        g.query("MATCH (n) DETACH DELETE n")
        g.query("""
            CREATE (a:Concept {id: 'recursion', name: 'Recursion'}),
                   (b:Concept {id: 'functions', name: 'Functions'}),
                   (c:Concept {id: 'variables', name: 'Variables'}),
                   (a)-[:REQUIRES]->(b),
                   (b)-[:REQUIRES]->(c)
        """)
        
        # Test 1: Variable length path
        res1 = g.query("MATCH (a:Concept {id: 'recursion'})-[:REQUIRES*1..2]->(target:Concept) RETURN target.id, target.name")
        print("Test 1 (Variable length *1..2) rows:", res1.result_set)
        
        # Test 2: Fixed 1-hop and 2-hop explicit queries
        res2_hop1 = g.query("MATCH (a:Concept {id: 'recursion'})-[:REQUIRES]->(b:Concept) RETURN a.id, b.id")
        print("Test 2 (Explicit 1-hop) rows:", res2_hop1.result_set)
        
        res2_hop2 = g.query("MATCH (a:Concept {id: 'recursion'})-[:REQUIRES]->(b:Concept)-[:REQUIRES]->(c:Concept) RETURN a.id, b.id, c.id")
        print("Test 2 (Explicit 2-hop) rows:", res2_hop2.result_set)

    finally:
        g.delete()
        print("Cleaned up test_traversal_syntax graph via g.delete().")

if __name__ == "__main__":
    test_syntax()
