# Releasing Honeyguide on Google Play

Play Console account: **Jaco Prinsloo** (personal). Package name: **`com.prinsloo.honeyguide`** (Play confirmed it is available).

## 1. Go live on the web (once)

1. Import `PrinslooJ1/honeyguide` at vercel.com/new. The build settings are already in `vercel.json`. Note the address, for example `honeyguide.vercel.app`.
2. In the Supabase SQL Editor, run `supabase/migrations/001_init.sql`, then `002_apiary_groups.sql`, then `003_forage.sql`, then `004_field_records.sql`.
3. In Supabase › Authentication › URL Configuration, set **Site URL** to the Vercel address and add the same address under **Redirect URLs**.
4. The public contact email is jacoprinsloo.me@gmail.com (already in the privacy and deletion pages).

## 2. Build the Android App Bundle

1. Open pwabuilder.com, enter the Vercel address and choose **Package for stores › Android**.
2. Use these settings. The same values are in `android/twa-manifest.json`.

| Setting | Value |
| --- | --- |
| Package ID | `com.prinsloo.honeyguide` |
| App name / launcher name | `Honeyguide: Beekeeping SA` / `Honeyguide` |
| Version / version code | `0.1.0` / `1` |
| Display / orientation | standalone / portrait |
| Theme, navigation and background colour | `#1C1A17` |
| Location delegation | **On** |
| Notifications, Play Billing | Off |
| Signing key | Let PWABuilder create a **new** key. Keep the key file and passwords somewhere safe and private, because you need them for every future update. |

3. Download the zip. It contains the `.aab`, the signing key and an `assetlinks.json`.
4. **Check the target API.** Open the zip's `app/build.gradle` (or the README) and confirm `targetSdkVersion` is **36**, which Play has required since 31 August 2026. If it is lower, update PWABuilder or rebuild with Bubblewrap.

## 3. Link the site and the app (hides the browser bar)

1. Upload the `.aab` (step 4 below) once. Then, in Play Console › Setup › App signing, copy the **SHA-256 certificate fingerprint** of the *app signing key*.
2. Create `public/.well-known/assetlinks.json` from `android/assetlinks.template.json`, pasting that fingerprint. If PWABuilder's upload-key fingerprint is also listed, add it as a second entry.
3. Push to GitHub. Vercel redeploys. Check that `https://<host>/.well-known/assetlinks.json` loads.

## 4. Play Console

1. **Create app:** Honeyguide: Beekeeping SA · English (United Kingdom) · App · Free. Tick both declarations.
2. **App content:** fill in privacy policy URL, app access, ads, content rating, target audience, data safety and account deletion from `store/listing.md`.
3. **Store listing:** copy the text and graphics from `store/listing.md`.
4. **Testing › Closed testing:** create a track, add at least 20 testers by Google account email, upload the `.aab`, write the release notes and roll out. At least **12 testers must stay opted in for 14 days in a row**.
5. Keep shipping fixes to the same closed track during the 14 days.
6. **Apply for production** when Play allows it. Then use a staged rollout: 10% → 50% → 100%.

## 5. Before production: content review

Every lesson, plant card and colony-advice rule in the app is marked as a draft awaiting review. Have these checked before production:
- an experienced South African beekeeper, or an ARC or SABIO contact: lessons, forage, engine rules, bee zone boundaries
- a first-aid professional: the Safety page and the emergency numbers
- a POPIA-literate adviser: the privacy policy, and whether you must register an Information Officer
