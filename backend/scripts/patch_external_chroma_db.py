from __future__ import annotations

import json
import sqlite3
from pathlib import Path


CONFIG_TEMPLATE = {
    "hnsw_configuration": {
        "space": "l2",
        "ef_construction": 100,
        "ef_search": 10,
        "num_threads": 16,
        "M": 16,
        "resize_factor": 1.2,
        "batch_size": 100,
        "sync_threshold": 1000,
        "_type": "HNSWConfigurationInternal",
    },
    "_type": "CollectionConfigurationInternal",
}


def patch_db(db_path: Path) -> None:
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()

    cur.execute("select id, name, config_json_str from collections")
    rows = cur.fetchall()
    if not rows:
        raise RuntimeError("No collections found in external DB")

    replaced = 0
    for collection_id, name, config_json_str in rows:
        config_ok = False
        if isinstance(config_json_str, str) and config_json_str.strip():
            try:
                cfg = json.loads(config_json_str)
                config_ok = isinstance(cfg, dict) and "_type" in cfg
            except Exception:
                config_ok = False

        if not config_ok:
            cur.execute(
                "update collections set config_json_str = ? where id = ?",
                (json.dumps(CONFIG_TEMPLATE, ensure_ascii=False), collection_id),
            )
            replaced += 1

        # External DB uses "airforce_doctrine". Normalize to current project name.
        if name == "airforce_doctrine":
            cur.execute("update collections set name = ? where id = ?", ("air_force_doctrine", collection_id))

    con.commit()
    con.close()
    print(f"patched_collections={replaced}")


if __name__ == "__main__":
    target = Path(r"C:\Users\user\Downloads\doctrine_chroma_db\chroma.sqlite3")
    if not target.exists():
        raise FileNotFoundError(f"DB not found: {target}")
    patch_db(target)
    print(f"patched_db={target}")
