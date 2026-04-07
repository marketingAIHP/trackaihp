# AIHP CrewTrack - Expo Android + Web PWA

AIHP CrewTrack now supports the existing Android app and a browser-installable web PWA from the same Expo codebase. Shared business logic stays in common services, while platform-specific behavior is isolated with `.native` and `.web` implementations for location, report downloads, runtime bootstrapping, and map picking.

## Cross-Platform Architecture

- Android keeps the current React Native attendance flow and device file handling.
- Web runs through `react-native-web` as a PWA with `manifest.json`, a service worker, and Add to Home Screen support.
- Shared logic stays in `src/services/api.ts`, form validation, and shared report builders.
- Platform-specific behavior lives in:
  - `src/services/locationAdapter.native.ts`
  - `src/services/locationAdapter.web.ts`
  - `src/services/reportDownloader.native.ts`
  - `src/services/reportDownloader.web.ts`
  - `src/services/registerPlatformRuntime.native.ts`
  - `src/services/registerPlatformRuntime.web.ts`

## Updated Folder Structure

```text
src/
├── App.tsx
├── navigation/
│   └── linking.ts
├── screens/
│   ├── admin/
│   ├── auth/
│   └── employee/
├── components/
│   └── maps/
│       ├── InteractiveMapPicker.tsx
│       └── InteractiveMapPicker.web.tsx
├── hooks/
│   └── useLocation.ts
├── services/
│   ├── api.ts
│   ├── locationAdapter.native.ts
│   ├── locationAdapter.web.ts
│   ├── reportDownloader.native.ts
│   ├── reportDownloader.web.ts
│   ├── registerPlatformRuntime.native.ts
│   ├── registerPlatformRuntime.web.ts
│   └── reports/
│       └── exportBuilders.ts
└── utils/

public/
├── manifest.json
├── sw.js
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Development

```bash
npm install
npm start
```

- `npm run android` runs the Android app locally.
- `npm run web` starts the browser/PWA build locally.
- `npm run export:web` exports the static web bundle into `dist`.
- `npm run type-check` runs TypeScript validation.

## Android Local Run

```bash
npm install
npm run android
```

If you prefer the Metro workflow, run `npm start` and press `a` to open Android in the emulator or dev client.

## Web PWA Local Run

```bash
npm install
npm run web
```

Use an HTTPS origin for real geolocation. On iPhone or iPad, open the site in Safari and use `Share -> Add to Home Screen`.

## Deploying The PWA To Vercel

1. Add the Expo and Supabase environment variables in Vercel.
2. Set the build command to `npm run export:web`.
3. Set the output directory to `dist`.
4. Deploy on HTTPS so geolocation and install prompts stay available.
5. After deploy, test service worker caching, login, history, check-in, and report downloads from a mobile browser.

## PWA Notes

- `public/manifest.json` controls install metadata and standalone display.
- `public/sw.js` provides basic app-shell caching and offline fallback for previously visited assets.
- `src/services/registerPlatformRuntime.web.ts` registers the service worker on web only.

## License

Proprietary - AIHP CrewTrack
