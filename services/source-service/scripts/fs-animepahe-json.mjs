// Quick experiment: route AnimePahe API through a FlareSolverr SESSION (browser,
// correct TLS fingerprint for DDoS-Guard) and see what format the JSON comes back in.
import process from 'node:process';
const FS = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const base = 'https://animepahe.org';
const post = (body) => fetch(FS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

const cs = await post({ cmd: 'sessions.create' });
const session = cs.session;
console.log('session:', session);
try {
  // warm the homepage in this session first (sets DDoS-Guard clearance)
  await post({ cmd: 'request.get', session, url: base + '/', maxTimeout: 60000 });
  const r = await post({ cmd: 'request.get', session, url: base + '/api?m=search&q=' + encodeURIComponent('one piece'), maxTimeout: 60000 });
  console.log('flaresolverr status:', r.status, ' http:', r.solution?.status);
  const resp = r.solution?.response || '';
  console.log('--- response head (700) ---');
  console.log(resp.slice(0, 700));
} finally {
  await post({ cmd: 'sessions.destroy', session });
  console.log('\nsession destroyed');
}
