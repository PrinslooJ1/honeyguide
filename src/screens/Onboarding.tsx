import { useState } from 'react';
import { LuChevronRight, LuShieldCheck, LuWifiOff, LuHexagon } from 'react-icons/lu';
import * as db from '../db';
import type { Profile } from '../db';
import { PROVINCES } from '../lib';
import { setSettings } from '../settings';
import { Field, Logo, Seg } from '../ui';

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Partial<Profile>>({});
  const [level, setLevel] = useState<string>('new');

  const finish = async () => {
    await db.save<Profile>('profiles', { id: db.uuid(), display_name: p.display_name?.trim(), province: p.province, registration_number: p.registration_number?.trim() });
    setSettings({ onboarded: true });
    location.hash = '/apiary/new';
  };

  return (
    <div className="app">
      <main className="main" style={{ paddingTop: 'calc(28px + env(safe-area-inset-top))', paddingBottom: 32 }}>
        {step === 0 && (
          <div className="stack">
            <Logo size={64} />
            <h1 className="step-title" style={{ fontSize: 34 }}>Beekeeping, guided.</h1>
            <p className="muted" style={{ margin: 0 }}>Honeyguide is a hive log built for South Africa: Cape and African bees, local pests and a winter that brings the aloes.</p>
            <div className="card stack">
              <div className="row"><LuWifiOff /><span className="grow">Works with no signal. Everything saves on your phone first.</span></div>
              <div className="row"><LuShieldCheck /><span className="grow">Private by default. Your records and apiary locations are yours alone.</span></div>
              <div className="row"><LuHexagon /><span className="grow">A one-minute guided inspection, made for gloved hands.</span></div>
            </div>
            <button className="btn" onClick={() => setStep(1)}>Get started <LuChevronRight /></button>
          </div>
        )}
        {step === 1 && (
          <div className="stack">
            <div className="eyebrow">1 of 2</div>
            <h1 className="step-title">About you</h1>
            <Field label="Your name" hint="optional"><input className="input" value={p.display_name || ''} onChange={(e) => setP({ ...p, display_name: e.target.value })} autoFocus /></Field>
            <Field label="Province">
              <select className="input" value={p.province || ''} onChange={(e) => setP({ ...p, province: e.target.value })}>
                <option value="">Choose province</option>
                {PROVINCES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <div className="field"><span>Experience</span>
              <Seg label="Experience" options={[{ value: 'new', label: 'New' }, { value: 'some', label: '1–3 years' }, { value: 'pro', label: 'Experienced' }]} value={level} onChange={setLevel} />
            </div>
            <button className="btn" onClick={() => setStep(2)}>Next <LuChevronRight /></button>
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <div className="eyebrow">2 of 2</div>
            <h1 className="step-title">Registration</h1>
            <p className="muted" style={{ margin: 0 }}>South African beekeepers must register with the Department of Agriculture and mark their hives with the registration number. Add yours if you have it; you can do this later.</p>
            <Field label="Beekeeper registration number" hint="optional"><input className="input" value={p.registration_number || ''} onChange={(e) => setP({ ...p, registration_number: e.target.value })} /></Field>
            {level === 'new' && <div className="banner info"><LuHexagon /><div><b>New to bees?</b><p>Join a local beekeeping club and find a mentor before your first hive. The learning course arrives in a later update.</p></div></div>}
            <button className="btn" onClick={finish}>Add my first apiary <LuChevronRight /></button>
            <button className="btn ghost" onClick={async () => { await finish(); location.hash = '/'; }}>Skip for now</button>
          </div>
        )}
      </main>
    </div>
  );
}
