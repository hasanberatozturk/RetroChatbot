"""SQLite veritabanı: ziyaretçi defteri ve ziyaretçi sayacı.

Python'un kendi sqlite3 modülü kullanılır, ek paket gerekmez. Her işlem kendi
bağlantısını açar; FastAPI senkron endpoint'leri ayrı thread'lerde çalıştırdığı
için bağlantıları paylaşmamak en güvenlisi.
"""

import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).parent / "data" / "retrochatbot.db"


def db_path() -> Path:
    return Path(os.getenv("DATABASE_PATH", DEFAULT_DB_PATH))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as conn, conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS guestbook (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                city       TEXT NOT NULL DEFAULT '',
                message    TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS counters (
                name  TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            );
            """
        )


def increment_counter(name: str) -> int:
    with closing(connect()) as conn, conn:
        conn.execute(
            "INSERT INTO counters (name, value) VALUES (?, 1) "
            "ON CONFLICT(name) DO UPDATE SET value = value + 1",
            (name,),
        )
        row = conn.execute("SELECT value FROM counters WHERE name = ?", (name,)).fetchone()
        return row["value"]


def add_guestbook_entry(name: str, city: str, message: str) -> dict:
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(connect()) as conn, conn:
        cursor = conn.execute(
            "INSERT INTO guestbook (name, city, message, created_at) VALUES (?, ?, ?, ?)",
            (name, city, message, created_at),
        )
        return {"id": cursor.lastrowid, "name": name, "city": city, "message": message, "created_at": created_at}


def list_guestbook_entries(limit: int = 50) -> list[dict]:
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT id, name, city, message, created_at FROM guestbook ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
