// Local test runner control plane. Never included in an app bundle.
import http from 'node:http';
import { spawnSync } from 'node:child_process';
const device = process.argv[2];
const port = Number(process.argv[3] || 48173);
const inventory = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' });
if (inventory.status !== 0) throw Error(inventory.stderr);
const selected = Object.values(JSON.parse(inventory.stdout).devices).flat().find(d => d.udid === device);
if (!selected?.name.startsWith('UXN ')) throw Error('Select a dedicated UXN Simulator');
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname !== '/callback') { response.writeHead(404).end(); return; }
  const callback = 'ulevelp://auth/callback?' + url.searchParams.toString();
  const result = spawnSync('xcrun', ['simctl', 'openurl', device, callback], { encoding: 'utf8', timeout: 15000 });
  response.writeHead(result.status === 0 ? 200 : 500).end(result.status === 0 ? 'delivered' : result.stderr);
}).listen(port, '127.0.0.1', () => console.log(`Native callback control listening on ${port}`));
