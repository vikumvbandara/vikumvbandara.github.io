const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrigins = new Set(['https://vikumvbandara.github.io', 'http://localhost:1313', 'http://127.0.0.1:1313']);

// Public reads and session creation; writes authenticate with an unguessable
// session capability. Database credentials stay exclusively in the Edge runtime.
export function createHandler(rpc) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://vikumvbandara.github.io',
      'Access-Control-Allow-Headers': 'content-type, x-game-token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !allowedOrigins.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (request.method === 'GET') return reply(await rpc('blackjack_top_scores', {}));
      if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Expected JSON.' }, 415);
      if (Number(request.headers.get('content-length')) > 1024) return reply({ error: 'Request too large.' }, 413);
      // Bound streamed bodies too, even when Content-Length is absent.
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: 'Missing request.' }, 400);
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024) { await reader.cancel(); return reply({ error: 'Request too large.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
      if (!body || typeof body !== 'object') return reply({ error: 'Invalid request.' }, 400);
      if (body.action === 'start') return reply({ token: await rpc('blackjack_start_session', {}) });
      if (body.action !== 'submit') return reply({ error: 'Unknown action.' }, 400);
      const token = request.headers.get('x-game-token') || '';
      if (!UUID.test(token)) return reply({ error: 'Invalid game session. Start a new game.' }, 401);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || [...name].length > 20 || /[\u0000-\u001f\u007f]/u.test(name)) return reply({ error: 'Use a display name of 1–20 characters.' }, 400);
      if (!Number.isSafeInteger(body.profit) || body.profit < -100000 || body.profit > 1000000000 || body.profit % 250 !== 0 || !Number.isSafeInteger(body.hands) || body.hands < 1 || body.hands > 10000) return reply({ error: 'Invalid score.' }, 400);
      return reply(await rpc('blackjack_submit_score', { session_token: token, display_name: name, net_cents: body.profit, completed_hands: body.hands }));
    } catch (error) {
      // Never return backend details or credentials to the browser.
      const known = {
        BJ_SESSION: ['This game session has expired. Reset your balance to start again.', 401],
        BJ_SCORE: ['That score could not be verified. Finish another hand and try again.', 400],
        BJ_BUSY: ['The leaderboard is busy. Please try again later.', 429],
      };
      const match = known[error?.message];
      return reply({ error: match ? match[0] : 'The leaderboard is temporarily unavailable. Please try again.' }, match ? match[1] : 503);
    }
  };
}
