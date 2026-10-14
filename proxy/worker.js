// Посредник для запросов к Claude: пропускает только запросы /v1/messages (обычные и пакетные) и добавляет разрешение для сайта
const ALLOWED = ['https://rinatvisual.github.io', 'null']; // null — сайт, открытый файлом с компьютера

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
      'Access-Control-Max-Age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);
    if (!url.pathname.startsWith('/v1/messages')) {
      return new Response('Посредник работает (версия 2). Он пропускает только запросы к Claude.', { status: 200, headers: cors });
    }

    // передаём в Anthropic только нужные заголовки; ключ API приходит из браузера и нигде не хранится
    const headers = new Headers();
    for (const h of ['content-type', 'x-api-key', 'anthropic-version']) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    const r = await fetch('https://api.anthropic.com' + url.pathname + url.search, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await req.arrayBuffer() : undefined
    });
    const out = new Response(r.body, r);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  }
};
