"""Execute real n8n against an isolated fixture HTTP server; never a production DB/provider."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading


def main():
    state = {'runs':{},'news':set(),'fail':False,'authorized':0,'groq_authorized':0}
    token = 'fixture-ingestion-token-not-a-real-secret'
    groq = 'fixture-classifier-token-not-a-real-secret'

    class Fixture(http.server.BaseHTTPRequestHandler):
        def log_message(self,*_):
            pass

        def send(self,data,status=200):
            self.send_response(status)
            self.send_header('Content-Type','application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def allowed(self):
            if self.headers.get('Authorization')!='Bearer '+token:
                self.send({'error':'unauthorized'},401)
                return False
            state['authorized']+=1
            return True

        def do_GET(self):
            if not self.allowed():
                return
            if self.path.startswith('/internal/ingestion/config'):
                self.send({'feeds':[{'id':'fixture-feed'}],'stocks':[{'id':'apple','name':'Apple'},{'id':'microsoft','name':'Microsoft'}]})
            elif self.path.startswith('/internal/ingestion/feed/'):
                self.send({'status':'ok','feed_id':'fixture-feed','records':[{'stock_id':s,'title':'Fictional fixture: '+s+' introduces a service','url':'https://example.com/fixture/'+s,'published_at':'2026-11-19T09:00:00Z','feed_id':'fixture-feed','summary':'','market':'US'} for s in ('apple','microsoft')]})
            elif self.path=='/v1/status':
                self.send({'runs':list(state['runs'].values())[-5:]})
            else:
                self.send({'error':'not-found'},404)

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
            if self.path=='/fixture-groq':
                if self.headers.get('Authorization')!='Bearer '+groq:
                    self.send({'error':'fixture-auth-failed'},401)
                    return
                state['groq_authorized']+=1
                if state['fail']:
                    self.send({'error':'fixture-provider-failure'},400)
                    return
                headlines = json.loads(body['messages'][1]['content'])['headlines']
                self.send({'choices':[{'message':{'content':json.dumps({'items':[{'id':h['id'],'relevant':True,'sentiment':'positive'} for h in headlines]})}}]})
                return
            if not self.allowed():
                return
            if self.path=='/internal/ingestion/run':
                state['runs'][body['external_id']]=body
                self.send({'recorded':True})
            elif self.path=='/internal/ingestion/reserve-groq':
                self.send({'reserved':True})
            elif self.path=='/internal/ingestion/news':
                inserted=0
                for n in body['records']:
                    key=(body['stock_id'],n['url'])
                    if key not in state['news']:
                        state['news'].add(key)
                        inserted+=1
                self.send({'received':len(body['records']),'normalized':len(body['records']),'inserted':inserted,'duplicates':len(body['records'])-inserted})
            elif self.path.startswith('/internal/ingestion/refresh'):
                self.send({'results':[{'stock_id':'apple','state':'cached'}]})
            else:
                self.send({'error':'not-found'},404)

    server = http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix='stocksense-n8n-test-') as directory:
            root = Path(__file__).resolve().parent
            workflow = json.loads((root/'stocksense.workflow.json').read_text())
            base = f'http://127.0.0.1:{server.server_port}'
            for n in workflow['nodes']:
                if n['name']=='Groq company sentiment':
                    n['parameters']['url']=base+'/fixture-groq'
            source = Path(directory)/'fixture.workflow.json'
            source.write_text(json.dumps(workflow),encoding='utf8')
            env = {**os.environ,'BACKEND_URL':base,'INGESTION_TOKEN':token,'GROQ_API_KEY':groq,'INGEST_MARKET':'US',
                   'N8N_WORKFLOW_FILE':str(source),'N8N_USER_FOLDER':str(Path(directory)/'n8n'),'N8N_ENCRYPTION_KEY':'fixture-encryption-key-not-a-production-secret'}
            for run_id in ('fixture-first','fixture-replay','fixture-failure'):
                state['fail'] = run_id=='fixture-failure'
                result = subprocess.run([sys.executable,str(root/'run_n8n.py')],env={**env,'RUN_ID':run_id},capture_output=True,text=True,timeout=900)
                if token in result.stdout or groq in result.stdout or token in result.stderr or groq in result.stderr:
                    raise AssertionError('Credential value exposed by runner')
                expected = 1 if state['fail'] else 0
                if result.returncode!=expected:
                    print('Real n8n fixture execution failed: '+run_id)
                    print(result.stdout[-1000:])  # wrapper emits only sanitized diagnostics
                    return 1
            assert state['runs']['fixture-first']['counts']['inserted']==2
            assert state['runs']['fixture-replay']['counts']['inserted']==0
            assert state['runs']['fixture-replay']['counts']['duplicates']==2
            assert state['runs']['fixture-failure']['status']=='failed'
            assert state['authorized'] and state['groq_authorized']
            print('Real n8n CLI: import, execute, scoped credential injection, replay idempotence and failed-job propagation passed with fixtures.')
            return 0
    finally:
        server.shutdown()
        server.server_close()


if __name__=='__main__':
    sys.exit(main())
