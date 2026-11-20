"""Browser login handoff; read the one-time code locally, never through chat/logs."""
from pathlib import Path
import re
import threading
import time
from winpty import PtyProcess

root = Path(__file__).resolve().parents[1]
code_file = root / '.tools' / 'supabase-verification.txt'
code_file.write_text('', encoding='utf8')
process = PtyProcess.spawn([str(root/'.tools/supabase/supabase.exe'),'login','--name','stocksense-vac','--agent','no'],cwd=str(root),dimensions=(24,120))
output = []


def consume():
    while True:
        try:
            char = process.read(1024)
        except EOFError:
            break
        output.append(char)


threading.Thread(target=consume,daemon=True).start()
process.write('\r')
print('Complete the newest Supabase browser login, then save its verification code in .tools/supabase-verification.txt locally.',flush=True)
submitted = False
for _ in range(480):
    if not process.isalive():
        break
    code = code_file.read_text(encoding='utf-8-sig').strip()
    if not submitted and re.fullmatch(r'[A-Za-z0-9-]{6,64}',code):
        process.write(code+'\r')
        code_file.write_text('',encoding='utf8')
        code = ''
        submitted = True
        print('Local verification code submitted and cleared; no value printed.',flush=True)
    time.sleep(1)
else:
    process.terminate()
    process.wait()
result = process.exitstatus
if result == 0:
    print('Supabase CLI browser login completed.',flush=True)
else:
    print('Supabase login did not complete; raw authentication output withheld.',flush=True)
raise SystemExit(0 if result == 0 else 1)
