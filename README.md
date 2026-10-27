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

## Phase 3: forage and colony growth

- **Region suggestions on the phone** (`src/region.ts`): province (nearest of about 90 reference towns), rainfall zone and bee zone (Cape, hybrid, African). Shown as *Suggested*, with a button to use it. No coordinates leave the phone.
- **Forage library** (`src/content/forage.ts`): 14 plant cards with flowering windows reported by beekeepers (SANBI survey), the province windows for saligna gum, how bees use each flower, flags for bird-pollinated and invasive plants, and sources.
- **Apiary forage**: tag the plants near an apiary to get a 12-month calendar and an 8-week outlook (flow, steady, dearth or pollen gap).
- **Bloom Watch**: log "in bloom near me" against an apiary, never against a GPS point. The regional map (`regional_blooms`, migration 003) shows only anonymous counts, with at least 3 sightings.
- **Colony engine** (`src/engine.ts`): strength score, health trend, growth stage, risk flags (capensis, AFB, beetle, chalkbrood, disturbance, low stores before a dearth, absconded) and one next-best action. All rules are drafts awaiting expert review.
- **Safety centre**: 10177, 112 and 10111, a "read out my position" button (not saved), pre-inspection and hive-moving checklists, fire and hygiene guidance. It gives no chemical doses.

## Phase 4: Academy and game layer

- **Honeyguide Academy** (`src/content/lessons.ts`): 12 lessons, each with a 3-question quiz, an in-app task and sources. Registration facts are checked against GN R.858: registration lasts 24 months, and every hive is marked with the registration number.
- **Ranks**: Fledgling, Forager, Builder, Keeper, Honeyguide. XP counts at most one inspection per hive per week, with a bonus for calm weather. There are no streaks: a weekly logbook rhythm shows 8 dots.
- **Quests**: First Steps, Registration Hero, plus a seasonal quest (Spring Build-up, Summer Flow, Autumn Stores Check, Aloe Season).
- **Labs**: Waggle Dance Lab (drag the flowers and move the sun; about 1 s of waggling per km), Flower Match, and Hive Doctor (6 cases).

## Phase 5: Google Play readiness

- `public/privacy.html`: a POPIA-aware privacy policy matching what the app does (hosted in Frankfurt; Open-Meteo gets only a point rounded to about 1 km; no ads or trackers).
- `public/delete-account.html`: a working web page that deletes the account and its cloud data, which Play requires alongside the in-app option.
- `android/twa-manifest.json`: the settings for PWABuilder or Bubblewrap (`com.prinsloo.honeyguide`, location delegation on). `android/assetlinks.template.json` is the template for the site-and-app link.
- `store/listing.md`: title, descriptions, data safety answers, content rating, target audience and the tester invite.
- `store/feature-graphic.png` (1024 × 500) and `public/store/screen-1..6.png` (1080 × 1920).
- `docs/PLAY_RELEASE.md`: the release checklist, step by step.
- Google Fonts is removed: the app makes no third-party requests except the optional weather.

## Release 1.1: field records

- **Swarm traps**: bait boxes with a private pin or note, lure, check interval, "due a check" on Home, and a catch log. "Moved into a hive" creates the new hive, with the trap and lure recorded.
- **Colony autopsy**: when a hive is marked dead or absconded, record the likely cause from the national loss-survey list, plus theft, fire and drought.
- **Weight and lift log**: weekly kg from a scale, or a light/medium/heavy lift test. The trend reads gaining (flow) or losing (dearth or robbing). Migration 004.

## Run it

```bash
npm install
npm run build      # outputs dist/
npm run dev        # http://localhost:5173 (no service worker on localhost)
```

Build-time overrides: `SUPABASE_URL` and `SUPABASE_KEY` (publishable key). The defaults point at the `honeyguide` Supabase project.

## Database

Apply `supabase/migrations/001_init.sql`, `002_apiary_groups.sql` and `003_forage.sql` in order. 001 creates:
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
