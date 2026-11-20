from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime
from typing import Literal
import asyncio
import hashlib
import hmac
import time
import uuid
from urllib.parse import urlsplit
from fastapi import FastAPI, Depends, Header, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from mcp.server.transport_security import TransportSecuritySettings
from psycopg.types.json import Jsonb
from .config import STOCKS, FEEDS, SafeError, configured, now
from . import db
from .market import snapshot, refresh_price, session_close
from .model import forecast
from .news import ingest, fetch_feed
from .rag import ask

StockID = Literal['reliance','tcs','apple','microsoft']


class SnapshotPrice(BaseModel):
    date: str
    close: float = Field(gt=0)


class SnapshotToolResult(BaseModel):
    id: StockID
    name: str
    symbol: str
    exchange: str
    market: Literal['India','US']
    currency: Literal['INR','USD']
    as_of: datetime
    fetched_at: datetime | None
    state: str
    issue: str | None
    prices: list[SnapshotPrice]


host = urlsplit(configured('PUBLIC_BACKEND_URL')).hostname
mcp = FastMCP('StockSense public snapshots', stateless_http=True, json_response=True, streamable_http_path='/',
              transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True,allowed_hosts=['127.0.0.1:*','localhost:*'] + ([host,host+':*'] if host else [])))


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False))
def get_stock_snapshot(stock_id: StockID) -> SnapshotToolResult:
    """Read the timestamped stored EOD snapshot of one of four public companies. No writes, provider refresh or private watchlist data."""
    return SnapshotToolResult.model_validate(snapshot(stock_id))


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(title='StockSense hosted pilot',version='0.2.0',lifespan=lifespan)
origins = [o.strip().rstrip('/') for o in configured('FRONTEND_ORIGIN').split(',') if o.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins or ['http://localhost:3000'],allow_methods=['GET','POST'],allow_headers=['Content-Type','Authorization'])


@app.exception_handler(SafeError)
async def safe_error(_: Request,error: SafeError):
    return JSONResponse(status_code=error.status,content={'error':error.code})


@app.exception_handler(Exception)
async def unexpected_error(_: Request,__ : Exception):
    # Never return/log raw exceptions from network clients or DB drivers.
    return JSONResponse(status_code=500,content={'error':'internal-error'})


def ingestion_auth(authorization: str = Header(default='')):
    token = configured('INGESTION_TOKEN')
    if len(token) < 32 or not hmac.compare_digest(authorization,'Bearer '+token):
        raise SafeError('ingestion-unauthorized',401)


@app.get('/health')
def health():
    return {'status':'alive','service':'stocksense','at':now().isoformat()}


@app.get('/ready')
def ready():
    missing = [k for k in ('DATABASE_URL','GROQ_API_KEY','ALPHA_VANTAGE_API_KEY','INGESTION_TOKEN') if not configured(k)]
    if missing:
        return JSONResponse(status_code=503,content={'status':'not-ready','missing_fields':missing})
    db.query('SELECT id FROM public.stocks LIMIT 1')
    identity = db.query('SELECT session_user AS login_role')[0]['login_role']
    if identity != 'stocksense_backend':
        return JSONResponse(status_code=503,content={'status':'not-ready','error':'runtime-credential-not-scoped'})
    return {'status':'ready','scoped_storage':True,'at':now().isoformat()}


@app.get('/v1/status')
def status():
    runs = db.query('SELECT external_id,started_at,finished_at,status,counts,failures FROM public.workflow_runs ORDER BY started_at DESC LIMIT 5')
    success = db.query("SELECT finished_at FROM public.workflow_runs WHERE status='success' ORDER BY finished_at DESC LIMIT 1")
    return db.safe_json({'runs':runs,'last_success':success[0]['finished_at'] if success else None,'sources':db.query('SELECT * FROM public.source_checks')})


def news_for(stock_id: str) -> list[dict]:
    return db.safe_json(db.query('SELECT id,stock_id,title,summary,canonical_url,publisher,source_kind,published_at,publication_precision,first_seen_at,relevant,sentiment FROM public.news WHERE stock_id=%s AND relevant ORDER BY published_at DESC LIMIT 200', (stock_id,)))


@app.get('/v1/stocks')
def stocks():
    return {'stocks':[snapshot(stock_id) for stock_id in STOCKS]}


@app.get('/v1/stocks/{stock_id}')
def detail(stock_id: StockID):
    data = snapshot(stock_id)
    news = news_for(stock_id)
    forecasts = db.query('SELECT payload,generated_at FROM public.forecasts WHERE stock_id=%s ORDER BY cutoff DESC LIMIT 1',(stock_id,))
    data['news'] = news[:30]
    data['forecast'] = db.safe_json(forecasts[0]) if forecasts else {'payload':{'state':'not-generated'}}
    prediction = data['forecast']['payload']
    if prediction.get('target_session'):
        prediction['target_is_past'] = session_close(stock_id,prediction['target_session']) <= now()
    return data


class Question(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=3,max_length=600)
    scope: Literal['stock','market'] = 'stock'


ask_windows: dict[str,list[float]] = {}


@app.post('/v1/stocks/{stock_id}/ask')
async def question(stock_id: StockID,body: Question,request: Request):
    # Public demo safety budget, no raw IPs persisted. The database enforces daily Groq limits.
    identity = hashlib.sha256((request.client.host if request.client else 'public').encode()).hexdigest()
    current = time.monotonic()
    active = [t for t in ask_windows.get(identity,[]) if current-t < 3600]
    if len(active)>=30:
        raise SafeError('assistant-hourly-limit',429)
    ask_windows[identity] = [*active,current]
    return await ask(stock_id,body.question,body.scope)


@app.get('/internal/ingestion/config',dependencies=[Depends(ingestion_auth)])
def ingestion_config(market: Literal['India','US','all']='all'):
    selected = {k:asdict(s) for k,s in STOCKS.items() if market=='all' or s.market==market}
    feeds = [f for f in FEEDS if f['market'] in (market,'World') or market=='all']
    return {'feeds':feeds,'stocks':list(selected.values()),'schema_version':1}


@app.post('/internal/ingestion/reserve-groq',dependencies=[Depends(ingestion_auth)])
def reserve_groq():
    db.reserve('groq',40,3)
    return {'reserved':True}


@app.get('/internal/ingestion/feed/{feed_id}',dependencies=[Depends(ingestion_auth)])
async def approved_feed(feed_id: str):
    return await fetch_feed(feed_id)


class Batch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    stock_id: StockID
    records: list[dict] = Field(max_length=8)


@app.post('/internal/ingestion/news',dependencies=[Depends(ingestion_auth)])
def ingest_news(body: Batch):
    return ingest(body.stock_id,body.records)


class Run(BaseModel):
    model_config = ConfigDict(extra='forbid')
    external_id: str = Field(pattern=r'^[A-Za-z0-9_.:-]{1,100}$')
    status: Literal['running','success','failed','partial']
    counts: dict[str,int] = Field(default_factory=dict)
    failures: list[str] = Field(default_factory=list,max_length=20)


@app.post('/internal/ingestion/run',dependencies=[Depends(ingestion_auth)])
def record_run(body: Run):
    allowed = {'workflow-failed','runner-timeout','feed-unavailable','refresh-failed','workflow-validation-failed'}
    failures = [s if s in allowed else 'workflow-failed' for s in body.failures]
    db.query('''INSERT INTO public.workflow_runs(external_id,status,counts,failures,finished_at)
        VALUES(%s,%s,%s,%s,%s) ON CONFLICT(external_id) DO UPDATE SET status=excluded.status,counts=excluded.counts,failures=excluded.failures,finished_at=excluded.finished_at''',
        (body.external_id,body.status,Jsonb(body.counts),Jsonb(failures),None if body.status=='running' else now()),True)
    return {'recorded':True}


class SourceCheck(BaseModel):
    feed_id: str
    status: Literal['ok','empty','feed-unavailable']
    item_count: int = Field(ge=0,le=1000)


@app.post('/internal/ingestion/source',dependencies=[Depends(ingestion_auth)])
def source_check(body: SourceCheck):
    if body.feed_id not in [f['id'] for f in FEEDS]:
        raise SafeError('source-not-allowed',422)
    db.query('INSERT INTO public.source_checks(feed_id,status,item_count) VALUES(%s,%s,%s) ON CONFLICT(feed_id) DO UPDATE SET status=excluded.status,item_count=excluded.item_count,checked_at=now()', (body.feed_id,body.status,body.item_count),True)
    return {'recorded':True}


@app.post('/internal/ingestion/refresh',dependencies=[Depends(ingestion_auth)])
async def refresh(market: Literal['India','US','all']='all'):
    results = await refresh_market(market)
    if any(r['state']=='failed' for r in results):
        return JSONResponse(status_code=503,content={'error':'refresh-failed','results':results})
    return {'results':results}


async def refresh_market(market: str, force: bool = False) -> list[dict]:
    results = []
    selected = [s for s in STOCKS.values() if market=='all' or s.market==market]
    for index,s in enumerate(selected):
        if index:
            await asyncio.sleep(13)
        try:
            try:
                price_result = await refresh_price(s.id, force=force)
            except SafeError as error:
                if not force or error.code != 'quota-cooldown':
                    raise
                # A user can switch regions immediately after the other region
                # finishes. Respect the shared provider spacing before retrying once.
                await asyncio.sleep(13)
                price_result = await refresh_price(s.id, force=True)
            data = snapshot(s.id)
            prediction = forecast(s.id,data['prices'],news_for(s.id))
            if prediction['state']=='experimental':
                db.query('INSERT INTO public.forecasts(stock_id,cutoff,payload) VALUES(%s,%s,%s) ON CONFLICT(stock_id,cutoff) DO UPDATE SET payload=excluded.payload,generated_at=now()', (s.id,datetime.fromisoformat(prediction['cutoff']),Jsonb(prediction)),True)
            results.append({**price_result,'forecast':prediction['state']})
        except SafeError as error:
            results.append({'stock_id':s.id,'state':'failed','error':error.code})
    return results


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    market: Literal['India','US']


async def run_public_refresh(job_id: str, market: str):
    try:
        results = await refresh_market(market, force=True)
        failures = [r['stock_id'] + ':' + r['error'] for r in results if r['state'] == 'failed']
        counts = {'requested':len(results),'refreshed':sum(r['state']=='refreshed' for r in results)}
        state = 'partial' if failures and counts['refreshed'] else 'failed' if failures else 'success'
    except Exception:
        failures, counts, state = ['refresh-failed'], {}, 'failed'
    db.query('UPDATE public.workflow_runs SET status=%s,counts=%s,failures=%s,finished_at=now() WHERE external_id=%s',
             (state,Jsonb(counts),Jsonb(failures),job_id),True)


@app.post('/v1/refresh')
def start_public_refresh(body: RefreshRequest, background: BackgroundTasks):
    # Shared durable cooldown prevents a public refresh button exhausting the
    # account quota. No ingestion token or provider key is sent to the browser.
    with db.transaction(True) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',('stocksense-refresh-'+body.market,))
        rows = conn.execute("SELECT external_id,status FROM public.workflow_runs WHERE external_id LIKE %s AND started_at > now()-interval '5 minutes' ORDER BY started_at DESC LIMIT 1",('web-'+body.market+'-%',)).fetchall()
        if rows:
            return {'job_id':rows[0]['external_id'],'status':rows[0]['status'],'cooldown':True,'message':'A provider check was already requested for this region in the last five minutes. Showing its result to conserve the free quota.'}
        job_id = 'web-'+body.market+'-'+uuid.uuid4().hex
        conn.execute("INSERT INTO public.workflow_runs(external_id,status) VALUES(%s,'running')",(job_id,))
    background.add_task(run_public_refresh,job_id,body.market)
    return {'job_id':job_id,'status':'running','cooldown':False,'message':'Checking Alpha Vantage for both companies in this region. This can take about a minute.'}


@app.get('/v1/refresh/{job_id}')
def public_refresh_status(job_id: str):
    if not __import__('re').fullmatch(r'web-(India|US)-[a-f0-9]{32}',job_id):
        raise SafeError('refresh-not-found',404)
    rows = db.query('SELECT external_id,status,started_at,finished_at,counts,failures FROM public.workflow_runs WHERE external_id=%s',(job_id,))
    if not rows:
        raise SafeError('refresh-not-found',404)
    result = db.safe_json(rows[0])
    if result['status']=='running' and (now()-rows[0]['started_at']).total_seconds()>300:
        result['status']='interrupted'
        result['failures']=['refresh-interrupted-retry']
    return result


app.mount('/mcp',mcp.streamable_http_app())
