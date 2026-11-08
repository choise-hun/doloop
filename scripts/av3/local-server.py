#!/usr/bin/env python3
"""AV-3 loopback Ktor + disposable PostgreSQL. Never loads the remote DB URL."""
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / 'test-results' / 'av3'
CONTAINER = 'ulevelp-av3-db'
PORT = 3103


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(STATE, 0o700)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', PORT))
    existing = subprocess.run(['docker', 'inspect', CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if existing:
        if '--resume' not in sys.argv:
            raise RuntimeError('AV-3 container already exists; inspect and use --resume for this labelled disposable DB')
        info = json.loads(command('docker', 'inspect', CONTAINER))[0]
        assert info['Config']['Labels'].get('ulevelp.audit') == 'av3'
        assert info['HostConfig']['PortBindings']['5432/tcp'][0]['HostIp'] == '127.0.0.1'
        assert not info['HostConfig'].get('Binds') and not info['HostConfig'].get('Mounts'), 'Refusing explicit external mounts'
        # postgres:16 declares an anonymous data volume, removed together with --rm.
        assert all(m['Type'] == 'volume' and m['Destination'] == '/var/lib/postgresql/data' and re.fullmatch(r'[a-f0-9]{64}', m['Name']) for m in info['Mounts']), 'Unexpected DB volume'
    config = (ROOT / 'public/config.js').read_text()
    supabase = re.search(r"supabaseUrl:\s*'([^']+)'", config).group(1)
    if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co', supabase):
        raise RuntimeError('Unexpected Supabase Auth URL')
    public = STATE / 'public'
    shutil.copytree(ROOT / 'public', public, dirs_exist_ok=True)
    shutil.copyfile(ROOT / 'dist/index.html', public / 'spa.html')
    shutil.copytree(ROOT / 'dist/assets', public / 'assets', dirs_exist_ok=True)
    server = None
    created = False
    try:
        if not existing:
            command('docker', 'run', '-d', '--rm', '--name', CONTAINER,
                    '--label', 'ulevelp.audit=av3', '-p', '127.0.0.1:0:5432',
                    '-e', 'POSTGRES_DB=ulp_av3', '-e', 'POSTGRES_USER=ulp_av3',
                    '-e', 'POSTGRES_PASSWORD=local_av3_only', 'postgres:16-alpine')
            created = True
        deadline = time.monotonic() + 45
        while subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-U', 'ulp_av3', '-d', 'ulp_av3'],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            if time.monotonic() > deadline:
                raise RuntimeError('AV-3 PostgreSQL readiness timed out')
            time.sleep(.2)
        db_port = int(command('docker', 'port', CONTAINER, '5432/tcp').rsplit(':', 1)[1])
        java_home = command('/usr/libexec/java_home', '-v', '21')
        env = {k: os.environ[k] for k in ['PATH', 'HOME', 'TMPDIR', 'LANG'] if k in os.environ}
        env.update(JAVA_HOME=java_home, HOST='127.0.0.1', PORT=str(PORT), PUBLIC_DIR=str(public),
                   PUBLIC_APP_URL=f'http://127.0.0.1:{PORT}/',
                   ALLOWED_ORIGINS=f'http://127.0.0.1:{PORT},http://localhost:{PORT}',
                   SUPABASE_URL=supabase,
                   DATABASE_URL=f'postgresql://ulp_av3:local_av3_only@127.0.0.1:{db_port}/ulp_av3')
        # Opt in only to YouTube quota use; never inherit storage/admin/DB/job credentials.
        if '--youtube' in sys.argv:
            for line in (ROOT / '.env').read_text().splitlines():
                if line.startswith('YOUTUBE_DATA_API_KEY='):
                    value = line.split('=', 1)[1].strip().strip('\"\'')
                    if value:
                        env['YOUTUBE_DATA_API_KEY'] = value
        log = open(STATE / 'server.log', 'w')
        server = subprocess.Popen([f'{java_home}/bin/java', '-cp',
                                   str(ROOT / 'build/install/ulevelp-server/lib/*'), 'ulevelp.MainKt'],
                                  cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        (STATE / 'runtime.json').write_text(json.dumps(dict(container=CONTAINER, dbPort=db_port,
            port=PORT, publicDir=str(public), serverPid=server.pid, supervisorPid=os.getpid(),
            youtubeEnabled='YOUTUBE_DATA_API_KEY' in env), indent=2))
        deadline = time.monotonic() + 45
        while True:
            if server.poll() is not None:
                raise RuntimeError('Ktor exited; inspect ignored test-results/av3/server.log')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/health', timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, TimeoutError):
                if time.monotonic() > deadline:
                    raise RuntimeError('Ktor readiness timed out')
                time.sleep(.2)
        print(f'AV3_READY http://127.0.0.1:{PORT} disposable_db_port={db_port}', flush=True)
        server.wait()
    finally:
        if server is not None and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
        if created:
            subprocess.run(['docker', 'stop', CONTAINER], stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        main()
    except KeyboardInterrupt:
        pass
