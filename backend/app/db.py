from contextlib import contextmanager
import json
from typing import Any
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from .config import configured, SafeError


@contextmanager
def transaction(write: bool = False):
    dsn = configured('DATABASE_URL')
    if not dsn:
        raise SafeError('database-not-configured')
    try:
        with psycopg.connect(dsn, connect_timeout=8, row_factory=dict_row, prepare_threshold=None) as conn:
            with conn.transaction():
                conn.execute('SET LOCAL statement_timeout = 10000')
                # Credentials stay server-side; ingestion cannot touch auth or watchlists.
                conn.execute('SET LOCAL ROLE stocksense_ingest' if write else 'SET LOCAL ROLE stocksense_reader')
                yield conn
    except SafeError:
        raise
    except Exception:
        raise SafeError('database-unavailable') from None


def query(sql: str, args: tuple = (), write: bool = False) -> list[dict]:
    with transaction(write) as conn:
        cursor = conn.execute(sql, args)
        return cursor.fetchall() if cursor.description else []


def cached(stock_id: str) -> dict | None:
    rows = query('SELECT payload, fetched_at FROM public.price_cache WHERE stock_id=%s', (stock_id,))
    if not rows:
        return None
    return {**rows[0]['payload'], 'fetched_at': rows[0]['fetched_at'].isoformat()}


def save_prices(stock_id: str, payload: dict):
    with transaction(True) as conn:
        conn.execute('INSERT INTO public.price_cache(stock_id,payload,fetched_at) VALUES(%s,%s,now()) ON CONFLICT(stock_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at', (stock_id, Jsonb(payload)))
        for p in payload['prices']:
            conn.execute('INSERT INTO public.prices(stock_id,session,close) VALUES(%s,%s,%s) ON CONFLICT(stock_id,session) DO UPDATE SET close=excluded.close', (stock_id, p['date'], p['close']))


def reserve(provider: str, daily: int, spacing: int):
    with transaction(True) as conn:
        allowed = conn.execute('SELECT public.reserve_provider_call(%s,%s,%s) AS allowed', (provider, daily, spacing)).fetchone()['allowed']
        if not allowed:
            raise SafeError('quota-cooldown', 429)


def safe_json(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))
