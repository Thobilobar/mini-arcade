import { DurableObject } from 'cloudflare:workers';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const ROOM_RE = /^[A-Za-z0-9_-]{8,64}$/;

function cors(origin, env) {
  const allow = String(env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allow.includes('*') || (!!origin && allow.includes(origin));
  return {
    ok,
    headers: {
      'access-control-allow-origin': ok ? (allow.includes('*') ? '*' : origin) : 'null',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary': 'Origin'
    }
  };
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const c = cors(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    }
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'mini-arcade-signal', transport: 'webrtc' }, { headers: c.headers });
    }
    if (url.pathname === '/ice') {
      if (!c.ok) return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers: c.headers });
      let iceServers = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
      if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
        try {
          const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
            method: 'POST',
            headers: { 'authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
            body: JSON.stringify({ ttl: 86400 })
          });
          if (r.ok) {
            const body = await r.json();
            if (body && Array.isArray(body.iceServers) && body.iceServers.length) iceServers = body.iceServers;
          }
        } catch (_) {}
      }
      return Response.json({ iceServers }, { headers: c.headers });
    }

    const m = url.pathname.match(/^\/signal\/([A-Za-z0-9_-]{8,64})$/);
    if (!m) return Response.json({ error: 'not_found' }, { status: 404, headers: c.headers });
    if (!c.ok) return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers: c.headers });
    if (request.method !== 'GET' || (request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426, headers: c.headers });
    }
    const room = m[1];
    if (!ROOM_RE.test(room)) return new Response('Bad room', { status: 400, headers: c.headers });
    const stub = env.SIGNAL_ROOMS.getByName(room);
    return stub.fetch(request);
  }
};

export class SignalRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= 6) return new Response('Room full', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authed: false, role: 0 });
    server.send(JSON.stringify({ t: 'hello-required' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 65536) {
      ws.close(1009, 'message too large');
      return;
    }
    let data;
    try { data = JSON.parse(message); } catch (_) { ws.close(1003, 'bad json'); return; }
    let meta = ws.deserializeAttachment() || { authed: false, role: 0 };

    if (!meta.authed) {
      if (!data || data.t !== 'hello' || (data.r !== 1 && data.r !== 2) || typeof data.k !== 'string' || data.k.length < 16 || data.k.length > 128) {
        ws.close(1008, 'auth required'); return;
      }
      const incoming = await sha256(data.k);
      let expected = await this.ctx.storage.get('secretHash');
      if (!expected) { await this.ctx.storage.put('secretHash', incoming); expected = incoming; }
      if (expected !== incoming) { ws.close(1008, 'bad room secret'); return; }

      // A reconnect replaces an older socket for the same player role.
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        const om = other.deserializeAttachment() || {};
        if (om.authed && om.role === data.r) try { other.close(4001, 'replaced'); } catch (_) {}
      }
      meta = { authed: true, role: data.r };
      ws.serializeAttachment(meta);
      // Keep only a short-lived room-secret hash; refresh expiry when a player reconnects.
      await this.ctx.storage.setAlarm(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const peers = this.authorized().length;
      ws.send(JSON.stringify({ t: 'ready', role: meta.role, peers }));
      this.relay(ws, { t: 'peer', state: 'joined', role: meta.role });
      return;
    }

    if (!data || !['offer', 'answer', 'ice', 'bye'].includes(data.t)) return;
    if (data.t === 'bye') { try { ws.close(1000, 'bye'); } catch (_) {} return; }
    // SDP and ICE only. Actual game moves never pass through this service.
    const out = { ...data, from: meta.role };
    delete out.k; delete out.p; delete out.g; delete out.r;
    this.relay(ws, out);
  }

  authorized() {
    return this.ctx.getWebSockets().filter(ws => {
      const m = ws.deserializeAttachment() || {};
      return m.authed && (m.role === 1 || m.role === 2);
    });
  }

  relay(sender, payload) {
    const sm = sender.deserializeAttachment() || {};
    const text = JSON.stringify(payload);
    for (const ws of this.authorized()) {
      if (ws === sender) continue;
      const m = ws.deserializeAttachment() || {};
      if (m.role !== sm.role) try { ws.send(text); } catch (_) {}
    }
  }

  async webSocketClose(ws) {
    const meta = ws.deserializeAttachment() || {};
    if (meta.authed) this.relay(ws, { t: 'peer', state: 'left', role: meta.role });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }

  async webSocketError(ws) {
    const meta = ws.deserializeAttachment() || {};
    if (meta.authed) this.relay(ws, { t: 'peer', state: 'left', role: meta.role });
    try { ws.close(1011, 'socket error'); } catch (_) {}
  }
}
