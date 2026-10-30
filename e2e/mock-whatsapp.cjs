/** Stand-in for Meta's Graph API during browser tests. Records sent messages at GET /__sent. */
const http = require('node:http');
const TOKEN = 'EAAG-e2e-token-0000000000000';
const sent = [];
let n = 0;
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/__sent') return json(res, 200, sent);
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: { code: 190, message: 'Invalid OAuth access token' } });
  let m;
  if (req.method === 'GET' && (m = /^\/v[\d.]+\/(\d+)\/message_templates$/.exec(url.pathname))) {
    return json(res, 200, { data: [
      { name: 'birthday_wish', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Happy birthday {{1}}! Enjoy a free pastry today at {{2}}.' }] },
      { name: 'festival_offer', language: 'en', category: 'MARKETING', status: 'PENDING', components: [{ type: 'BODY', text: 'Happy festival {{1}}' }] }
    ] });
  }
  if (req.method === 'GET' && (m = /^\/v[\d.]+\/(\d+)$/.exec(url.pathname))) return json(res, 200, { display_phone_number: '+91 98765 00000', verified_name: 'Sweet Treats Bakery', id: m[1] });
  if (req.method === 'POST' && (m = /^\/v[\d.]+\/(\d+)\/messages$/.exec(url.pathname))) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { const b = JSON.parse(body); const id = `wamid.E2E${Date.now()}.${++n}`; sent.push({ id, phoneNumberId: m[1], ...b }); json(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: b.to, wa_id: b.to }], messages: [{ id }] }); });
    return;
  }
  json(res, 404, { error: { code: 100, message: 'Unknown path' } });
}).listen(3199);
