/** Stand-in for Google's OpenID Connect endpoints during browser tests (port 3198). POST /__next sets who signs in next. */
const http = require('node:http');
const crypto = require('node:crypto');
const ISS = 'http://localhost:3198';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'e2e-key', alg: 'RS256', use: 'sig' };
const codes = new Map();
let next = { sub: 'google-e2e-1', email: 'olivia@example.com', name: 'Olivia Google' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, ISS);
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] });
  if (url.pathname === '/__next' && req.method === 'POST') { next = JSON.parse(await body(req)); return json(res, 200, { ok: true }); }
  if (url.pathname === '/authorize') {
    const q = url.searchParams;
    if (q.get('client_id') !== 'e2e-google' || q.get('code_challenge_method') !== 'S256') return json(res, 400, { error: 'invalid_request' });
    const code = crypto.randomBytes(12).toString('hex');
    codes.set(code, { nonce: q.get('nonce'), challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), who: next });
    const back = new URL(q.get('redirect_uri'));
    back.searchParams.set('code', code); back.searchParams.set('state', q.get('state'));
    res.writeHead(302, { location: back.toString() }); return res.end();
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    const f = new URLSearchParams(await body(req));
    const c = codes.get(f.get('code'));
    codes.delete(f.get('code'));
    if (!c || f.get('client_secret') !== 'e2e-secret' || f.get('redirect_uri') !== c.redirect) return json(res, 400, { error: 'invalid_grant' });
    if (crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== c.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE' });
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'RS256', kid: 'e2e-key', typ: 'JWT' });
    const claims = b64({ iss: ISS, aud: 'e2e-google', sub: c.who.sub, email: c.who.email, email_verified: true, name: c.who.name, nonce: c.nonce, iat: now, exp: now + 600 });
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${claims}`), privateKey).toString('base64url');
    return json(res, 200, { id_token: `${head}.${claims}.${sig}`, access_token: 'x', token_type: 'Bearer', expires_in: 600 });
  }
  json(res, 404, { error: 'not_found' });
}).listen(3198);
