// Minimal PostgreSQL client (simple query protocol, trust auth, Unix socket). For local tests only.
import net from 'node:net';

export class Pg {
  constructor({ path, user = 'postgres', database }) {
    this.opts = { path, user, database };
    this.buf = Buffer.alloc(0);
    this.queue = Promise.resolve();
    this.waiter = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.createConnection({ path: this.opts.path });
      this.sock.on('error', reject);
      // The test database was reset: exit so the wrapper loop restarts with a fresh connection.
      this.sock.on('close', () => { console.log('database connection closed'); process.exit(1); });
      this.sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.drain(); });
      this.sock.on('connect', () => {
        const params = Buffer.from(`user\0${this.opts.user}\0database\0${this.opts.database}\0\0`);
        const head = Buffer.alloc(8);
        head.writeInt32BE(8 + params.length, 0);
        head.writeInt32BE(196608, 4);
        this.sock.write(Buffer.concat([head, params]));
        this.waiter = { resolve: () => resolve(this), reject, results: [], error: null, cur: null };
      });
    });
  }

  drain() {
    while (this.buf.length >= 5) {
      const type = String.fromCharCode(this.buf[0]);
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < 1 + len) return;
      const body = this.buf.subarray(5, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      this.handle(type, body);
    }
  }

  handle(type, body) {
    const w = this.waiter;
    if (!w) return;
    if (type === 'R') {
      const code = body.readInt32BE(0);
      if (code !== 0) w.reject(new Error(`auth method ${code} not supported`));
    } else if (type === 'T') {
      const n = body.readInt16BE(0);
      let off = 2;
      const fields = [];
      for (let i = 0; i < n; i++) {
        const end = body.indexOf(0, off);
        fields.push(body.toString('utf8', off, end));
        off = end + 1 + 18;
      }
      w.cur = { fields, rows: [] };
    } else if (type === 'D') {
      const n = body.readInt16BE(0);
      let off = 2;
      const row = [];
      for (let i = 0; i < n; i++) {
        const l = body.readInt32BE(off);
        off += 4;
        if (l === -1) row.push(null);
        else { row.push(body.toString('utf8', off, off + l)); off += l; }
      }
      w.cur?.rows.push(row);
    } else if (type === 'C') {
      w.results.push(w.cur || { fields: [], rows: [] });
      w.cur = null;
    } else if (type === 'E') {
      const f = {};
      let off = 0;
      while (off < body.length && body[off] !== 0) {
        const k = String.fromCharCode(body[off]);
        const end = body.indexOf(0, off + 1);
        f[k] = body.toString('utf8', off + 1, end);
        off = end + 1;
      }
      w.error = { code: f.C, message: f.M, detail: f.D, hint: f.H };
    } else if (type === 'Z') {
      this.waiter = null;
      if (w.error) w.reject(Object.assign(new Error(w.error.message), w.error));
      else w.resolve(w.results);
    }
  }

  /** Run SQL text. Resolves with every result set. Calls are queued, one at a time. */
  query(sql) {
    const run = () => new Promise((resolve, reject) => {
      this.waiter = { resolve, reject, results: [], error: null, cur: null };
      const q = Buffer.from(sql + '\0');
      const head = Buffer.alloc(5);
      head.write('Q', 0);
      head.writeInt32BE(4 + q.length, 1);
      this.sock.write(Buffer.concat([head, q]));
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}

export const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return `'${String(v)}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
export const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { code: '42602' });
  return `"${s}"`;
};
