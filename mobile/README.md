# Vitora Mobile

Expo Router mobile client for Vitora HMIS. This app is being rebuilt by converting the web app's backend contracts, auth flow, and patient workflows to a native experience instead of starting from an unrelated Expo starter.

## Current scope

- JWT authentication against the Django backend
- Runtime backend URL configuration for emulator, simulator, or physical device
- Dashboard shell with live counts
- Patient list, detail, and registration flows
- Encounter list synced from the same `/api/encounters/` endpoint used by the web app

## Setup

1. Install dependencies.

```bash
npm install
```

2. Point the mobile app at the backend.

Option A: set an environment variable before starting Expo.

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:9088 npm start
```

Option B: update the connection URL inside the sign-in or settings screen.

Notes:

- Android emulator default fallback: `http://10.0.2.2:9088`
- iOS simulator and web fallback: `http://127.0.0.1:9088`
- Physical devices need your machine's LAN IP, for example `http://192.168.1.20:9088`

3. Start the app.

```bash
npm start
```

## Quality checks

```bash
npm run lint
npm run typecheck
```

## EAS

`eas build:configure` is already in place. The app slug and project metadata now point at the Vitora mobile client, so you can continue with development builds once the native flows are stable.
