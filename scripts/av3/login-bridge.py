#!/usr/bin/env python3
"""Capture real OAuth from an ordinary, non-automated browser on loopback only."""
import http.server
import json
import os
from pathlib import Path
import secrets
import subprocess
import threading
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / 'test-results/av3'
BASE = 'http://127.0.0.1:3103'
NONCE = secrets.token_urlsafe(24)
finished = threading.Event()
public = Path(json.loads((STATE / 'runtime.json').read_text())['publicDir'])
spa = public / 'spa.html'
original = spa.read_bytes()
backup = STATE / 'spa-before-login.html'
backup.write_bytes(original)

HTML = '''<!doctype html><html lang="ko"><meta charset="utf-8"><title>AV-3 관리자 계정 로그인</title>
<style>body{font:18px system-ui;max-width:700px;margin:80px auto;line-height:1.7}button{font:inherit;padding:12px 24px}</style>
<h1>AV-3 관리자 계정(O) 로그인</h1><p>검수용 일반 브라우저입니다. A/B와 다른 세 번째 Google 계정으로 로그인해 주세요.</p>
<button id="login">Google로 로그인</button><p id="status">인증 준비 중…</p>
<script src="/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js"></script>
<script src="/av3-login-bridge.js"></script></html>'''
JS = ''''use strict';
const statusEl = document.querySelector('#status');
const config = window.ULEVELP_CONFIG;
const client = window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{storageKey:'av3:O',flowType:'pkce',persistSession:true,detectSessionInUrl:true}});
let submitting=false;
async function submit(session){
  if(!session || submitting)return; submitting=true;
  statusEl.textContent='로컬 격리 서버에서 계정을 확인하고 있습니다…';
  try{
    const response=await fetch('http://127.0.0.1:3104/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:NONCE,session})});
    const result=await response.json(); if(!response.ok)throw new Error(result.error);
    statusEl.textContent='O 로그인 확인 완료. 이제 자동 검수를 진행합니다. 이 창은 닫아도 됩니다.';
    document.querySelector('#login').disabled=true;
  }catch(e){submitting=false;statusEl.textContent=e.message;}
}
document.querySelector('#login').onclick=async()=>{
  statusEl.textContent='Google 로그인으로 이동합니다…';
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/settings.html'}});
  if(error)statusEl.textContent=error.message;
};
client.auth.onAuthStateChange((event,session)=>{if(session)void submit(session)});
client.auth.getSession().then(({data,error})=>{if(error)statusEl.textContent=error.message;else if(data.session)void submit(data.session);else statusEl.textContent='Google로 로그인 버튼을 눌러 주세요.'});
'''.replace('NONCE', json.dumps(NONCE))

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def respond(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', BASE)
        self.send_header('Content-Type','application/json')
        self.end_headers()
        self.wfile.write(raw)
    def do_OPTIONS(self):
        if self.headers.get('Origin') != BASE:
            return self.respond(403, {'error':'Origin rejected'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',BASE)
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Methods','POST')
        self.end_headers()
    def do_POST(self):
        if self.path != '/session' or self.headers.get('Origin') != BASE:
            return self.respond(403, {'error':'Origin/path rejected'})
        length=int(self.headers.get('Content-Length','0'))
        if length > 65536:
            return self.respond(413, {'error':'Payload too large'})
        payload=json.loads(self.rfile.read(length))
        if not secrets.compare_digest(payload.get('nonce',''),NONCE):
            return self.respond(403, {'error':'Run nonce rejected'})
        session=payload['session']
        try:
            req=urllib.request.Request(BASE+'/api/v1/me',headers={'Authorization':'Bearer '+session['access_token']})
            with urllib.request.urlopen(req,timeout=15) as response:
                me=json.load(response)
            others=[json.loads((STATE/f'identity-{role}.json').read_text())['id'] for role in ['A','B']]
            if me['id'] in others:
                return self.respond(409, {'error':'A/B와 다른 세 번째 Google 계정으로 로그인해 주세요.'})
            state={'cookies':[],'origins':[{'origin':BASE,'localStorage':[{'name':'ulp:auth','value':json.dumps(session)}]}]}
            for name,value in [('auth-O.json',state),('identity-O.json',{k:me[k] for k in ['id','role','tier']})]:
                path=STATE/name
                path.write_text(json.dumps(value)); os.chmod(path,0o600)
            self.respond(200, {'ok':True})
            print('AV3_LOGIN_READY_O ordinary browser, real Supabase JWT validated by Ktor',flush=True)
            finished.set()
        except Exception:
            self.respond(502, {'error':'로컬 서버 인증 확인 실패. 검수 로그를 확인합니다.'})

server=http.server.ThreadingHTTPServer(('127.0.0.1',3104),Handler)
try:
    (public/'av3-login-bridge.js').write_text(JS)
    spa.write_text(HTML)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    profile=STATE/'ordinary-O'
    subprocess.Popen(['/Applications/Whale.app/Contents/MacOS/Whale','--user-data-dir='+str(profile),
                      '--no-first-run','--no-default-browser-check',BASE+'/settings.html'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    print('AV3_ORDINARY_LOGIN_READY_O http://127.0.0.1:3103/settings.html',flush=True)
    if not finished.wait(900):
        raise TimeoutError('Ordinary browser login timeout')
finally:
    spa.write_bytes(original)
    (public/'av3-login-bridge.js').unlink(missing_ok=True)
    server.shutdown()
