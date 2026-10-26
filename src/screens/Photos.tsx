import { useRef, useState } from 'react';
import { LuCamera, LuImage } from 'react-icons/lu';
import * as db from '../db';
import type { Photo } from '../db';
import { PHOTO_TAGS, processPhoto } from '../lib';
import { PhotoThumb, PhotoViewer, Pills, toast } from '../ui';

/** Camera and gallery buttons. Photos are shrunk and cleaned of location data before saving. */
export function PhotoAdder({ hiveId, inspectionId, onAdded }: { hiveId: string; inspectionId?: string; onAdded?: (p: Photo) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState('General');
  const [busy, setBusy] = useState(false);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const { blob, width, height } = await processPhoto(f);
        const id = db.uuid();
        await db.putBlob(id, blob);
        const p = await db.save<Photo>('photos', {
          id, hive_id: hiveId, inspection_id: inspectionId || null, tag, width, height, taken_at: new Date().toISOString(), storage_path: null,
        });
        onAdded?.(p);
      }
      toast(files.length > 1 ? `${files.length} photos saved` : 'Photo saved');
    } catch (e) {
      console.error(e);
      toast('That photo could not be read. Try another.');
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = '';
      if (galRef.current) galRef.current.value = '';
    }
  };

  return (
    <div className="stack">
      <Pills label="Photo tag" single options={PHOTO_TAGS.map((t) => ({ value: t, label: t }))} value={[tag]} onChange={(v) => setTag(v[0] || 'General')} />
      <div className="grid-2">
        <button className="btn secondary" disabled={busy} onClick={() => camRef.current?.click()}><LuCamera /> {busy ? 'Saving…' : 'Camera'}</button>
        <button className="btn secondary" disabled={busy} onClick={() => galRef.current?.click()}><LuImage /> Gallery</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => handle(e.target.files)} />
    </div>
  );
}

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<Photo | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="photo-grid">
        {photos.map((p) => <PhotoThumb key={p.id} photo={p} onOpen={() => setOpen(p)} />)}
      </div>
      <PhotoViewer photo={open} onClose={() => setOpen(null)} onDelete={async (p) => {
        if (!window.confirm('Delete this photo?')) return;
        await db.remove('photos', p.id);
        setOpen(null);
        toast('Photo deleted');
      }} />
    </>
  );
}
