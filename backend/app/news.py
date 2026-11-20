from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from calendar import timegm
from functools import lru_cache
from pathlib import Path
import html
import re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import uuid
import httpx
import feedparser
from fastembed import TextEmbedding
from psycopg.types.json import Jsonb
from .config import FEEDS, SafeError, configured, now
from . import db


def canonical_url(raw: str, feed_id: str) -> str:
    source = next((s for s in FEEDS if s['id'] == feed_id), None)
    p = urlsplit(raw)
    if not source or p.scheme != 'https' or p.hostname not in source['hosts'] or p.username or p.password or p.port:
        raise SafeError('source-url-not-allowed', 422)
    query = urlencode([(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith('utm_') and k not in ('ocid','ref','at_medium','at_campaign')])
    return urlunsplit(('https', p.netloc.lower(), p.path.rstrip('/') or '/', query, ''))


def plain(value: str, maximum: int) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()[:maximum]


@lru_cache(maxsize=1)
def embedder():
    return TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2', threads=1, cache_dir=str(Path(__file__).resolve().parents[1] / '.cache' / 'models'))


def embedding(text: str) -> list[float]:
    try:
        return next(embedder().embed([text[:3000]])).tolist()
    except Exception:
        raise SafeError('embedding-model-unavailable') from None


def validate_items(stock_id: str, records: list[dict], first_seen: datetime | None = None) -> list[dict]:
    result = []
    seen = set()
    first_seen = first_seen or now()
    if len(records) > 8:
        raise SafeError('batch-too-large', 422)
    for n in records:
        feed = next((f for f in FEEDS if f['id'] == n.get('feed_id')), None)
        if not feed:
            raise SafeError('source-not-allowed', 422)
        url = canonical_url(n.get('url',''), feed['id'])
        title = plain(n.get('title',''), 300)
        try:
            published = datetime.fromisoformat(n.get('published_at','').replace('Z','+00:00'))
            if published.tzinfo is None or published > first_seen + timedelta(minutes=5):
                raise ValueError()
        except (ValueError, TypeError):
            raise SafeError('publication-time-invalid', 422) from None
        if not title or type(n.get('relevant')) is not bool or n.get('sentiment') not in ('positive','neutral','negative'):
            raise SafeError('classification-invalid', 422)
        if url in seen:
            continue
        seen.add(url)
        result.append({'id': str(uuid.uuid5(uuid.NAMESPACE_URL, stock_id + ':' + url)), 'stock_id': stock_id, 'canonical_url': url, 'title': title, 'summary': plain(n.get('summary',''), 500),
                       'publisher': feed['publisher'], 'feed_id': feed['id'], 'source_kind': feed['kind'], 'published_at': published, 'first_seen_at': first_seen,
                       'relevant': n['relevant'], 'sentiment': n['sentiment'], 'publication_precision': 'date' if n.get('publication_precision') == 'date' else 'timestamp'})
    return result


def ingest(stock_id: str, records: list[dict]) -> dict:
    items = validate_items(stock_id, records)
    # Embed before opening a transaction; a cold model download must not hold DB locks.
    vectors = {n['id']: embedding(n['title'] + ' ' + n['summary']) for n in items if n['relevant']}
    inserted = 0
    with db.transaction(True) as conn:
        for n in items:
            vector = str(vectors[n['id']]) if n['id'] in vectors else None
            cursor = conn.execute('''INSERT INTO public.news(id,stock_id,canonical_url,title,summary,publisher,feed_id,source_kind,published_at,first_seen_at,relevant,sentiment,publication_precision,embedding)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::extensions.vector)
                ON CONFLICT(stock_id,canonical_url) DO NOTHING RETURNING id''',
                tuple(n[k] for k in ('id','stock_id','canonical_url','title','summary','publisher','feed_id','source_kind','published_at','first_seen_at','relevant','sentiment','publication_precision')) + (vector,))
            if cursor.fetchone():
                inserted += 1
                conn.execute('INSERT INTO public.analysis(news_id,model,response) VALUES(%s,%s,%s)', (n['id'], 'openai/gpt-oss-20b', Jsonb({'relevant': n['relevant'], 'sentiment': n['sentiment']})))
    return {'received': len(records), 'normalized': len(items), 'inserted': inserted, 'duplicates': len(items) - inserted}


async def groq_json(system: str, payload: dict, schema: dict, max_tokens: int = 1200) -> dict:
    key = configured('GROQ_API_KEY')
    if not key:
        raise SafeError('groq-key-not-configured')
    db.reserve('groq', 20, 3)
    try:
        async with httpx.AsyncClient(timeout=35) as client:
            response = await client.post('https://api.groq.com/openai/v1/chat/completions', headers={'Authorization': f'Bearer {key}'}, json={
                'model': 'openai/gpt-oss-20b', 'temperature': 0, 'max_completion_tokens': max_tokens,
                'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': __import__('json').dumps(payload, default=str)}],
                'response_format': {'type':'json_schema','json_schema':{'name':'stocksense_response','strict':True,'schema':schema}}})
        if response.status_code == 429:
            raise SafeError('groq-quota',429)
        if response.status_code != 200:
            raise SafeError('groq-unavailable')
        return __import__('json').loads(response.json()['choices'][0]['message']['content'])
    except SafeError:
        raise
    except Exception:
        raise SafeError('groq-invalid-response') from None


async def probe_feed(feed: dict) -> dict:
    """Sanitized diagnostics only: no source URLs may be supplied by callers."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.get(feed['url'], headers={'User-Agent':'StockSense educational RSS reader/1.0'})
        if response.status_code != 200:
            return {'feed_id': feed['id'], 'status': 'feed-http-' + str(response.status_code), 'count': 0}
        parsed = feedparser.parse(response.content)
        items = [{'title': plain(n.get('title',''),300), 'url': n.get('link'), 'published_at': n.get('published') or n.get('updated')} for n in parsed.entries[:3]]
        return {'feed_id': feed['id'], 'status': 'ok' if parsed.entries else 'empty', 'count': len(parsed.entries), 'items': items}
    except Exception:
        return {'feed_id': feed['id'], 'status':'feed-unavailable', 'count':0}


def official_items(feed: dict, content: str) -> list[dict]:
    items = []
    for match in re.finditer(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',content,re.S|re.I):
        url,title = match.groups()
        if feed['id']=='tcs-newsroom':
            if '/newsroom/press-release/' not in url:
                continue
            context = plain(content[max(0,match.start()-350):match.end()],1200)
            dates = re.findall(r'\b(\d{1,2} [A-Za-z]{3} 20\d{2})\b',context)
            pattern = '%d %b %Y'
        else:
            if 'rilstaticasset.akamaized.net/' not in url or '.pdf' not in url:
                continue
            context = plain(content[match.end():match.end()+650],1000)
            dates = re.findall(r'\b(\d{1,2} [A-Za-z]{3}, 20\d{2})\b',context)
            pattern = '%d %b, %Y'
        if not dates:
            continue
        day = datetime.strptime(dates[-1] if feed['id']=='tcs-newsroom' else dates[0],pattern)
        # Date-only announcements conservatively become available at the end of that date.
        published = day.replace(hour=23,minute=59,second=59,tzinfo=ZoneInfo('Asia/Kolkata'))
        items.append({'title':plain(title,300),'url':url,'summary':'','published_at':published.isoformat(),'publication_precision':'date'})
    return items


async def fetch_feed(feed_id: str) -> dict:
    feed = next((f for f in FEEDS if f['id']==feed_id),None)
    if not feed:
        raise SafeError('source-not-allowed',422)
    state = 'feed-unavailable'
    items = []
    try:
        async with httpx.AsyncClient(timeout=20,follow_redirects=False) as client:
            response = await client.get(feed['url'],headers={'User-Agent':'StockSense educational headline reader/1.0'})
        if response.status_code==200 and len(response.content)<2_000_000:
            if feed.get('format')=='html':
                raw = official_items(feed,response.text)
            else:
                raw = []
                for n in feedparser.parse(response.content).entries[:40]:
                    timestamp = n.get('published_parsed') or n.get('updated_parsed')
                    if not timestamp:
                        continue
                    raw.append({'title':plain(n.get('title',''),300),'url':n.get('link',''),'summary':'',
                                'published_at':datetime.fromtimestamp(timegm(timestamp),timezone.utc).isoformat(),'publication_precision':'timestamp'})
            seen = set()
            for n in raw:
                try:
                    n['url'] = canonical_url(n['url'],feed_id)
                    if n['url'] not in seen and n['title']:
                        seen.add(n['url'])
                        items.append({**n,'feed_id':feed_id,'publisher':feed['publisher'],'source_kind':feed['kind'],'stock_id':feed.get('stock_id'),'market':feed['market']})
                except SafeError:
                    continue
            state = 'ok' if items else 'empty'
    except Exception:
        state = 'feed-unavailable'
    db.query('INSERT INTO public.source_checks(feed_id,status,item_count) VALUES(%s,%s,%s) ON CONFLICT(feed_id) DO UPDATE SET status=excluded.status,item_count=excluded.item_count,checked_at=now()', (feed_id,state,len(items)),True)
    return {'feed_id':feed_id,'status':state,'records':items,'first_seen_at':now().isoformat()}
