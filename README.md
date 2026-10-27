# Honeyguide: Beekeeping SA

*Beekeeping, guided.* An offline-first hive log built for South African beekeepers. This is the **Phase 1 prototype** from the Honeyguide plan.

## What works now

- **Onboarding**: name, home province, experience, beekeeper registration number.
- **Apiaries**: name, province, an optional location pin (approximate, about 1 km, or exact), landowner, permission, forage and access notes.
- **Hives**: type, Cape or African bee, queen year with the international marking colour, status, notes, and a short code (`HG-XXXX`) ready for Phase 2 QR labels. A warning appears if Cape bees are kept in an African-bee province.
- **Guided inspection**: 7 steps sized for gloved hands, each answered with a tap.
  - The steps are colony, queen, brood, stores and space, pests and disease, actions and photos, and review.
  - The review shows a health score from 0 to 100.
  - "Same as last time" fills in the previous answers.
  - A draft is kept if you leave mid-way.
  - Weather comes from the apiary's approximate location.
  - Ticking suspected American foulbrood shows a red banner with the isolate-and-report steps.
- **Photos**: take one with the camera or pick from the gallery, and tag it. Each photo is re-encoded on the phone to a maximum of 1600 px as JPEG, which removes EXIF data, including any GPS tag.
- **Home dashboard**:
  - counts of apiaries, live hives and inspections this month
  - **Needs attention**: AFB, queenless, swarm risk, no stores, overdue
  - recent inspections and a seasonal focus
  - a sting emergency card (10177 / 112)
- **Modes**: Auto, Light, Dark, **Sun** (maximum contrast) and **Night** (red on black).
- **Privacy**:
  - app lock with a 4-digit PIN (PBKDF2-hashed, stays on the device)
  - location settings: Off, Approximate or Precise; there is no background location
  - export everything as JSON, wipe the phone, and delete the account
- **Offline**: a service worker precaches the app, and IndexedDB holds every record. Changes sync when signal returns.
- **Optional cloud backup** (Supabase): email and password, or a magic link. Each user can only reach their own rows (row-level security) and their own photo folder.

## Phase 2 (in progress)

- **QR hive labels and print studio**:
  - stock presets: A4 21-up (63.5 × 38.1 mm), A4 24-up (70 × 37 mm), A4 8-up (99.1 × 67.7 mm), and label printer rolls of 50 × 30 mm and 100 × 50 mm
  - choose which fields show: name, apiary, code, registration number, queen colour, "Scan to log"
  - damage tolerance, which sets QR error correction M, Q or H
  - copies per hive, and skipping used labels on a part sheet
  - a size warning for codes under 20 mm
  - The encoder is in `src/qr.ts`, with no library. It was verified with OpenCV across all ECC levels and up to 1,200 characters, and from printed PDFs.
- **Scanner**: uses the phone's built-in barcode detector (Chrome on Android), with a torch toggle and a typed-code fallback. A label links to `#/h/HG-XXXX`, which opens the hive; from the Inspect tab it opens an inspection.
- **Apiary Groups** (`supabase/migrations/002_apiary_groups.sql`):
  - sharing with roles owner, partner, helper and viewer
  - Cover mode (access that expires)
  - invite codes
  - exact GPS kept in its own table, so members see only the roughly 1 km point unless the owner allows the exact one
  - owner_id can't be changed
  - The rules were tested on a local Postgres. The sharing screens follow once the database is live.

## Run it

```bash
npm install
npm run build      # outputs dist/
npm run dev        # http://localhost:5173 (no service worker on localhost)
```

Build-time overrides: `SUPABASE_URL` and `SUPABASE_KEY` (publishable key). The defaults point at the `honeyguide` Supabase project.

## Database

`supabase/migrations/001_init.sql` creates:
- the tables, with triggers that stamp `updated_at` on the server
- the row-level security policies
- the private `photos` bucket
- `delete_my_account()`

Apply it once: open Supabase Dashboard › SQL Editor, paste the file and click Run.

**Auth settings** (Dashboard › Authentication › URL Configuration): set **Site URL** to the Vercel address and add it under **Redirect URLs**. Confirmation and magic-link emails need this to return to the app.

## Stack and why

This prototype uses React 19 bundled with esbuild, a small IndexedDB layer (`src/db.ts`), and Supabase called over plain `fetch` (`src/sync.ts`), with no SDK. Fewer dependencies mean a small, fast app on low-end Android phones. Moving to Vite, Dexie and supabase-js later is straightforward because the data model already matches.

## Next (from the plan)

- Phase 2: QR labels and print studio, Apiary Groups for sharing with a partner beekeeper.
- Phase 3: forage library and bloom calendar, region suggestions from GPS, colony growth engine.
- Phase 5: Google Play packaging as a Trusted Web Activity (PWABuilder), Digital Asset Links, closed test.

Guidance in the app is general information, not veterinary or legal advice.
