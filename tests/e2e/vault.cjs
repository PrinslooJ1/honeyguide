// The Vault, end to end: one beekeeper, two phones, against the local Supabase stand-in.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:8084/';
const API = process.env.API_URL || 'http://127.0.0.1:54321';
const SHOTS = path.join(__dirname, '..', '.out', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PASS = 'aloe kettle rooibos';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); if (!cond) console.log('FAIL', name, extra); };
const sql = async (q) => (await (await fetch(`${API}/__sql`, { method: 'POST', body: q })).json());
const one = async (q) => (await sql(q))[0][0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function phone(browser, name) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: { latitude: -33.934123, longitude: 18.860456 }, permissions: ['geolocation'],
  });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('hg:settings')) localStorage.setItem('hg:settings', JSON.stringify({ theme: 'light', locationMode: 'precise', onboarded: true, weather: false }));
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) page.errors.push(`${name} console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  await page.goto(APP);
  return page;
}
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(250); };
async function account(page, email, create) {
  await go(page, '/more');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('test-pass-123');
  await page.getByRole('button', { name: create ? 'Create account' : 'Sign in', exact: true }).click();
  await page.waitForSelector('text=Sync now', { timeout: 10000 });
}
async function syncNow(page) {
  await go(page, '/more');
  await page.getByRole('button', { name: /Sync now/ }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Syncing…'), null, { timeout: 20000 });
  await sleep(400);
}
async function idb(page, store) {
  return page.evaluate((s) => new Promise((resolve, reject) => {
    const r = indexedDB.open('honeyguide');
    r.onsuccess = () => { const q = r.result.transaction(s, 'readonly').objectStore(s).getAll(); q.onsuccess = () => { resolve(q.result); r.result.close(); }; q.onerror = () => reject(q.error); };
  }), store);
}

(async () => {
  const browser = await chromium.launch();
  const A1 = await phone(browser, 'phone 1');
  const A2 = await phone(browser, 'phone 2');
  try {
    await account(A1, 'vault@example.co.za', true);
    // profile with invoice details
    await go(A1, '/more');
    await A1.getByLabel('Name', { exact: true }).fill('Lucille');
    await A1.getByLabel(/^Invoice details/).fill('Lucille Bees, Stellenbosch. FNB 62xxxxxx');
    await A1.getByRole('button', { name: 'Save profile' }).click();
    // apiary with an exact pin
    await go(A1, '/apiary/new');
    await A1.getByLabel('Name').fill('Citrus block');
    await A1.getByRole('button', { name: /Exact pin/ }).click();
    await A1.waitForSelector('text=Exact location saved');
    await A1.getByRole('button', { name: 'Save apiary' }).click();
    await A1.waitForSelector('text=No hives here yet');
    // contract, job, landowner
    await go(A1, '/contract/new');
    await A1.getByLabel('Grower').fill('Van der Merwe Citrus');
    await A1.getByLabel(/^Crop/).fill('Citrus');
    await A1.getByLabel(/Fee per hive/).fill('450');
    await A1.getByRole('button', { name: /Save/ }).first().click();
    await sleep(500);
    await go(A1, '/job/new');
    await A1.getByLabel(/Client/).first().fill('Mrs Dlamini');
    await A1.getByLabel(/^Phone/).fill('082 555 0199');
    await A1.getByLabel(/^Fee/).fill('600');
    await A1.getByRole('button', { name: /Save/ }).first().click();
    await sleep(500);
    await go(A1, '/agreement/new');
    await A1.getByLabel('Landowner').fill('Oom Piet');
    await A1.getByLabel('Phone').fill('083 555 0101');
    await A1.getByRole('button', { name: 'Save' }).click();
    await sleep(500);
    await syncNow(A1);
    ok('before the Vault the server holds readable details', (await one(`select grower from public.contracts`))[0] === 'Van der Merwe Citrus');

    // ---------- turn the Vault on ----------
    await go(A1, '/vault');
    await A1.getByRole('button', { name: /Turn on the Vault/ }).click();
    await A1.getByLabel('Passphrase', { exact: true }).fill(PASS);
    await A1.getByLabel('Same passphrase again').fill(PASS);
    await A1.getByLabel(/I have written it down/).check();
    await A1.getByRole('button', { name: 'Turn it on' }).click();
    await A1.waitForSelector('text=The Vault is on', { timeout: 15000 });
    await A1.screenshot({ path: path.join(SHOTS, '11-vault-on.png'), fullPage: true });
    await syncNow(A1);
    const c = await one(`select grower, fee_per_hive::text, left(enc, 3) from public.contracts`);
    ok('contract grower and fee are encrypted on the server', c[0] === '🔒' && c[1] === '0.00' && c[2] === 'v1.', JSON.stringify(c));
    const j = await one(`select client_name, client_phone, fee::text, left(enc, 3) from public.jobs`);
    ok('callout client and fee are encrypted', j[0] === '🔒' && j[1] === null && j[2] === null && j[3] === 'v1.', JSON.stringify(j));
    const ag = await one(`select landowner, phone, left(enc, 3) from public.agreements`);
    ok('landowner details are encrypted', ag[0] === '🔒' && ag[1] === null && ag[2] === 'v1.', JSON.stringify(ag));
    const loc = await one(`select lat::text, lng::text, left(enc, 3) from public.apiary_locations`);
    ok('exact pin is encrypted', loc[0] === null && loc[1] === null && loc[2] === 'v1.', JSON.stringify(loc));
    const prof = await one(`select invoice_details, left(enc, 3), vault ? 'wrapped' from public.profiles`);
    ok('invoice details encrypted and the wrapped key stored', prof[0] === null && prof[1] === 'v1.' && prof[2] === 't', JSON.stringify(prof));
    const apRow = await one(`select lat::text from public.apiaries`);
    ok('shared apiary row still has only the rounded point', apRow[0] === '-33.93');
    ok('this phone still reads everything', (await idb(A1, 'contracts'))[0].grower === 'Van der Merwe Citrus' && (await idb(A1, 'apiaries'))[0].lat === -33.93412);
    const dump = JSON.stringify(await sql(`select * from public.contracts; select * from public.jobs; select * from public.agreements; select * from public.profiles; select * from public.apiary_locations`));
    ok('no secret appears anywhere on the server', !/Van der Merwe|Dlamini|082 555|083 555|Oom Piet|FNB|33\.93412/.test(dump));

    // ---------- a second phone ----------
    await account(A2, 'vault@example.co.za', false);
    await sleep(600);
    await syncNow(A2);
    ok('second phone gets the contract locked', (await idb(A2, 'contracts'))[0]._locked === true && (await idb(A2, 'contracts'))[0].grower === '🔒');
    await go(A2, '/business');
    await A2.waitForSelector('text=Your Vault is locked on this phone');
    // a record made here while locked does not go up readable
    await go(A2, '/contract/new');
    await A2.getByLabel('Grower').fill('Secret grower');
    await A2.getByLabel(/^Crop/).fill('Avocado');
    await A2.getByRole('button', { name: /Save/ }).first().click();
    await sleep(500);
    await syncNow(A2);
    ok('while locked, covered records wait on the phone', (await one(`select count(*)::text from public.contracts`))[0] === '1');
    await go(A2, '/vault');
    await A2.getByLabel('Vault passphrase').fill('wrong passphrase!!');
    await A2.getByRole('button', { name: 'Open the Vault' }).click();
    await A2.waitForSelector('text=That passphrase is not right.', { timeout: 15000 });
    ok('a wrong passphrase is refused', true);
    await A2.getByLabel('Vault passphrase').fill(PASS);
    await A2.getByRole('button', { name: 'Open the Vault' }).click();
    await A2.waitForSelector('text=The Vault is on', { timeout: 15000 });
    await sleep(800);
    await syncNow(A2);
    const c2 = (await idb(A2, 'contracts')).find((x) => x.crop === 'Citrus');
    ok('after unlocking the second phone reads the contract', c2 && c2.grower === 'Van der Merwe Citrus' && !c2._locked && Number(c2.fee_per_hive) === 450, JSON.stringify(c2 && { g: c2.grower, f: c2.fee_per_hive }));
    ok('and the exact pin', (await idb(A2, 'apiaries'))[0].lat === -33.93412);
    const secretRow = await one(`select grower, left(enc, 3) from public.contracts where crop = 'Avocado'`);
    ok('the record made while locked went up encrypted', secretRow && secretRow[0] === '🔒' && secretRow[1] === 'v1.', JSON.stringify(secretRow));
    await syncNow(A1);
    ok('first phone reads the second phone\'s new contract', (await idb(A1, 'contracts')).some((x) => x.grower === 'Secret grower'));

    // ---------- lock the second phone, then open it again ----------
    await go(A2, '/vault');
    await A2.getByRole('button', { name: /Lock it on this phone/ }).click();
    await A2.waitForSelector('text=Open the Vault', { timeout: 15000 });
    await sleep(600);
    await syncNow(A2);
    const lockedNow = await idb(A2, 'contracts');
    ok('locking hides the details on this phone', lockedNow.every((x) => x._locked && x.grower === '🔒' && x.enc), JSON.stringify(lockedNow.map((x) => [x.grower, !!x.enc])));
    ok('locking hides the exact pin on this phone', (await idb(A2, 'apiaries'))[0].lat === -33.93);
    await go(A2, '/vault');
    await A2.getByLabel('Vault passphrase').fill(PASS);
    await A2.getByRole('button', { name: 'Open the Vault' }).click();
    await A2.waitForSelector('text=The Vault is on', { timeout: 15000 });
    await sleep(600);
    await syncNow(A2);
    ok('opening it again brings them back', (await idb(A2, 'contracts')).every((x) => !x._locked && x.grower !== '🔒') && (await idb(A2, 'apiaries'))[0].lat === -33.93412);
    ok('server pin untouched by the locked phone', (await one(`select left(enc, 3) from public.apiary_locations`))[0] === 'v1.');

    // ---------- change passphrase, then off ----------
    await go(A1, '/vault');
    await A1.getByRole('button', { name: /Change passphrase/ }).click();
    await A1.getByLabel('Current passphrase').fill(PASS);
    await A1.getByLabel('New passphrase', { exact: true }).fill('protea tractor kettle');
    await A1.getByLabel('New passphrase again').fill('protea tractor kettle');
    await A1.getByRole('button', { name: 'Change it' }).click();
    await A1.waitForSelector('text=Passphrase changed', { timeout: 15000 });
    await syncNow(A1);
    await go(A1, '/vault');
    await A1.getByRole('button', { name: /Turn off the Vault/ }).click();
    await A1.getByLabel('Passphrase', { exact: true }).fill(PASS);
    await A1.getByRole('button', { name: 'Turn it off' }).click();
    await A1.waitForSelector('text=That passphrase is not right.', { timeout: 15000 });
    ok('the old passphrase no longer works', true);
    await A1.getByLabel('Passphrase', { exact: true }).fill('protea tractor kettle');
    await A1.getByRole('button', { name: 'Turn it off' }).click();
    await A1.waitForSelector('text=Turn on the Vault', { timeout: 15000 });
    await syncNow(A1);
    const off = await one(`select grower, enc from public.contracts where crop = 'Citrus'`);
    ok('Vault off: details readable on the server again, ciphertext gone', off[0] === 'Van der Merwe Citrus' && off[1] === null, JSON.stringify(off));
    const offLoc = await one(`select lat::text, enc from public.apiary_locations`);
    ok('Vault off: exact pin back in the clear', offLoc[0] === '-33.93412' && offLoc[1] === null, JSON.stringify(offLoc));
    ok('Vault off: wrapped key removed', (await one(`select vault is null from public.profiles`))[0] === 't');
    await syncNow(A2);
    await go(A2, '/vault');
    await A2.waitForSelector('text=Turn on the Vault');
    ok('second phone sees the Vault is off', (await idb(A2, 'contracts')).every((x) => !x._locked && x.grower !== '🔒'));
    ok('no page errors', [A1, A2].every((p) => !p.errors.length), [A1, A2].flatMap((p) => p.errors).join(' | ').slice(0, 400));
  } catch (e) {
    results.push(`FAIL exception: ${e.message.split('\n')[0]}`);
    for (const [n, p] of [['1', A1], ['2', A2]]) await p.screenshot({ path: path.join(SHOTS, `zz-vault-fail-${n}.png`) }).catch(() => {});
    console.log(e.stack);
  } finally {
    console.log(results.join('\n'));
    console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
    await browser.close();
  }
})();
