import { useEffect, useRef, useState } from 'react';
import { LuFlashlight, LuScanLine, LuTriangleAlert } from 'react-icons/lu';
import * as db from '../db';
import type { Hive } from '../db';
import { Empty, Field, Topbar, go, toast } from '../ui';
import { parseJoinCode } from '../share';

/** Pull a hive code out of whatever a label holds: a Honeyguide link or the bare code. */
export function parseHiveCode(text: string): string | null {
  const m = text.toUpperCase().match(/HG-[A-Z2-9]{4}/);
  return m ? m[0] : null;
}

export async function findHiveByCode(code: string) {
  return (await db.all<Hive>('hives')).find((h) => h.code?.toUpperCase() === code.toUpperCase());
}

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

/** Camera scanner. Uses the phone's built-in barcode detector (Chrome on Android); typing the code always works. */
export function Scan({ then }: { then?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>('starting');
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manual, setManual] = useState('');
  const handled = useRef(false);

  const open = async (raw: string) => {
    if (handled.current) return;
    // A group invite QR opens the join screen.
    const join = raw.toUpperCase().includes('/JOIN/') ? parseJoinCode(raw) : null;
    if (join) {
      handled.current = true;
      navigator.vibrate?.(30);
      go(`/join/${join}`, true);
      return;
    }
    const code = parseHiveCode(raw);
    if (!code) return toast('That code is not a Honeyguide hive label');
    const hive = await findHiveByCode(code);
    if (!hive) return toast(`${code} is not one of your hives`);
    handled.current = true;
    navigator.vibrate?.(30);
    go(then === 'inspect' ? `/inspect/${hive.id}` : `/hive/${hive.id}`, true);
  };

  useEffect(() => {
    let timer: number | undefined;
    let alive = true;
    (async () => {
      const Detector = window.BarcodeDetector;
      const formats: string[] = Detector?.getSupportedFormats ? await Detector.getSupportedFormats().catch(() => []) : [];
      if (!Detector || !formats.includes('qr_code') || !navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setTorchAvailable(Boolean((track.getCapabilities?.() as any)?.torch));
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setState('scanning');
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!alive) return;
          try {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) await open(codes[0].rawValue);
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch {
        setState('denied');
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as any] });
      setTorch(!torch);
    } catch {
      toast('The torch is not available on this camera');
    }
  };

  return (
    <>
      <Topbar title="Scan a hive label" backTo={then === 'inspect' ? '/inspect' : '/'} />
      {(state === 'starting' || state === 'scanning') && (
        <div className="scanner">
          <video ref={videoRef} playsInline muted />
          <div className="frame" />
          {torchAvailable && (
            <div className="scan-tools">
              <button className="icon-btn" aria-label={torch ? 'Torch off' : 'Torch on'} onClick={toggleTorch}><LuFlashlight /></button>
            </div>
          )}
        </div>
      )}
      {state === 'unsupported' && (
        <div className="banner info"><LuScanLine /><div><b>Scanning isn't available in this browser</b><p>Point your phone's camera app at the label instead; it opens the hive here. Or type the code from the label below.</p></div></div>
      )}
      {state === 'denied' && (
        <div className="banner warn"><LuTriangleAlert /><div><b>Camera permission is off</b><p>Allow camera access for Honeyguide in your phone settings, or type the code from the label below.</p></div></div>
      )}
      <div className="stack" style={{ marginTop: 16 }}>
        <Field label="Or type the hive code">
          <input className="input" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="HG-7K3F" autoCapitalize="characters" inputMode="text" />
        </Field>
        <button className="btn secondary" disabled={!manual} onClick={() => open(manual.startsWith('HG-') ? manual : `HG-${manual}`)}>Open hive</button>
      </div>
    </>
  );
}

/** Deep link from a printed label: #/h/HG-XXXX */
export function CodeLink({ code }: { code: string }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    findHiveByCode(code).then((h) => (h ? go(`/hive/${h.id}`, true) : setMissing(true)));
  }, [code]);
  if (!missing) return null;
  return (
    <>
      <Topbar title={code} backTo="/" />
      <Empty title="Not one of your hives" text={`The label ${code} doesn't match a hive in your records on this phone. If it belongs to someone else, ask them; hive records are private.`} action={<a className="btn" href="#/">Go home</a>} />
    </>
  );
}
