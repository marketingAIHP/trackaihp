# AIHP CrewTrack EAS Deployment

This app is configured for:

- `APK` output only for Android release builds
- manual employee installation
- `EAS Update` for JS/TS OTA fixes
- `production` and `staging` update channels
- optional native force-update gating from Supabase
- remote build-number management through EAS

## Build Profiles

- `internal`
  - employee-facing production APK
  - Android `buildType: apk`
  - EAS Update channel: `production`
- `production`
  - alias of `internal`
  - keeps older commands working
- `staging`
  - tester APK
  - Android `buildType: apk`
  - EAS Update channel: `staging`
  - separate native package id so it can coexist with production

## Commands

Build employee APK:

```bash
npm run build:android:internal
```

Build staging APK:

```bash
npm run build:android:staging
```

Backward-compatible production APK command:

```bash
npm run build:android:production
```

Publish OTA update to employees:

```bash
npm run update:production -- --message "Fix attendance flow"
```

Publish OTA update to testers:

```bash
npm run update:staging -- --message "Test new GPS behavior"
```

## Version Strategy

- `version` in `package.json` is the native runtime contract
- `runtimeVersion` uses `policy: appVersion`
- `cli.appVersionSource` uses `remote`
- `autoIncrement: true` increments Android `versionCode` and iOS `buildNumber` remotely on each build
- JS-only releases:
  - do not change `version`
  - publish with `eas update`
- native changes:
  - bump `version` in `package.json`
  - build a new APK
  - redistribute APK manually

Examples of native changes that require a new APK:

- Expo SDK upgrade
- new native library
- permissions changes
- plugin changes
- package id changes

Recommended when enabling remote build numbers for the first time:

```bash
eas build:version:set
```

Examples of OTA-safe changes:

- attendance logic
- Supabase queries
- screen/UI fixes
- validation changes
- location hook/service logic

## Environment Setup

Create EAS environments with the same public variables already used by the app:

- `production`
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- `preview`
  - same keys, pointing at staging/test services if needed

`APP_VARIANT` is set by `eas.json` per build profile.

## Force Update Policy

Supabase migration creates `public.app_deployment_policies`.

Recommended admin workflow:

1. Upload the latest APK to Google Drive or another direct-download URL.
2. Update the `download_url`.
3. Set `minimum_supported_version` when older native builds must be blocked.
4. Optionally set `force_native_update = true` to hard-block all builds below `recommended_version`.

Example SQL:

```sql
update public.app_deployment_policies
set
  minimum_supported_version = '1.1.0',
  recommended_version = '1.1.0',
  force_native_update = true,
  download_url = 'https://your-company-link/latest.apk',
  update_message = 'Install the latest APK to continue using CrewTrack.'
where app_id = 'aihp-crewtrack'
  and channel = 'production'
  and platform = 'android';
```

## Distribution

For employees:

1. Run the `internal` build.
2. Download the generated `.apk`.
3. Share the APK directly through:
   - WhatsApp document/file share
   - Google Drive
   - company intranet/download page
4. Employees install once manually.
5. Future JS fixes ship through OTA.

For testers:

1. Build `staging`.
2. Share the staging APK only with test devices.
3. Publish test OTA updates to the `staging` channel.

## Safe Rollout

Recommended flow:

1. Publish to `staging`
2. Verify on test devices
3. Publish the same fix to `production`

## Rollback

If an OTA update is bad:

1. Stop publishing new production updates.
2. Republish the last known good update to the `production` channel.
3. If the issue is native, build and redistribute a new APK instead of using OTA.

## Notes

- `Expo Go` is not a reliable indicator for production update behavior.
- Test OTA flows on a real `internal` or `staging` APK.
- Production APKs now come from `internal`/`production` build profiles, not an AAB profile.
