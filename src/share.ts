// Sharing: Apiary Groups, mentor links, and who may do what.
// Group records live only on the server. They are cached on the phone so roles still work offline.
import * as db from './db';
import type { Apiary, Base, Hive, HiveComment, Inspection, Harvest, Photo, Profile, Table } from './db';
import { api, currentSession } from './sync';

export type Role = 'owner' | 'partner' | 'helper' | 'viewer';
export type MemberRole = Exclude<Role, 'owner'>;
export const ROLE_RANK: Record<Role, number> = { owner: 4, partner: 3, helper: 2, viewer: 1 };
export const ROLE_INFO: Record<Role, { label: string; text: string }> = {
  owner: { label: 'Owner', text: 'Everything, including members and exact locations.' },
  partner: { label: 'Partner', text: 'Sees records and photos, logs inspections, edits hives and apiaries. Cannot delete.' },
  helper: { label: 'Helper', text: 'Sees records and photos and logs inspections. Cannot edit hives or apiaries.' },
  viewer: { label: 'Viewer', text: 'Sees records and photos and can leave comments. Logs nothing.' },
};

export interface Group { id: string; owner_id: string; owner_name?: string | null; name: string; kind: 'apiaries' | 'mentor'; created_at?: string }
export interface Member { group_id: string; user_id: string; display_name?: string | null; role: MemberRole; exact_location: boolean; expires_at?: string | null; joined_at?: string }
export interface Invite { code: string; group_id: string; role: MemberRole; exact_location: boolean; cover_days?: number | null; expires_at: string; max_uses: number; uses: number }
export interface ShareData {
  userId: string;
  groups: Group[];
  members: Member[];
  apiaries: { group_id: string; apiary_id: string }[];
  hives: { group_id: string; hive_id: string }[];
  invites: Invite[];
  at: string;
}

const KEY = 'share';

export async function getShare(): Promise<ShareData | undefined> {
  const s = currentSession();
  const d = await db.getMeta<ShareData>(KEY);
  return s && d && d.userId === s.user.id ? d : undefined;
}
export const useShare = () => db.useLive(getShare);

export const activeMember = (m: Member) => !m.expires_at || new Date(m.expires_at).getTime() > Date.now();
export const myId = () => currentSession()?.user.id;

/** Fetch every group I own or belong to. Row-level security limits each list to what I may see. */
export async function refreshShare(maxAgeMs = 0): Promise<ShareData> {
  const me = currentSession()?.user.id;
  if (!me) throw new Error('Not signed in');
  if (maxAgeMs) {
    const cached = await getShare();
    if (cached && Date.now() - new Date(cached.at).getTime() < maxAgeMs) return cached;
  }
  const get = async <T,>(t: string) => (await (await api(`/rest/v1/${t}?select=*`)).json()) as T[];
  const [groups, members, apiaries, hives, invites] = await Promise.all([
    get<Group>('groups'), get<Member>('group_members'), get<ShareData['apiaries'][number]>('group_apiaries'),
    get<ShareData['hives'][number]>('group_hives'), get<Invite>('group_invites'),
  ]);
  const data: ShareData = { userId: me, groups, members, apiaries, hives, invites, at: new Date().toISOString() };
  await db.setMeta(KEY, data);
  // New access means older rows to fetch: start the pull from the beginning.
  const fp = fingerprint(data);
  if (fp !== (await db.getMeta<string>('share:fp'))) {
    for (const t of db.TABLES) await db.delMeta(`cursor:${t}`);
    await db.delMeta('cursor:apiary_locations');
    await db.setMeta('share:fp', fp);
  }
  db.notify();
  return data;
}

function fingerprint(s: ShareData) {
  const mine = s.members.filter((m) => m.user_id === s.userId && activeMember(m)).map((m) => `${m.group_id}:${m.role}:${m.exact_location}`);
  const live = new Set(s.members.filter((m) => m.user_id === s.userId && activeMember(m)).map((m) => m.group_id));
  const shared = [...s.apiaries.filter((x) => live.has(x.group_id)).map((x) => `a:${x.apiary_id}`), ...s.hives.filter((x) => live.has(x.group_id)).map((x) => `h:${x.hive_id}`)];
  return JSON.stringify([mine.sort(), shared.sort()]);
}

// ---------------- roles ----------------
const isMine = (r: Base | undefined, me?: string) => !!r && (!r.owner_id || !me || r.owner_id === me);

function best(a: Role | null, b: Role | null) {
  if (!a) return b;
  if (!b) return a;
  return ROLE_RANK[b] > ROLE_RANK[a] ? b : a;
}

function memberRoleFor(s: ShareData | undefined, me: string | undefined, groupIds: string[]): { role: Role | null; exact: boolean } {
  let role: Role | null = null;
  let exact = false;
  if (!s || !me) return { role, exact };
  for (const m of s.members) {
    if (m.user_id !== me || !groupIds.includes(m.group_id) || !activeMember(m)) continue;
    role = best(role, m.role);
    exact = exact || m.exact_location;
  }
  return { role, exact };
}

export function apiaryRole(a: Apiary | undefined, s: ShareData | undefined, me = myId()): Role | null {
  if (!a) return null;
  if (isMine(a, me)) return 'owner';
  return memberRoleFor(s, me, (s?.apiaries || []).filter((x) => x.apiary_id === a.id).map((x) => x.group_id)).role;
}

export function hiveRole(h: Hive | undefined, a: Apiary | undefined, s: ShareData | undefined, me = myId()): Role | null {
  if (!h) return null;
  const viaApiary = a ? apiaryRole(a, s, me) : null;
  const viaHive = memberRoleFor(s, me, (s?.hives || []).filter((x) => x.hive_id === h.id).map((x) => x.group_id)).role;
  const r = best(viaApiary, viaHive);
  if (r) return r;
  // A hive whose apiary is not on this phone, and that nobody shared: only yours if you made it.
  return !a && isMine(h, me) && !h.owner_id ? 'owner' : null;
}

export interface Access {
  role: Role | null;
  isOwner: boolean;
  canInspect: boolean; // inspections, photos, weights, harvests
  canEdit: boolean; // hive and apiary details
  canComment: boolean;
}
export function access(role: Role | null): Access {
  const r = role ? ROLE_RANK[role] : 0;
  return { role, isOwner: role === 'owner', canInspect: r >= 2, canEdit: r >= 3, canComment: r >= 1 && !!currentSession() };
}

/** Role in a hive, loaded fresh. For screens. */
export async function hiveAccess(hive?: Hive, apiary?: Apiary): Promise<Access> {
  return access(hiveRole(hive, apiary, await getShare()));
}

// ---------------- after a pull: drop what I can no longer see ----------------
export interface Unsent { table: Table; row: Base; reason: string; at: string }

export async function stashUnsent(items: Unsent[]) {
  if (!items.length) return;
  const cur = (await db.getMeta<Unsent[]>('unsent')) || [];
  await db.setMeta('unsent', [...cur, ...items].slice(-200));
}

const HIVE_CHILDREN: Table[] = ['inspections', 'photos', 'weights', 'harvests', 'comments'];

/** Changes the server turned away (role or access), still on this phone and flagged. */
export async function refusedRows(): Promise<Unsent[]> {
  const out: Unsent[] = [];
  for (const t of db.TABLES) {
    for (const r of await db.dirty(t)) {
      const reason = (r as Base & { _refused?: string })._refused;
      if (reason) out.push({ table: t, row: r, reason, at: r.updated_at || '' });
    }
  }
  return out;
}
export async function retryRefused() {
  for (const u of await refusedRows()) {
    const { _refused, ...rest } = u.row as Base & { _refused?: string };
    await db.putRaw(u.table, rest as Base);
  }
  db.notify();
}
/** Drop refused changes; the server's own version comes back with the next sync. */
export async function discardRefused() {
  const list = await refusedRows();
  for (const u of list) {
    await db.purge(u.table, u.row.id);
    await db.delMeta(`cursor:${u.table}`);
  }
  await db.delMeta('unsent');
  db.notify();
}

/**
 * Remove shared records from this phone once access has ended (cover or mentor time is up,
 * a member was removed, or they left). Unsent changes to those records are kept in a list
 * the user can export, because the server would refuse them now.
 */
export async function purgeLostAccess(s: ShareData) {
  const me = s.userId;
  const apiaries = await db.all<Apiary>('apiaries', true);
  const hives = await db.all<Hive>('hives', true);
  const okApiary = new Set(apiaries.filter((a) => apiaryRole(a, s, me)).map((a) => a.id));
  const sharedHive = new Set(s.hives.filter((x) => s.members.some((m) => m.group_id === x.group_id && m.user_id === me && activeMember(m))).map((x) => x.hive_id));
  const okHive = new Set(hives.filter((h) => okApiary.has(h.apiary_id) || sharedHive.has(h.id) || (!h.owner_id && !apiaries.some((a) => a.id === h.apiary_id))).map((h) => h.id));
  const lost: Unsent[] = [];
  const drop = async (table: Table, r: Base) => {
    if (r._dirty && !r.deleted) lost.push({ table, row: r, reason: 'Your access to this apiary or hive ended before it was sent.', at: new Date().toISOString() });
    await db.purge(table, r.id);
  };
  let changed = 0;
  for (const a of apiaries) {
    if (!okApiary.has(a.id)) { await drop('apiaries', a); changed++; continue; }
    // Without exact-location permission, keep only the approximate point (about 1 km).
    if (!isMine(a, me) && a.lat != null && a.lng != null && !memberRoleFor(s, me, s.apiaries.filter((x) => x.apiary_id === a.id).map((x) => x.group_id)).exact) {
      const lat = Math.round(a.lat * 100) / 100, lng = Math.round(a.lng * 100) / 100;
      if (lat !== a.lat || lng !== a.lng || a.location_precision === 'precise') { await db.putClean('apiaries', { ...a, lat, lng, location_precision: 'approximate' } as Apiary); changed++; }
    }
  }
  for (const h of hives) if (!okHive.has(h.id)) { await drop('hives', h); changed++; }
  for (const t of HIVE_CHILDREN) {
    for (const r of await db.all<Base & { hive_id?: string | null }>(t, true)) {
      if (r.hive_id && !okHive.has(r.hive_id)) { await drop(t, r); changed++; }
    }
  }
  await stashUnsent(lost);
  if (changed) db.notify();
}

/** On sign-out, other people's shared records leave this phone. Your own stay. */
export async function purgeOthers(me: string | undefined) {
  if (!me) return;
  for (const t of db.TABLES) {
    for (const r of await db.all<Base>(t, true)) if (r.owner_id && r.owner_id !== me) await db.purge(t, r.id);
  }
  await db.delMeta(KEY);
  await db.delMeta('share:fp');
  db.notify();
}

// ---------------- names and activity ----------------
export function nameFor(userId: string | undefined, s: ShareData | undefined, me = myId()) {
  if (!userId || userId === me) return 'You';
  const m = s?.members.find((x) => x.user_id === userId && x.display_name);
  if (m?.display_name) return m.display_name;
  const g = s?.groups.find((x) => x.owner_id === userId && x.owner_name);
  return g?.owner_name || 'A member';
}

export interface Activity { id: string; who: string; what: string; at: string; href: string }

/** What other people did on shared hives in the last two weeks. */
export async function recentActivity(s: ShareData, days = 14): Promise<Activity[]> {
  const me = s.userId;
  const since = Date.now() - days * 86400000;
  const [hives, inspections, comments, harvests, photos] = await Promise.all([
    db.all<Hive>('hives'), db.all<Inspection>('inspections'), db.all<HiveComment>('comments'), db.all<Harvest>('harvests'), db.all<Photo>('photos'),
  ]);
  const hiveName = (id: string) => hives.find((h) => h.id === id)?.name || 'a hive';
  const others = <T extends Base>(list: T[], when: (r: T) => string | undefined) => list.filter((r) => r.owner_id && r.owner_id !== me && new Date(when(r) || 0).getTime() > since);
  const out: Activity[] = [
    ...others(inspections, (i) => i.inspected_at).map((i) => ({ id: i.id, who: nameFor(i.owner_id, s, me), what: `inspected ${hiveName(i.hive_id)}`, at: i.inspected_at, href: `/inspection/${i.id}` })),
    ...others(comments, (c) => c.created_at).map((c) => ({ id: c.id, who: c.author_name || nameFor(c.owner_id, s, me), what: `commented on ${hiveName(c.hive_id)}`, at: c.created_at!, href: `/hive/${c.hive_id}` })),
    ...others(harvests, (h) => h.harvested_at).map((h) => ({ id: h.id, who: nameFor(h.owner_id, s, me), what: `logged ${h.kg} kg from ${hiveName(h.hive_id)}`, at: h.harvested_at, href: `/hive/${h.hive_id}` })),
    ...others(photos.filter((p) => p.hive_id && !p.inspection_id), (p) => p.taken_at).map((p) => ({ id: p.id, who: nameFor(p.owner_id, s, me), what: `added a photo to ${hiveName(p.hive_id!)}`, at: p.taken_at!, href: `/hive/${p.hive_id}` })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}

// ---------------- actions (need signal and an account) ----------------
async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
const post = (path: string, body: unknown, prefer = 'return=representation') =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: prefer }, body: JSON.stringify(body) });

export async function myDisplayName() {
  const p = (await db.all<Profile>('profiles'))[0];
  return p?.display_name?.trim() || currentSession()?.user.email?.split('@')[0] || 'Beekeeper';
}

export async function createGroup(name: string, kind: Group['kind'] = 'apiaries'): Promise<Group> {
  const [g] = await json<Group[]>(await post('/rest/v1/groups', { name, kind, owner_name: await myDisplayName() }));
  await refreshShare();
  return g;
}
export async function renameGroup(id: string, name: string) {
  await api(`/rest/v1/groups?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  await refreshShare();
}
export async function deleteGroup(id: string) {
  await api(`/rest/v1/groups?id=eq.${id}`, { method: 'DELETE' });
  await refreshShare();
}

/** The record must be on the server before it can be shared. */
async function ensureSynced(table: Table, id: string) {
  const { syncNow } = await import('./sync');
  const r = await db.getRaw(table, id);
  if (r?._dirty) await syncNow();
  const again = await db.getRaw(table, id);
  if (again?._dirty) throw new Error('Sync your records first, then try again.');
}

export async function shareApiary(groupId: string, apiaryId: string) {
  await ensureSynced('apiaries', apiaryId);
  for (const h of await db.byIndex<Hive>('hives', 'apiary_id', apiaryId)) await ensureSynced('hives', h.id);
  await post('/rest/v1/group_apiaries', { group_id: groupId, apiary_id: apiaryId }, 'return=minimal');
  await refreshShare();
}
export async function unshareApiary(groupId: string, apiaryId: string) {
  await api(`/rest/v1/group_apiaries?group_id=eq.${groupId}&apiary_id=eq.${apiaryId}`, { method: 'DELETE' });
  await refreshShare();
}
export async function shareHive(groupId: string, hiveId: string) {
  await ensureSynced('hives', hiveId);
  await post('/rest/v1/group_hives', { group_id: groupId, hive_id: hiveId }, 'return=minimal');
  await refreshShare();
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(r, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
export const joinUrl = (code: string) => `${location.origin}${location.pathname.replace(/index\.html$/, '')}#/join/${code}`;
export const parseJoinCode = (text: string) => {
  const t = text.trim().toUpperCase();
  const m = t.match(/JOIN\/([A-HJ-NP-Z2-9]{6})\b/) || t.match(/^([A-HJ-NP-Z2-9]{6})$/);
  return m ? m[1] : null;
};

export async function createInvite(opts: { groupId: string; role: MemberRole; exactLocation?: boolean; coverDays?: number | null; maxUses?: number; validDays?: number }): Promise<Invite> {
  const body = {
    group_id: opts.groupId, role: opts.role, exact_location: opts.role === 'partner' && !!opts.exactLocation,
    cover_days: opts.coverDays || null, max_uses: opts.maxUses || 1,
    expires_at: new Date(Date.now() + (opts.validDays || 7) * 86400000).toISOString(),
  };
  for (let i = 0; i < 4; i++) {
    try {
      const [inv] = await json<Invite[]>(await post('/rest/v1/group_invites', { ...body, code: newCode() }));
      await refreshShare();
      return inv;
    } catch (e: any) {
      if (!/23505|duplicate/i.test(e.message)) throw e; // code already taken: try another
    }
  }
  throw new Error('Could not make an invite code. Try again.');
}
export async function deleteInvite(code: string) {
  await api(`/rest/v1/group_invites?code=eq.${code}`, { method: 'DELETE' });
  await refreshShare();
}

export async function joinGroup(code: string, displayName: string): Promise<string> {
  const res = await post('/rest/v1/rpc/join_group', { p_code: code.toUpperCase(), p_display_name: displayName.trim() || null });
  const groupId = await json<string>(res);
  await refreshShare();
  const { syncNow } = await import('./sync');
  syncNow();
  return groupId;
}

export async function updateMember(groupId: string, userId: string, patch: Partial<Pick<Member, 'role' | 'exact_location' | 'expires_at'>>) {
  await api(`/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  await refreshShare();
}
export async function removeMember(groupId: string, userId: string) {
  await api(`/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${userId}`, { method: 'DELETE' });
  await refreshShare();
}
export async function leaveGroup(groupId: string) {
  const me = myId();
  await api(`/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${me}`, { method: 'DELETE' });
  const s = await refreshShare();
  await purgeLostAccess(s);
}

/** Mentor mode: a one-hive, view-only link that ends by itself. */
export async function createMentorLink(hive: Hive, days: number): Promise<{ group: Group; invite: Invite }> {
  const s = await getShare();
  let group = s?.groups.find((g) => g.kind === 'mentor' && g.owner_id === myId() && s.hives.some((x) => x.group_id === g.id && x.hive_id === hive.id));
  if (!group) {
    group = await createGroup(`Mentor: ${hive.name}`, 'mentor');
    await shareHive(group.id, hive.id);
  }
  const invite = await createInvite({ groupId: group.id, role: 'viewer', coverDays: days, maxUses: 1, validDays: 7 });
  return { group, invite };
}
