import asyncio
from datetime import datetime, timedelta, timezone
import socket
import threading
import pytest
import uvicorn
from fastapi.testclient import TestClient
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from app.config import SafeError, FEEDS
from app.market import calendar, next_session, parse_prices, session_close
from app.model import forecast, eligible_news, estimate
from app.news import canonical_url, official_items, validate_items
from app.rag import validate_answer
from app import main, rag, db


def test_embedding_cold_start_is_singleton_under_concurrent_stock_writes(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import time
    import numpy as np
    from app import news
    created = []

    class FakeEmbedding:
        def __init__(self, **_):
            time.sleep(.02)
            created.append(self)

        def embed(self, _):
            yield np.ones(384)

    news.embedder.cache_clear()
    monkeypatch.setattr(news, 'TextEmbedding', FakeEmbedding)
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            vectors = list(pool.map(news.embedding, ['fixture'] * 4))
        assert len(created) == 1
        assert all(len(vector) == 384 for vector in vectors)
    finally:
        news.embedder.cache_clear()


def history():
    sessions = calendar('XNYS').sessions_in_range('2026-06-01','2026-11-19')[-70:]
    return [{'date':s.strftime('%Y-%m-%d'),'close':100+i*.2} for i,s in enumerate(sessions)]


def test_exchange_calendars_and_completed_candles():
    assert next_session('reliance','2026-01-23')=='2026-01-27'  # Republic Day
    assert next_session('apple','2026-11-25')=='2026-11-27'  # Thanksgiving
    assert session_close('apple','2026-11-27').hour==18  # Early close, EST
    payload = {'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':{'2026-11-19':{'4. close':'100'},'2026-11-20':{'4. close':'101'}}}
    rows = parse_prices(payload,'apple',datetime(2026,11,20,15,tzinfo=timezone.utc))
    assert rows==[{'date':'2026-11-19','close':100}]
    for bad,code in [({'Note':'secret raw quota body'},'provider-quota-or-entitlement'),({'Error Message':'secret'},'symbol-unavailable')]:
        with pytest.raises(SafeError,match=code):
            parse_prices(bad,'apple')


@pytest.mark.asyncio
async def test_provider_failures_preserve_saved_close_and_empty_state(monkeypatch):
    from app import market
    monkeypatch.setattr(market, 'now', lambda: datetime(2026,11,21,tzinfo=timezone.utc))
    saved = {'fetched_at': (datetime.now(timezone.utc)-timedelta(days=3)).isoformat(), 'prices': [{'date':'2026-11-19','close':123.45}]}
    monkeypatch.setattr(db, 'cached', lambda _: saved)
    monkeypatch.setattr(db, 'reserve', lambda *_: None)
    monkeypatch.setattr(db, 'save_prices', lambda *_: pytest.fail('Failure must not replace saved prices'))
    monkeypatch.setattr(market, 'configured', lambda _: 'fixture-private-key')

    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *_): pass
        async def get(self, *_args, **_kwargs):
            raise RuntimeError('https://provider.invalid/?apikey=fixture-private-key')

    monkeypatch.setattr(market.httpx, 'AsyncClient', lambda **_: Client())
    with pytest.raises(SafeError, match='^price-provider-unavailable$'):
        await market.refresh_price('apple')
    assert market.snapshot('apple')['prices'] == saved['prices']
    assert market.snapshot('apple')['state'] == 'stale'
    monkeypatch.setattr(db, 'reserve', lambda *_: (_ for _ in ()).throw(SafeError('provider-quota',429)))
    with pytest.raises(SafeError, match='provider-quota'):
        await market.refresh_price('apple')
    assert market.snapshot('apple')['fetched_at'] == saved['fetched_at']
    monkeypatch.setattr(db, 'cached', lambda _: None)
    assert market.snapshot('apple')['state'] == 'empty'
    assert market.snapshot('apple')['prices'] == []


@pytest.mark.asyncio
async def test_preclose_cache_does_not_suppress_postclose_refresh(monkeypatch):
    from app import market
    saved = {'fetched_at':'2026-11-20T19:00:00+00:00','prices':[{'date':'2026-11-19','close':123.45}]}
    monkeypatch.setattr(db, 'cached', lambda _: saved)
    monkeypatch.setattr(market, 'now', lambda: datetime(2026,11,20,20,tzinfo=timezone.utc))
    assert (await market.refresh_price('apple'))['state'] == 'cached'
    monkeypatch.setattr(market, 'now', lambda: datetime(2026,11,20,22,tzinfo=timezone.utc))
    monkeypatch.setattr(market, 'configured', lambda _: '')
    with pytest.raises(SafeError, match='alpha-key-not-configured'):
        await market.refresh_price('apple')  # Invalidated despite being only three hours old.
    saved['fetched_at'] = '2026-11-20T21:30:00+00:00'
    assert (await market.refresh_price('apple'))['state'] == 'cached'


def test_controlled_news_sensitivity_and_no_future_news():
    rows = history()
    cutoff = session_close('apple',rows[-1]['date'])
    n = {'relevant':True,'sample':False,'published_at':(cutoff-timedelta(hours=2)).isoformat(),'first_seen_at':(cutoff-timedelta(hours=1)).isoformat(),'sentiment':'positive'}
    base = forecast('apple',rows,[])
    positive = forecast('apple',rows,[n])
    negative = forecast('apple',rows,[{**n,'sentiment':'negative'}])
    assert base['mode']=='price-only'
    assert positive['mode']=='news-informed'
    assert positive['estimated_close']>base['estimated_close']>negative['estimated_close']
    assert positive['evaluation']['sessions']==base['evaluation']['sessions']
    assert positive['evaluation']['news_informed_mae'] is None
    assert positive['evaluation']['coverage_gap']
    for field in ('published_at','first_seen_at'):
        assert not eligible_news([{**n,field:(cutoff+timedelta(seconds=1)).isoformat()}],cutoff)
    assert not eligible_news([{**n,'sample':True}],cutoff)
    assert forecast('apple',rows[:20],[])['state']=='insufficient-history'
    assert estimate(rows[:60])==estimate(rows[:60],0)
    assert forecast('apple',rows,[],datetime(2026,11,21,tzinfo=timezone.utc))['target_is_past']
    assert not forecast('apple',rows,[],datetime(2026,11,20,12,tzinfo=timezone.utc))['target_is_past']


def test_allowlist_canonical_urls_and_metadata_validation():
    assert canonical_url('https://www.apple.com/newsroom/a/?utm_source=x#test','apple-newsroom')=='https://www.apple.com/newsroom/a'
    for url in ('http://www.apple.com/a','https://www.apple.com.evil.invalid/a','https://user:password@www.apple.com/a','https://www.apple.com:443/a'):
        with pytest.raises(SafeError): canonical_url(url,'apple-newsroom')
    record = {'url':'https://www.apple.com/newsroom/test','feed_id':'apple-newsroom','title':'<b>Fixture</b> Apple announcement','published_at':'2026-11-19T10:00:00Z','relevant':True,'sentiment':'positive'}
    values = validate_items('apple',[record,record],datetime(2026,11,20,tzinfo=timezone.utc))
    assert len(values)==1
    assert values[0]['publisher']=='Apple Newsroom'
    assert '<b>' not in values[0]['title']
    with pytest.raises(SafeError): validate_items('apple',[{**record,'relevant':'yes'}])
    with pytest.raises(SafeError): validate_items('apple',[{**record,'published_at':'2030-01-01T00:00:00Z'}])
    feed = next(f for f in FEEDS if f['id']=='tcs-newsroom')
    items = official_items(feed,'<span>17 Nov 2026</span><a href="https://www.tcs.com/who-we-are/newsroom/press-release/fixture">Fixture test announcement</a>')
    assert items[0]['publication_precision']=='date'
    assert items[0]['published_at'].startswith('2026-11-17T23:59:59')


def test_citation_validation_rejects_invented_sources():
    sources = [{'id':'known-record'}]
    valid = {'answer':'A source-grounded answer.','citations':['known-record'],'insufficient_evidence':False}
    assert validate_answer(valid,sources)==valid
    for bad in ({**valid,'citations':['made-up']},{**valid,'citations':[]},{**valid,'citations':['known-record','known-record']}):
        with pytest.raises(SafeError): validate_answer(bad,sources)
    assert db.safe_json({'time':datetime(2026,11,20,tzinfo=timezone.utc)})['time']=='2026-11-20T00:00:00+00:00'


@pytest.mark.asyncio
async def test_general_and_region_answers_work_without_headlines(monkeypatch):
    seen = []

    async def model(_, payload, __):
        seen.append(payload)
        return {'answer':'Fixture general explanation of the selected business and sector risks.','citations':[],'insufficient_evidence':False}

    async def no_price_tool(_):
        pytest.fail('Latest news must not be mistaken for a latest-price request')

    monkeypatch.setattr(rag,'retrieve',lambda *_: [])
    monkeypatch.setattr(rag,'groq_json',model)
    monkeypatch.setattr(rag,'call_snapshot',no_price_tool)
    general = await rag.ask('tcs','Explain the business model')
    assert general['state']=='answered'
    assert general['basis'].startswith('General model knowledge')
    assert seen[-1]['companies'][0]['id']=='tcs'
    await rag.ask('tcs','Explain the sectors in this region','market')
    assert {c['id'] for c in seen[-1]['companies']}=={'tcs','reliance'}
    await rag.ask('apple','What is the latest news?')
    assert seen[-1]['mcp_snapshot'] is None
    with pytest.raises(SafeError,match='rag-invalid-citations'):
        validate_answer({'answer':'Fixture','citations':['invented'],'insufficient_evidence':False},[],allow_general=True)


@pytest.mark.asyncio
async def test_manual_refresh_bypasses_cache_and_weekends_are_not_stale(monkeypatch):
    from app import market
    saved = {'fetched_at':'2026-11-20T21:30:00+00:00','prices':[{'date':'2026-11-20','close':123.45}]}
    monkeypatch.setattr(db,'cached',lambda _: saved)
    monkeypatch.setattr(market,'now',lambda: datetime(2026,11,20,22,tzinfo=timezone.utc))
    monkeypatch.setattr(market,'configured',lambda _: '')
    assert (await market.refresh_price('apple'))['state']=='cached'
    with pytest.raises(SafeError,match='alpha-key-not-configured'):
        await market.refresh_price('apple',force=True)
    monkeypatch.setattr(market,'now',lambda: datetime(2026,11,22,23,tzinfo=timezone.utc))
    result = market.snapshot('apple')
    assert result['state']=='saved'
    assert result['expected_session']=='2026-11-20'
    assert 'not a live quote' in result['freshness_note']


@pytest.mark.asyncio
async def test_forecast_question_receives_stored_numbers_not_invented_prices(monkeypatch):
    async def tool(_):
        return {'id':'apple','currency':'USD','state':'saved','as_of':'2026-11-20T12:00:00Z','fetched_at':'2026-11-20T11:00:00Z','prices':[{'date':'2026-11-19','close':123.45}]}

    async def model(_, payload, __):
        assert payload['stored_forecasts'][0]['payload']['estimated_close']==124
        assert payload['mcp_snapshot'][0]['latest_close']['close']==123.45
        return {'answer':'Fixture: stored experimental estimate is 124 USD.','citations':[],'insufficient_evidence':False}

    monkeypatch.setattr(rag,'call_snapshot',tool)
    monkeypatch.setattr(rag,'retrieve',lambda *_: [])
    monkeypatch.setattr(db,'query',lambda *_: [{'stock_id':'apple','payload':{'estimated_close':124,'mode':'price-only'}}])
    monkeypatch.setattr(rag,'groq_json',model)
    result = await rag.ask('apple','What is the next-session forecast?')
    assert result['state']=='answered' and result['tool']
    assert result['basis'].startswith('Stored MCP price')


def test_public_refresh_is_scoped_and_deduplicates_clicks(monkeypatch):
    from contextlib import contextmanager
    rows, writes, requested = [], [], []

    class Connection:
        def execute(self, sql, params):
            if sql.startswith('INSERT'):
                rows.append({'external_id':params[0],'status':'success'})
            return self

        def fetchall(self): return rows

    @contextmanager
    def transaction(_): yield Connection()

    async def refresh_region(market, force=False):
        requested.append((market,force))
        return [{'stock_id':'apple','state':'refreshed'}]

    monkeypatch.setattr(db,'transaction',transaction)
    monkeypatch.setattr(db,'query',lambda *args: writes.append(args) or [])
    monkeypatch.setattr(main,'refresh_market',refresh_region)
    client = TestClient(main.app)
    try:
        first=client.post('/v1/refresh',json={'market':'US'}).json()
        assert first['job_id'].startswith('web-US-') and not first['cooldown']
        assert requested==[('US',True)]
        assert writes[-1][1][0]=='success'
        second=client.post('/v1/refresh',json={'market':'US'}).json()
        assert second['cooldown'] and second['job_id']==first['job_id']
        assert len(requested)==1
        assert client.post('/v1/refresh',json={'market':'all'}).status_code==422
        assert client.get('/v1/refresh/other-id').status_code==404
    finally:
        client.close()


@pytest.mark.asyncio
async def test_mixed_price_and_news_question_passes_mcp_evidence(monkeypatch):
    async def tool(_):
        return {'id':'apple','currency':'USD','state':'saved','as_of':'2026-11-20T12:00:00Z','fetched_at':'2026-11-20T11:00:00Z','prices':[{'date':'2026-11-19','close':123.45}]}
    async def model(_,payload,__,max_tokens=1200):
        assert payload['mcp_snapshot'][0]['latest_close']['close']==123.45
        return {'answer':'Stored close is available; the headline does not establish causation.','citations':['known-record'],'insufficient_evidence':False}
    monkeypatch.setattr(rag,'call_snapshot',tool)
    monkeypatch.setattr(rag,'retrieve',lambda *_:[{'id':'known-record','title':'Fixture announcement'}])
    monkeypatch.setattr(rag,'groq_json',model)
    answer=await rag.ask('apple','Explain the latest close and news')
    assert answer['tool']['tool']=='get_stock_snapshot'
    assert answer['citations']==['known-record']


def test_scoped_ingestion_and_health_without_secrets(monkeypatch):
    monkeypatch.setenv('INGESTION_TOKEN','test-only-token-with-at-least-32-characters')
    monkeypatch.delenv('DATABASE_URL',raising=False)
    client = TestClient(main.app)
    try:
        assert client.get('/health').status_code==200
        assert client.get('/ready').status_code==503
        r = client.post('/internal/ingestion/news',json={'stock_id':'apple','records':[]})
        assert r.status_code==401
        assert r.json()=={'error':'ingestion-unauthorized'}
        assert client.get('/v1/stocks').json()=={'error':'database-not-configured'}
    finally:
        client.close()


@pytest.mark.asyncio
async def test_actual_mcp_protocol_and_assistant_tool_path(monkeypatch):
    monkeypatch.setattr(main,'snapshot',lambda stock_id:{'id':stock_id,'name':'Apple','symbol':'AAPL','exchange':'NASDAQ','market':'US','issue':None,'currency':'USD','state':'saved','as_of':'2026-11-20T12:00:00Z','fetched_at':'2026-11-20T11:00:00Z','prices':[{'date':'2026-11-19','close':123.45}]})
    sock = socket.socket()
    sock.bind(('127.0.0.1',0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(main.app,log_config=None,log_level='critical'))
    thread = threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True)
    thread.start()
    for _ in range(100):
        if server.started: break
        await asyncio.sleep(.03)
    assert server.started
    monkeypatch.setenv('PUBLIC_BACKEND_URL',f'http://127.0.0.1:{port}')
    try:
        async with streamablehttp_client(f'http://127.0.0.1:{port}/mcp/',timeout=5,sse_read_timeout=5) as (read,write,_):
            async with ClientSession(read,write) as client:
                initialized = await client.initialize()
                assert initialized.serverInfo.name=='StockSense public snapshots'
                tools = (await client.list_tools()).tools
                assert [t.name for t in tools]==['get_stock_snapshot']
                assert tools[0].annotations.readOnlyHint is True
                assert set(tools[0].inputSchema['properties']['stock_id']['enum'])=={'reliance','tcs','apple','microsoft'}
                result = await client.call_tool('get_stock_snapshot',{'stock_id':'apple'})
                assert not result.isError
                assert result.structuredContent['prices'][0]['close']==123.45
                bad = await client.call_tool('get_stock_snapshot',{'stock_id':'unknown'})
                assert bad.isError
        answer = await rag.ask('apple','What is the latest stored close?')
        assert answer['state']=='tool-answer'
        assert answer['tool']['transport']=='MCP Streamable HTTP'
        assert '123.45 USD' in answer['answer']
    finally:
        server.should_exit = True
        await asyncio.to_thread(thread.join,5)
        sock.close()
