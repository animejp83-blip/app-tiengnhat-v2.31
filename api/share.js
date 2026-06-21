const crypto = require('crypto');

const TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_ARTICLES_PER_ROOM = 100;
const MAX_ARTICLE_BYTES = 200 * 1024;
const MAX_REQUESTS_PER_DAY = 120;
const MAX_SAVE_REQUESTS_PER_DAY = 30;

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function getEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function redis(command) {
  const { url, token } = getEnv();
  if (!url || !token) {
    const err = new Error('Chưa cấu hình Redis/KV. Hãy thêm KV_REST_API_URL và KV_REST_API_TOKEN trên Vercel.');
    err.status = 500;
    throw err;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err = new Error(data.error || `Redis error ${response.status}`);
    err.status = 500;
    throw err;
  }
  return data.result;
}

function safeRoom(room) {
  return String(room || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

function hashPin(room, pin) {
  const salt = process.env.SHARE_PIN_SALT || 'hoccungtoi-v2.45-share-room';
  return crypto.createHash('sha256').update(`${room}:${pin}:${salt}`).digest('hex');
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function rateLimit(req, action) {
  const ip = getIp(req).replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 80);
  const limit = action === 'save' ? MAX_SAVE_REQUESTS_PER_DAY : MAX_REQUESTS_PER_DAY;
  const key = `hct:rate:${todayKey()}:${action}:${ip}`;
  const count = Number(await redis(['INCR', key]) || 0);
  if (count === 1) await redis(['EXPIRE', key, String(24 * 60 * 60)]);
  if (count > limit) {
    const err = new Error('Hôm nay thao tác hơi nhiều rồi. Thử lại vào ngày mai nhé.');
    err.status = 429;
    throw err;
  }
}

async function verifyRoom(roomRaw, pinRaw, allowCreate = false) {
  const room = safeRoom(roomRaw);
  const pin = String(pinRaw || '').trim();
  if (!room) {
    const err = new Error('Room không hợp lệ. Chỉ dùng chữ thường, số, gạch ngang hoặc gạch dưới.');
    err.status = 400;
    throw err;
  }
  if (pin.length < 4 || pin.length > 64) {
    const err = new Error('PIN cần có từ 4 đến 64 ký tự.');
    err.status = 400;
    throw err;
  }
  const pinKey = `hct:room:${room}:pin`;
  const expected = await redis(['GET', pinKey]);
  const actual = hashPin(room, pin);
  if (!expected) {
    if (!allowCreate) {
      const err = new Error('Room này chưa tồn tại. Hãy lưu bài đầu tiên để tạo room.');
      err.status = 404;
      throw err;
    }
    await redis(['SET', pinKey, actual, 'EX', String(TTL_SECONDS)]);
    return room;
  }
  if (expected !== actual) {
    const err = new Error('PIN không đúng.');
    err.status = 401;
    throw err;
  }
  await redis(['EXPIRE', pinKey, String(TTL_SECONDS)]);
  return room;
}

async function getMeta(room) {
  const raw = await redis(['GET', `hct:room:${room}:meta`]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function setMeta(room, meta) {
  await redis(['SET', `hct:room:${room}:meta`, JSON.stringify(meta), 'EX', String(TTL_SECONDS)]);
}

function sanitizeArticle(article) {
  const data = article && typeof article === 'object' ? article : {};
  const clean = {
    title: String(data.title || 'Bài học không tiêu đề').slice(0, 120),
    fullText: String(data.fullText || ''),
    fullTranslation: String(data.fullTranslation || ''),
    sentenceTranslations: Array.isArray(data.sentenceTranslations) ? data.sentenceTranslations.slice(0, 300) : [],
    vocabulary: Array.isArray(data.vocabulary) ? data.vocabulary.slice(0, 300) : [],
    grammar: Array.isArray(data.grammar) ? data.grammar.slice(0, 120) : []
  };
  if (!clean.fullText || clean.vocabulary.length === 0) {
    const err = new Error('Bài học thiếu fullText hoặc vocabulary.');
    err.status = 400;
    throw err;
  }
  const bytes = Buffer.byteLength(JSON.stringify(clean), 'utf8');
  if (bytes > MAX_ARTICLE_BYTES) {
    const err = new Error('Bài quá lớn. Giới hạn hiện tại là 200KB/bài.');
    err.status = 413;
    throw err;
  }
  return { clean, bytes };
}

async function handleSave(req, body) {
  await rateLimit(req, 'save');
  const room = await verifyRoom(body.room, body.pin, true);
  const { clean, bytes } = sanitizeArticle(body.article);
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const articleKey = `hct:article:${room}:${id}`;
  await redis(['SET', articleKey, JSON.stringify(clean), 'EX', String(TTL_SECONDS)]);

  let meta = await getMeta(room);
  meta = meta.filter(item => item && item.id !== id);
  meta.unshift({
    id,
    title: clean.title,
    createdAt,
    vocabCount: clean.vocabulary.length,
    grammarCount: clean.grammar.length,
    bytes
  });
  const removed = [];
  while (meta.length > MAX_ARTICLES_PER_ROOM) removed.push(meta.pop());
  await setMeta(room, meta);
  await Promise.all(removed.filter(Boolean).map(item => redis(['DEL', `hct:article:${room}:${item.id}`]).catch(() => null)));

  return { ok: true, id, room, item: meta[0], limit: MAX_ARTICLES_PER_ROOM, ttlDays: 90 };
}

async function handleList(req, body) {
  await rateLimit(req, 'list');
  const room = await verifyRoom(body.room, body.pin, false);
  const meta = await getMeta(room);
  return { ok: true, room, items: meta, limit: MAX_ARTICLES_PER_ROOM, ttlDays: 90 };
}

async function handleGet(req, body) {
  await rateLimit(req, 'get');
  const room = await verifyRoom(body.room, body.pin, false);
  const id = String(body.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) {
    const err = new Error('Thiếu ID bài học.');
    err.status = 400;
    throw err;
  }
  const raw = await redis(['GET', `hct:article:${room}:${id}`]);
  if (!raw) {
    const err = new Error('Bài này không còn tồn tại hoặc đã hết hạn.');
    err.status = 404;
    throw err;
  }
  return { ok: true, room, id, article: JSON.parse(raw) };
}

async function handleDelete(req, body) {
  await rateLimit(req, 'delete');
  const room = await verifyRoom(body.room, body.pin, false);
  const id = String(body.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) {
    const err = new Error('Thiếu ID bài học.');
    err.status = 400;
    throw err;
  }
  await redis(['DEL', `hct:article:${room}:${id}`]);
  const meta = (await getMeta(room)).filter(item => item && item.id !== id);
  await setMeta(room, meta);
  return { ok: true, room, id };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Chỉ hỗ trợ POST.' });

  try {
    const body = await readBody(req);
    const action = String(body.action || '').toLowerCase();
    let result;
    if (action === 'save') result = await handleSave(req, body);
    else if (action === 'list') result = await handleList(req, body);
    else if (action === 'get') result = await handleGet(req, body);
    else if (action === 'delete') result = await handleDelete(req, body);
    else {
      const err = new Error('Action không hợp lệ.');
      err.status = 400;
      throw err;
    }
    return json(res, 200, result);
  } catch (err) {
    return json(res, err.status || 500, { ok: false, error: err.message || 'Lỗi không xác định.' });
  }
};
