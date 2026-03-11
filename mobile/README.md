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

`eas build:configure` is already in place.

### Build command

```bash
eas build --platform all
```

### Important config link

EAS matches the Expo project using two values in [app.json](/home/thande/dev/vitora/mobile/app.json):

- `expo.slug`
- `expo.extra.eas.projectId`

Those two values must point at the same Expo/EAS project. If they drift, builds fail with an error like:

```text
Project config: Slug for project identified by "extra.eas.projectId" (...) does not match the "slug" field (...)
```

### When the slug changes

If you rename the app slug, do not hand-edit only one side of the linkage. Keep the intended slug in [app.json](/home/thande/dev/vitora/mobile/app.json) and then relink the EAS project:

```bash
npx eas project:init --force
```

That command updates `expo.extra.eas.projectId` to match the current slug and account.

### Current Vitora path

For this repo, the intended mobile identity is:

- `expo.name`: `Vitora Mobile`
- `expo.slug`: `vitora-mobile`

If `eas build` ever complains about `hmis-android` or another old slug, relink with:

```bash
cd /home/thande/dev/vitora/mobile
npx eas project:init --force
eas build --platform all
```

### Optional warning suppression

The Expo Go warning does not block builds. If you want quieter logs in CI or local shells:

```bash
export EAS_BUILD_NO_EXPO_GO_WARNING=true
```
