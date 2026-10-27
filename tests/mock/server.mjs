// Local stand-in for Supabase (auth, PostgREST subset, storage) on a real Postgres with the
// app's migrations and row-level security. Every request runs as `authenticated` (or `anon`)
// with the caller's user id, exactly like Supabase, so the policies are what get tested.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pg, lit, ident } from './pgwire.mjs';

const PORT = Number(process.env.PORT || 54321);
const pg = await new Pg({ path: process.env.PGSOCK, database: process.env.PGDB || 'hg' }).connect();
const users = new Map(); // email -> { id, password }
const files = new Map(); // storage path -> Buffer
const log = [];

// Looked up per call: the test database may be rebuilt while the server runs.
async function fnReturnsSet(fn) {
  const rows = (await pg.query(`select p.proretset from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = ${lit(fn)}`))[0].rows;
  return rows.length ? rows[0][0] === 't' : null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', ...headers });
  if (body === undefined || body === null) return res.end();
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
const readBody = (req) => new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });

function userFrom(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer tok\.([0-9a-f-]{36})$/);
  return m ? m[1] : null;
}

/** Run one statement as the caller; returns the JSON text the statement produced. */
async function asUser(uid, sql) {
  const role = uid ? 'authenticated' : 'anon';
  const full = `select set_config('role', ${lit(role)}, true), set_config('request.jwt.claim.sub', ${lit(uid || '')}, true); ${sql}`;
  const results = await pg.query(full);
  const last = results[results.length - 1];
  return last?.rows?.[0]?.[0] ?? null;
}

function pgError(res, e) {
  const status = { '42501': 403, '23505': 409, '23503': 409, '23514': 400, P0001: 400, '42P01': 404, '42883': 404, '22P02': 400 }[e.code] || 400;
  send(res, status, { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null }, { 'Content-Type': 'application/json' });
}

const OPS = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=', neq: '<>' };
function where(params) {
  const out = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset', 'columns'].includes(k)) continue;
    const m = v.match(/^(eq|gt|gte|lt|lte|neq|is|in)\.(.*)$/s);
    if (!m) throw Object.assign(new Error(`bad filter ${k}=${v}`), { code: '22P02' });
    const [, op, val] = m;
    if (op === 'is') out.push(`${ident(k)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    else if (op === 'in') out.push(`${ident(k)} in (${val.replace(/^\(|\)$/g, '').split(',').map((x) => lit(x.replace(/^"|"$/g, ''))).join(',')})`);
    else out.push(`${ident(k)} ${OPS[op]} ${lit(val)}`);
  }
  return out.length ? ` where ${out.join(' and ')}` : '';
}

async function rest(req, res, url, uid) {
  const table = url.pathname.split('/')[3];
  const params = url.searchParams;
  const prefer = String(req.headers.prefer || '');
  const t = `public.${ident(table)}`;
  if (req.method === 'GET') {
    let sql = `select * from ${t}${where(params)}`;
    const order = params.get('order');
    if (order) sql += ` order by ${order.split(',').map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ')}`;
    if (params.get('limit')) sql += ` limit ${Number(params.get('limit'))}`;
    const json = await asUser(uid, `select coalesce(json_agg(q), '[]'::json)::text from (${sql}) q`);
    return send(res, 200, json, { 'Content-Type': 'application/json' });
  }
  const raw = (await readBody(req)).toString();
  if (req.method === 'POST') {
    let rows = JSON.parse(raw || '[]');
    if (!Array.isArray(rows)) rows = [rows];
    if (!rows.length) return send(res, 201, '[]');
    const keys = Object.keys(rows[0]);
    const cols = keys.map(ident).join(', ');
    let sql = `insert into ${t} (${cols}) select ${cols} from json_populate_recordset(null::${t}, ${lit(rows)})`;
    const conflict = params.get('on_conflict');
    if (conflict && /merge-duplicates/.test(prefer)) {
      const cc = conflict.split(',');
      const upd = keys.filter((k) => !cc.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
      sql += ` on conflict (${cc.map(ident).join(', ')}) do ${upd.length ? `update set ${upd.join(', ')}` : 'nothing'}`;
    }
    const json = await asUser(uid, `with w as (${sql} returning *) select coalesce(json_agg(w), '[]'::json)::text from w`);
    return /return=representation/.test(prefer) ? send(res, 201, json, { 'Content-Type': 'application/json' }) : send(res, 201);
  }
  if (req.method === 'PATCH') {
    const patch = JSON.parse(raw || '{}');
    const sets = Object.keys(patch).map((k) => `${ident(k)} = (select ${ident(k)} from json_populate_record(null::${t}, ${lit(patch)}))`);
    const json = await asUser(uid, `with w as (update ${t} set ${sets.join(', ')}${where(params)} returning *) select coalesce(json_agg(w), '[]'::json)::text from w`);
    return send(res, /return=representation/.test(prefer) ? 200 : 204, /return=representation/.test(prefer) ? json : undefined);
  }
  if (req.method === 'DELETE') {
    await asUser(uid, `with w as (delete from ${t}${where(params)} returning 1) select count(*)::text from w`);
    return send(res, 204);
  }
  send(res, 405, { message: 'method' });
}

async function rpc(req, res, url, uid) {
  const fn = url.pathname.split('/')[4];
  const isSet = await fnReturnsSet(fn);
  if (isSet === null) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
  const args = JSON.parse((await readBody(req)).toString() || '{}');
  const list = Object.entries(args).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ');
  const sql = isSet
    ? `select coalesce(json_agg(q), '[]'::json)::text from public.${ident(fn)}(${list}) q`
    : `select coalesce(to_json(public.${ident(fn)}(${list}))::text, 'null')`;
  const json = await asUser(uid, sql);
  send(res, 200, json, { 'Content-Type': 'application/json' });
}

async function auth(req, res, url) {
  const path = url.pathname.replace('/auth/v1/', '');
  const body = req.method === 'POST' ? JSON.parse((await readBody(req)).toString() || '{}') : {};
  const session = (u, email) => ({ access_token: `tok.${u}`, refresh_token: `ref.${u}`, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, email } });
  if (path === 'signup') {
    if (users.has(body.email)) return send(res, 422, { msg: 'User already registered' });
    const id = randomUUID();
    users.set(body.email, { id, password: body.password });
    await pg.query(`insert into auth.users (id, email) values (${lit(id)}, ${lit(body.email)})`);
    return send(res, 200, session(id, body.email));
  }
  if (path === 'token') {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const id = String(body.refresh_token).replace('ref.', '');
      const email = [...users.entries()].find(([, v]) => v.id === id)?.[0];
      return email ? send(res, 200, session(id, email)) : send(res, 400, { error_description: 'Invalid Refresh Token' });
    }
    const u = users.get(body.email);
    if (!u || u.password !== body.password) return send(res, 400, { error_description: 'Invalid login credentials' });
    return send(res, 200, session(u.id, body.email));
  }
  if (path === 'user') {
    const id = userFrom(req);
    const email = [...users.entries()].find(([, v]) => v.id === id)?.[0];
    return id && email ? send(res, 200, { id, email }) : send(res, 401, { msg: 'no user' });
  }
  if (path === 'logout') return send(res, 204);
  if (path.startsWith('otp')) return send(res, 200, {});
  send(res, 404, { msg: 'unknown auth path' });
}

async function storage(req, res, url, uid) {
  // /storage/v1/object/photos/<path>  or  /storage/v1/object/authenticated/photos/<path>
  const parts = url.pathname.split('/').slice(4);
  if (parts[0] === 'authenticated') parts.shift();
  const bucket = parts.shift();
  const name = decodeURIComponent(parts.join('/'));
  if (req.method === 'POST') {
    const data = await readBody(req);
    await asUser(uid, `insert into storage.objects (bucket_id, name, owner) select ${lit(bucket)}, ${lit(name)}, ${lit(uid)} where not exists (select 1 from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(name)}) returning 'ok'`);
    files.set(`${bucket}/${name}`, data);
    return send(res, 200, { Key: `${bucket}/${name}` });
  }
  if (req.method === 'GET') {
    const ok = await asUser(uid, `select count(*)::text from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(name)}`);
    const data = files.get(`${bucket}/${name}`);
    if (ok === '0' || !data) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return send(res, 200, data, { 'Content-Type': 'image/jpeg' });
  }
  if (req.method === 'DELETE') {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    for (const p of prefixes) {
      await asUser(uid, `with w as (delete from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(p)} returning 1) select count(*)::text from w`);
      files.delete(`${bucket}/${p}`);
    }
    return send(res, 200, []);
  }
  send(res, 405, {});
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const uid = userFrom(req);
  log.push(`${req.method} ${url.pathname}${url.search} ${uid ? uid.slice(0, 8) : 'anon'}`);
  try {
    if (url.pathname === '/__log') return send(res, 200, log.splice(0));
    if (url.pathname === '/__sql' && req.method === 'POST') {
      const r = await pg.query((await readBody(req)).toString());
      return send(res, 200, r.map((x) => x.rows));
    }
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return await rpc(req, res, url, uid);
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url, uid);
    if (url.pathname.startsWith('/storage/v1/object')) return await storage(req, res, url, uid);
    send(res, 404, { message: 'not found' });
  } catch (e) {
    log.push(`  !! ${e.code} ${e.message}`);
    pgError(res, e);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`mock supabase on ${PORT}`));
