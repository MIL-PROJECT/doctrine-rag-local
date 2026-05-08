import sqlite3


def inspect(path: str) -> None:
    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.execute("select name from sqlite_master where type='table' order by name")
    tables = [row[0] for row in cur.fetchall()]
    print("TABLES", tables)

    cur.execute("select id, name, dimension, config_json_str from collections")
    rows = cur.fetchall()
    print("COLLECTION_COUNT", len(rows))
    for row in rows[:10]:
        print("COLLECTION", row[1], "DIM", row[2], "CONFIG", row[3])

    cur.execute("select dir, version, filename from migrations order by dir, version")
    migrations = cur.fetchall()
    print("MIGRATIONS_COUNT", len(migrations))
    for row in migrations[-10:]:
        print("MIGRATION", row)

    cur.execute(
        """
        select c.name, m.key, m.str_value
        from collection_metadata m
        join collections c on c.id = m.collection_id
        where m.key like '%space%' or m.key like '%hnsw%'
        order by c.name, m.key
        """
    )
    print("COLLECTION_METADATA_SAMPLE", cur.fetchall()[:30])

    con.close()


if __name__ == "__main__":
    inspect("C:/Users/user/Downloads/doctrine_chroma_db/chroma.sqlite3")
