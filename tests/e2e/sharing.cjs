// Release 1.4 end-to-end: three people on three phones, against the local Supabase stand-in.
// Owner Lucille shares an apiary with partner Pieter and one hive with mentor Sipho.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:8084/';
const API = process.env.API_URL || 'http://127.0.0.1:54321';
const SHOTS = path.join(__dirname, '..', '.out', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); if (!cond) console.log('FAIL', name, extra); };
const sql = async (q) => (await fetch(`${API}/__sql`, { method: 'POST', body: q })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function phone(browser, name) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: { latitude: -33.934123, longitude: 18.860456 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('hg:settings')) localStorage.setItem('hg:settings', JSON.stringify({ theme: 'light', locationMode: 'precise', onboarded: false, weather: false }));
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) page.errors.push(`${name} console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  return page;
}

async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await sleep(250);
}

async function onboard(page, name) {
  await page.goto(APP);
  await page.getByRole('button', { name: /Get started/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Province').selectOption('Western Cape');
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForSelector('text=Hello');
}

async function signUp(page, email) {
  await go(page, '/more');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('test-pass-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('text=Sync now', { timeout: 10000 });
}

async function syncNow(page) {
  await go(page, '/more');
  await page.getByRole('button', { name: /Sync now/ }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Syncing…'), null, { timeout: 15000 });
  await sleep(400);
}

async function idb(page, store) {
  return page.evaluate((s) => new Promise((resolve, reject) => {
    const r = indexedDB.open('honeyguide');
    r.onsuccess = () => {
      const tx = r.result.transaction(s, 'readonly').objectStore(s).getAll();
      tx.onsuccess = () => { resolve(tx.result); r.result.close(); };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  }), store);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch();
  const A = await phone(browser, 'Lucille');
  const B = await phone(browser, 'Pieter');
  const C = await phone(browser, 'Sipho');
  try {
    // ---------- owner sets up ----------
    await onboard(A, 'Lucille');
    await signUp(A, 'lucille@example.co.za');
    await go(A, '/apiary/new');
    await A.getByLabel('Name').fill('Home garden');
    await A.getByRole('button', { name: /Exact pin/ }).click();
    await A.waitForSelector('text=Exact location saved');
    await A.getByRole('button', { name: 'Save apiary' }).click();
    await A.waitForSelector('text=No hives here yet');
    const apiaryId = A.url().split('/apiary/')[1];
    for (const n of ['Hive 1', 'Hive 2']) {
      await go(A, `/hive/new?apiary=${apiaryId}`);
      await A.getByLabel('Name').fill(n);
      await A.getByRole('button', { name: 'Save hive' }).click();
      await A.waitForSelector(`h1:has-text("${n}")`);
    }
    const aHives = await idb(A, 'hives');
    const hive1 = aHives.find((h) => h.name === 'Hive 1');
    const hive2 = aHives.find((h) => h.name === 'Hive 2');
    await go(A, `/inspect/${hive1.id}`);
    for (let i = 0; i < 6; i++) await A.getByRole('button', { name: /^Next/ }).click();
    await A.getByRole('button', { name: /Save inspection/ }).click();
    await A.waitForURL(/#\/hive\//);
    await syncNow(A);
    const row = (await sql(`select lat::text, lng::text, location_precision from public.apiaries where id = '${apiaryId}'`))[0][0];
    const loc = (await sql(`select lat::text, lng::text from public.apiary_locations where apiary_id = '${apiaryId}'`))[0][0];
    ok('apiary row on the server holds the rounded point', row && row[0] === '-33.93' && row[1] === '18.86', JSON.stringify(row));
    ok('exact pin stored separately', loc && loc[0] === '-33.93412', JSON.stringify(loc));
    const aApiary = (await idb(A, 'apiaries'))[0];
    ok('owner phone keeps the exact pin after sync', aApiary.lat === -33.93412 && aApiary._dirty === 0, `${aApiary.lat} dirty=${aApiary._dirty}`);
    await go(A, '/');
    ok('nothing left to sync', (await A.locator('.topbar .chip').first().innerText()).includes('Synced'));

    // ---------- group and partner invite ----------
    await go(A, '/sharing');
    await A.getByRole('button', { name: /New group/ }).click();
    await A.getByLabel('Group name').fill('Farm team');
    await A.getByRole('button', { name: 'Create group' }).click();
    await A.waitForSelector('text=Apiaries in this group');
    await A.getByLabel('Share Home garden').click();
    await A.waitForSelector('text=Home garden shared');
    await A.getByRole('button', { name: /Make an invite/ }).click();
    await A.waitForSelector('.invite-code');
    const code = (await A.locator('.invite-code').innerText()).replace(/\s/g, '');
    ok('invite code has 6 characters', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
    await shot(A, '01-group-invite');

    // ---------- partner joins ----------
    await onboard(B, 'Pieter');
    await signUp(B, 'pieter@example.co.za');
    await go(B, `/join/${code}`);
    await B.waitForSelector('text=Your name');
    await shot(B, '02-join');
    await B.getByRole('button', { name: /^Join$/ }).click();
    await B.waitForSelector('text=Shared with you');
    await sleep(800);
    await syncNow(B);
    await go(B, '/apiaries');
    await B.waitForSelector('text=Home garden');
    ok('partner sees the shared apiary with its owner', (await B.locator('.list').innerText()).includes('Shared by Lucille'));
    const bApiary = (await idb(B, 'apiaries'))[0];
    ok('partner gets only the approximate point', bApiary && bApiary.lat === -33.93 && bApiary.location_precision === 'approximate', `${bApiary?.lat} ${bApiary?.location_precision}`);
    ok('partner phone has both hives', (await idb(B, 'hives')).length === 2);

    // owner lets the partner see the exact pin, then takes it back
    await go(A, '/sharing');
    await A.getByText('Farm team').click();
    await A.getByLabel('Show exact apiary locations', { exact: true }).click();
    await A.waitForSelector('text=Exact locations shared');
    await syncNow(B);
    let bA = (await idb(B, 'apiaries'))[0];
    ok('partner gets the exact pin once allowed', bA.lat === -33.93412 && bA.location_precision === 'precise', `${bA.lat} ${bA.location_precision}`);
    await go(A, '/sharing');
    await A.getByText('Farm team').click();
    await A.getByLabel('Show exact apiary locations', { exact: true }).click();
    await A.waitForSelector('text=Exact locations hidden');
    await syncNow(B);
    bA = (await idb(B, 'apiaries'))[0];
    ok('partner is back to the rounded point when the owner says no', bA.lat === -33.93 && bA.location_precision === 'approximate', `${bA.lat} ${bA.location_precision}`);

    // partner inspects Hive 2 and comments on Hive 1
    await go(B, `/hive/${hive2.id}`);
    await B.waitForSelector('text=Shared by Lucille');
    ok('partner can edit hives (pencil shown)', await B.getByLabel('Edit hive').isVisible());
    await go(B, `/inspect/${hive2.id}`);
    for (let i = 0; i < 6; i++) await B.getByRole('button', { name: /^Next/ }).click();
    await B.getByRole('button', { name: /Save inspection/ }).click();
    await B.waitForURL(/#\/hive\//);
    await go(B, `/hive/${hive1.id}`);
    await B.getByRole('textbox', { name: 'Comment' }).fill('Looks strong. Add a super next week.');
    await B.getByLabel('Send comment').click();
    await B.waitForSelector('text=Looks strong');
    await syncNow(B);

    // owner sees the partner's work
    await syncNow(A);
    await go(A, '/sharing');
    await A.waitForSelector('text=Recent activity');
    const act = await A.locator('main').innerText();
    ok('activity shows the partner inspection', /Pieter\s+inspected Hive 2/.test(act));
    ok('activity shows the partner comment', /Pieter\s+commented on Hive 1/.test(act));
    await shot(A, '03-sharing-hub');
    await go(A, '/');
    await A.waitForSelector('text=New comment');
    ok('home shows the new comment', true);

    // ---------- mentor link for one hive ----------
    await go(A, `/hive/${hive1.id}`);
    await A.getByRole('button', { name: /Ask a mentor/ }).click();
    await A.getByRole('button', { name: /Make a mentor link/ }).click();
    await A.waitForSelector('.sheet .invite-code');
    const mcode = (await A.locator('.sheet .invite-code').innerText()).replace(/\s/g, '');
    await shot(A, '04-mentor-link');
    await A.keyboard.press('Escape');

    await onboard(C, 'Sipho');
    await signUp(C, 'sipho@example.co.za');
    await go(C, `/join/${mcode}`);
    await C.getByRole('button', { name: /^Join$/ }).click();
    await C.waitForSelector('text=Shared with you');
    await sleep(800);
    await syncNow(C);
    ok('mentor phone has only the shared hive', JSON.stringify((await idb(C, 'hives')).map((h) => h.name)) === '["Hive 1"]');
    ok('mentor phone has no apiary', (await idb(C, 'apiaries')).length === 0);
    ok('mentor sees the inspection on that hive', (await idb(C, 'inspections')).length === 1);
    await go(C, '/sharing');
    await C.getByText('Lucille · Mentor: Hive 1').click();
    await C.getByText('Hive 1').last().click();
    await C.waitForSelector('text=Comments');
    ok('mentor cannot inspect', !(await C.getByRole('link', { name: 'Inspect', exact: true }).count()));
    ok('mentor cannot edit', !(await C.getByLabel('Edit hive').count()));
    await C.getByRole('textbox', { name: 'Comment' }).fill('Check for queen cells on the next warm day.');
    await C.getByLabel('Send comment').click();
    await C.waitForSelector('text=queen cells');
    await shot(C, '05-mentor-hive');
    await syncNow(C);
    await syncNow(A);
    ok('owner received the mentor comment', (await idb(A, 'comments')).some((c) => /queen cells/.test(c.body) && c.author_name === 'Sipho'));

    // ---------- owner changes the partner to helper ----------
    await go(A, '/sharing');
    await A.getByText('Farm team').click();
    await A.waitForSelector('text=Members');
    await A.getByRole('group', { name: 'Role' }).first().getByRole('button', { name: 'Helper' }).click();
    await A.waitForSelector('text=Role changed');
    await syncNow(B);
    await go(B, `/hive/${hive1.id}`);
    await B.waitForSelector('text=you are a helper');
    ok('helper has no edit pencil', !(await B.getByLabel('Edit hive').count()));
    ok('helper can still inspect', await B.getByRole('link', { name: 'Inspect', exact: true }).isVisible());

    // A refused change: the helper's phone tries to rename a hive anyway.
    await B.evaluate((id) => new Promise((resolve) => {
      const r = indexedDB.open('honeyguide');
      r.onsuccess = () => {
        const st = r.result.transaction('hives', 'readwrite').objectStore('hives');
        const g = st.get(id);
        g.onsuccess = () => { st.put({ ...g.result, name: 'Renamed by helper', _dirty: 1, _rev: (g.result._rev || 0) + 1 }).onsuccess = () => { r.result.close(); resolve(); }; };
      };
    }), hive1.id);
    await syncNow(B);
    const refusedHive = (await idb(B, 'hives')).find((h) => h.id === hive1.id);
    ok('refused change stays on the phone, flagged', refusedHive && refusedHive._refused && refusedHive.name === 'Renamed by helper', refusedHive?._refused);
    ok('server kept the owner name', (await sql(`select name from public.hives where id = '${hive1.id}'`))[0][0][0] === 'Hive 1');
    await go(B, '/sharing');
    await B.waitForSelector('text=could not be sent');
    await shot(B, '06-refused');
    await B.getByRole('button', { name: 'Discard' }).click();
    await sleep(500);
    await syncNow(B);
    ok('after discard the server version is back', (await idb(B, 'hives')).find((h) => h.id === hive1.id)?.name === 'Hive 1');

    // ---------- signing out takes other people's records off the phone ----------
    await go(B, '/more');
    await B.getByRole('button', { name: /Sign out/ }).click();
    await B.waitForSelector('text=Create account');
    ok('sign-out removes the shared apiary and hives', (await idb(B, 'apiaries')).length === 0 && (await idb(B, 'hives')).length === 0);
    ok('sign-out keeps your own profile', (await idb(B, 'profiles')).length === 1);
    await B.getByLabel('Email').fill('pieter@example.co.za');
    await B.getByLabel('Password').fill('test-pass-123');
    await B.getByRole('button', { name: 'Sign in', exact: true }).click();
    await B.waitForSelector('text=Sync now');
    await sleep(500);
    await syncNow(B);
    ok('signing in again brings the shared records back', (await idb(B, 'hives')).length === 2);

    // ---------- owner ends mentor access ----------
    await go(A, `/hive/${hive1.id}`);
    await A.getByRole('button', { name: /Ask a mentor/ }).click();
    await A.getByRole('button', { name: 'End now' }).click();
    await A.waitForSelector('text=Mentor access ended');
    await A.keyboard.press('Escape');
    await syncNow(C);
    ok('mentor phone drops the hive when access ends', (await idb(C, 'hives')).length === 0 && (await idb(C, 'comments')).length === 0);

    // ---------- partner leaves ----------
    await go(B, '/sharing');
    await B.getByText('Lucille · Farm team').click();
    await B.getByRole('button', { name: /Leave group/ }).click();
    await B.waitForSelector('text=Your groups');
    ok('partner phone drops the shared apiary after leaving', (await idb(B, 'apiaries')).length === 0 && (await idb(B, 'hives')).length === 0);
    ok('owner still has everything', (await idb(A, 'hives')).length === 2 && (await idb(A, 'inspections')).length === 2);

    // ---------- landowner log ----------
    await go(A, `/apiary/${apiaryId}`);
    await A.getByRole('link', { name: /Add the landowner/ }).click();
    await A.getByLabel('Landowner').fill('Oom Piet van Wyk');
    await A.getByLabel('Phone').fill('082 555 0101');
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await A.getByLabel('Until').fill(soon);
    await A.getByLabel('What you agreed').fill('6 jars of honey a year. Hives behind the shed.');
    await A.getByRole('button', { name: 'Save' }).click();
    await A.waitForSelector('text=Permission runs out soon');
    await A.getByRole('button', { name: /^Log$/ }).click();
    await A.getByLabel('The complaint').fill('Bees at the neighbour\'s pool in the afternoon');
    await A.locator('.sheet').getByRole('button', { name: 'Save' }).click();
    await A.waitForSelector('text=Mark as sorted out');
    await shot(A, '07-landowner');
    await go(A, '/');
    await A.waitForSelector('text=Landowner permission');
    ok('home reminds about the landowner permission', true);
    await syncNow(A);
    ok('agreement synced, private to the owner', (await sql(`select count(*)::text from public.agreements`))[0][0][0] === '1');

    // ---------- equipment from a dead-out ----------
    await go(A, `/hive/${hive2.id}`);
    await A.getByLabel('Edit hive').click();
    await A.waitForSelector('text=Edit hive');
    await A.getByRole('button', { name: 'Dead out' }).click();
    await A.getByRole('button', { name: 'Small hive beetle' }).click();
    await A.getByRole('button', { name: 'Save hive' }).click();
    await A.waitForSelector('text=Log the empty boxes');
    await A.getByRole('link', { name: /Log the empty boxes/ }).click();
    await A.waitForSelector('input[value="Boxes from Hive 2"]');
    await A.getByRole('button', { name: 'Save' }).click();
    await A.waitForSelector('text=In quarantine');
    await A.getByRole('button', { name: /Log cleaning/ }).click();
    await A.locator('.sheet').getByRole('button', { name: 'Scorched' }).click();
    await A.locator('.sheet').getByRole('button', { name: 'Save' }).click();
    await A.waitForSelector('text=Cleaning history');
    const eq = (await idb(A, 'equipment'))[0];
    ok('cleaned kit goes back to the store', eq.status === 'stored' && eq.history.length === 1, eq.status);
    await shot(A, '08-equipment');

    // ---------- loss survey ----------
    await go(A, '/survey');
    await A.waitForSelector('text=Help South African bee research');
    const lost = await A.getByLabel('Lost or absconded').inputValue();
    ok('survey counts the lost colony', lost === '1', lost);
    await shot(A, '09-survey');
    await A.getByLabel('I agree to send these anonymous answers').check();
    await A.getByRole('button', { name: 'Send anonymously' }).click();
    await A.waitForSelector('text=Thank you');
    const ans = (await sql(`select season, colonies_lost::text, causes::text from public.loss_survey`))[0];
    ok('anonymous answer stored without any user id', ans.length === 1 && ans[0][1] === '1' && /small_hive_beetle/.test(ans[0][2]), JSON.stringify(ans));
    const logs = await (await fetch(`${API}/__log`)).json();
    ok('survey was sent without the sign-in token', logs.some((l) => l.startsWith('POST /rest/v1/rpc/submit_loss_survey') && l.endsWith('anon')));

    // ---------- season replay ----------
    await go(A, '/replay');
    await A.waitForSelector('.replay-tile');
    await shot(A, '10-replay');
    const [dl] = await Promise.all([A.waitForEvent('download'), A.getByRole('button', { name: /Save the picture/ }).click()]);
    const file = path.join(SHOTS, 'replay-card.png');
    await dl.saveAs(file);
    const head = fs.readFileSync(file).subarray(0, 8).toString('hex');
    ok('replay card downloads as a PNG', head === '89504e470d0a1a0a', head);

    // ---------- sign-out removes others' records ----------
    ok('no page errors', [A, B, C].every((p) => !p.errors.length), [A, B, C].flatMap((p) => p.errors).join(' | ').slice(0, 400));
  } catch (e) {
    results.push(`FAIL exception: ${e.message.split('\n')[0]}`);
    for (const [n, p] of [['A', A], ['B', B], ['C', C]]) await p.screenshot({ path: path.join(SHOTS, `zz-fail-${n}.png`) }).catch(() => {});
    console.log(e.stack);
  } finally {
    console.log(results.join('\n'));
    console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
    await browser.close();
  }
})();
