#!/usr/bin/env python3
"""One short real Gemini trial with a Secret Manager key kept out of logs/files."""
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
import urllib.request
ROOT=Path(__file__).resolve().parents[2]
STATE=ROOT/'test-results/av3'
runtime=json.loads((STATE/'runtime.json').read_text())
info=json.loads(subprocess.check_output(['docker','inspect',runtime['container']],text=True))[0]
assert runtime['container']=='ulevelp-av3-db' and info['Config']['Labels']['ulevelp.audit']=='av3'
assert info['HostConfig']['PortBindings']['5432/tcp'][0]['HostIp']=='127.0.0.1'
with socket.socket() as sock: sock.bind(('127.0.0.1',3105))
key=subprocess.check_output(['gcloud','secrets','versions','access','latest','--project','ulevelp','--secret','SYSTEM_GEMINI_API_KEY'],text=True).strip()
assert key,'Gemini secret is empty'
java=subprocess.check_output(['/usr/libexec/java_home','-v','21'],text=True).strip()
url=re.search(r"supabaseUrl:\s*'([^']+)'",(ROOT/'public/config.js').read_text()).group(1)
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG'] if k in os.environ}
env.update(HOST='127.0.0.1',PORT='3105',PUBLIC_DIR=runtime['publicDir'],PUBLIC_APP_URL='http://127.0.0.1:3105/',ALLOWED_ORIGINS='http://127.0.0.1:3105',SUPABASE_URL=url,SYSTEM_GEMINI_API_KEY=key,GEMINI_FRAME_FPS='0.2',DATABASE_URL=f"postgresql://ulp_av3:local_av3_only@127.0.0.1:{runtime['dbPort']}/ulp_av3")
for line in (ROOT/'.env').read_text().splitlines():
 if line.startswith('YOUTUBE_DATA_API_KEY='):env['YOUTUBE_DATA_API_KEY']=line.split('=',1)[1].strip().strip('\"\'')
with open(STATE/'server-gemini.log','w') as log:
 server=subprocess.Popen([java+'/bin/java','-cp',str(ROOT/'build/install/ulevelp-server/lib/*'),'ulevelp.MainKt'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  deadline=time.monotonic()+30
  while True:
   if server.poll() is not None:raise RuntimeError('Gemini trial Ktor startup failed; inspect ignored log')
   try:
    with urllib.request.urlopen('http://127.0.0.1:3105/api/health',timeout=1) as response:
     if response.status==200:break
   except OSError:
    if time.monotonic()>deadline:raise TimeoutError('Gemini Ktor readiness timeout')
    time.sleep(.2)
  subprocess.run(['node','scripts/av3/gemini-live.cjs'],cwd=ROOT,check=True)
 finally:
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill();server.wait()
