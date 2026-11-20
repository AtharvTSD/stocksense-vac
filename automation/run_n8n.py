"""No raw CLI stdout/stderr reaches CI logs. Import and execute real n8n CE."""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import urllib.request
import urllib.error
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
VERSION = '2.48.7'
WORKFLOW_ID = 'StockSensePilot1'


def request(endpoint, body=None):
    base = os.environ['BACKEND_URL'].rstrip('/')
    req = urllib.request.Request(base+endpoint,data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization':'Bearer '+os.environ['INGESTION_TOKEN'],'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=90) as response:
        return json.load(response)


def main():
    for name in ('BACKEND_URL','INGESTION_TOKEN','GROQ_API_KEY','RUN_ID','INGEST_MARKET'):
        if not os.environ.get(name):
            print('Missing required secret/config field: '+name)
            return 1
    if os.environ['INGEST_MARKET'] not in ('India','US','all'):
        print('Invalid market configuration')
        return 1
    cli = os.environ.get('N8N_BIN') or shutil.which('n8n')
    if not cli:
        print('n8n CLI is not installed')
        return 1
    env = {**os.environ,'N8N_BLOCK_ENV_ACCESS_IN_NODE':'false','N8N_DIAGNOSTICS_ENABLED':'false','N8N_VERSION_NOTIFICATIONS_ENABLED':'false',
           'N8N_ENCRYPTION_KEY':os.environ.get('N8N_ENCRYPTION_KEY') or secrets.token_urlsafe(48),'EXECUTIONS_DATA_SAVE_ON_ERROR':'none','EXECUTIONS_DATA_SAVE_ON_SUCCESS':'none','N8N_LOG_LEVEL':'error'}
    run_id = os.environ['RUN_ID']
    try:
        version = subprocess.run([cli,'--version'],env=env,capture_output=True,text=True,timeout=60)
        if version.returncode or VERSION not in version.stdout.split():
            print('Pinned n8n version check failed')
            return 1
        request('/internal/ingestion/run',{'external_id':run_id,'status':'running'})
        source = Path(os.environ.get('N8N_WORKFLOW_FILE',str(ROOT/'stocksense.workflow.json')))
        for args in (['import:workflow','--input='+str(source)],['execute','--id='+WORKFLOW_ID]):
            completed = subprocess.run([cli,*args],env=env,capture_output=True,text=True,timeout=600)
            if completed.returncode:
                # Detailed diagnostics are permitted only for the isolated, known-fake test server.
                if env.get('STOCKSENSE_FIXTURE_TEST')=='1' and urlsplit(env['BACKEND_URL']).hostname=='127.0.0.1' and env['GROQ_API_KEY'].startswith('fixture-') and env['INGESTION_TOKEN'].startswith('fixture-'):
                    diagnostic = (completed.stdout + completed.stderr)[-5000:]
                    for name in ('GROQ_API_KEY','INGESTION_TOKEN','N8N_ENCRYPTION_KEY'):
                        diagnostic = diagnostic.replace(env[name],'[REDACTED]')
                    print('Isolated fixture CLI diagnostic ('+args[0]+'):\n'+diagnostic)
                raise RuntimeError('workflow-failed')
        # A zero exit alone is not sufficient: the final workflow node must have written success.
        runs = request('/v1/status')['runs']
        found = next((r for r in runs if r['external_id']==run_id),None)
        if not found or found['status']!='success':
            raise RuntimeError('workflow-validation-failed')
        print(json.dumps({'status':'success','n8n_version':VERSION,'counts':found.get('counts',{})}))
        return 0
    except Exception:
        try:
            request('/internal/ingestion/run',{'external_id':run_id,'status':'failed','failures':['workflow-failed']})
        except Exception:
            pass
        print('Workflow failed. Raw provider/runner diagnostics withheld; inspect sanitized workflow run status.')
        return 1


if __name__=='__main__':
    sys.exit(main())
