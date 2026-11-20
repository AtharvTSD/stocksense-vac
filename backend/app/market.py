from datetime import date, datetime, timedelta
from functools import lru_cache
import math
import httpx
import exchange_calendars as xcals
import pandas as pd
from .config import STOCKS, SafeError, configured, now
from . import db


@lru_cache(maxsize=4)
def calendar(name: str):
    try:
        # XBOM's maintained holiday data currently stops at 2026; fail beyond it.
        return xcals.get_calendar(name, start='2020-01-01', end='2026-12-31' if name == 'XBOM' else '2030-12-31')
    except Exception:
        raise SafeError('exchange-calendar-unavailable') from None


def session_close(stock_id: str, session: str) -> datetime:
    try:
        cal = calendar(STOCKS[stock_id].calendar)
        if not cal.is_session(session):
            raise SafeError('invalid-exchange-session')
        return cal.session_close(session).to_pydatetime()
    except SafeError:
        raise
    except Exception:
        raise SafeError('exchange-calendar-unavailable') from None


def next_session(stock_id: str, session: str) -> str:
    try:
        return calendar(STOCKS[stock_id].calendar).next_session(session).strftime('%Y-%m-%d')
    except Exception:
        raise SafeError('exchange-calendar-unavailable') from None


def parse_prices(data: dict, stock_id: str, clock: datetime | None = None) -> list[dict]:
    stock = STOCKS[stock_id]
    if data.get('Note') or data.get('Information'):
        raise SafeError('provider-quota-or-entitlement', 429)
    if data.get('Error Message') or data.get('Meta Data', {}).get('2. Symbol') != stock.symbol:
        raise SafeError('symbol-unavailable')
    series = data.get('Time Series (Daily)')
    if not isinstance(series, dict):
        raise SafeError('invalid-price-response')
    rows = []
    clock = clock or now()
    for session, item in sorted(series.items()):
        try:
            date.fromisoformat(session)
            close = float(item['4. close'])
            if not math.isfinite(close) or close <= 0:
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise SafeError('invalid-price-response') from None
        cal = calendar(stock.calendar)
        if not cal.is_session(session):
            continue
        if session_close(stock_id, session) + timedelta(minutes=15) <= clock:
            rows.append({'date': session, 'close': close})
    if not rows:
        raise SafeError('no-completed-sessions')
    return rows


def latest_completed_session(stock_id: str) -> str:
    expected = calendar(STOCKS[stock_id].calendar).date_to_session(pd.Timestamp(now().date()), direction='previous')
    if session_close(stock_id, expected.strftime('%Y-%m-%d')) + timedelta(minutes=15) > now():
        expected = calendar(STOCKS[stock_id].calendar).previous_session(expected)
    return expected.strftime('%Y-%m-%d')


def snapshot(stock_id: str) -> dict:
    stock = STOCKS[stock_id]
    stored = db.cached(stock_id)
    base = {'id': stock.id, 'name': stock.name, 'symbol': stock.symbol, 'exchange': stock.exchange, 'market': stock.market, 'currency': stock.currency, 'as_of': now().isoformat()}
    if not stored:
        return {**base, 'prices': [], 'state': 'empty', 'issue': 'no-successful-price-refresh', 'fetched_at': None}
    age = now() - datetime.fromisoformat(stored['fetched_at'])
    latest = stored['prices'][-1]['date']
    stale = age > timedelta(hours=30) or latest < latest_completed_session(stock_id)
    return {**base, **stored, 'state': 'stale' if stale else 'saved', 'issue': 'latest-available-session-lags' if stale else None}


async def refresh_price(stock_id: str) -> dict:
    old = db.cached(stock_id)
    if old:
        fetched = datetime.fromisoformat(old['fetched_at'])
        completed = session_close(stock_id, latest_completed_session(stock_id)) + timedelta(minutes=15)
        # A pre-close manual demo must not suppress the scheduled post-close refresh.
        # Cache a lagging provider response only if it was fetched after that cutoff.
        if now() - fetched < timedelta(hours=20) and fetched >= completed:
            return {'stock_id': stock_id, 'state': 'cached'}
    key = configured('ALPHA_VANTAGE_API_KEY')
    if not key:
        raise SafeError('alpha-key-not-configured')
    db.reserve('alpha', 8, 13)  # durable, shared quota accounting; 25/day provider free allowance
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get('https://www.alphavantage.co/query', params={'function': 'TIME_SERIES_DAILY', 'symbol': STOCKS[stock_id].symbol, 'outputsize': 'compact', 'apikey': key})
        if response.status_code == 429:
            raise SafeError('provider-quota', 429)
        if response.status_code != 200:
            raise SafeError('price-provider-unavailable')
        prices = parse_prices(response.json(), stock_id)
        db.save_prices(stock_id, {'prices': prices, 'provider': 'Alpha Vantage', 'adjusted': False})
        return {'stock_id': stock_id, 'state': 'refreshed', 'sessions': len(prices)}
    except SafeError:
        raise
    except Exception:
        raise SafeError('price-provider-unavailable') from None
