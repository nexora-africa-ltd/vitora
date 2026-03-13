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

## Offline storage hardening

- The offline clinical cache now persists in encrypted MMKV storage instead of plain AsyncStorage.
- The encryption key is generated per install and stored in SecureStore.
- Existing offline cache data migrates automatically from the legacy AsyncStorage key on first access.

## EAS

`eas build:configure` is already in place.

### Build command

```bash
eas build --platform all
```

### Preview and production API pinning

`eas.json` now carries concrete `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_API_PIN_*` values for the `preview` and `production` profiles.

- `preview` targets `https://vitora-api.onrender.com`
- `production` targets `https://vitora-prod.onrender.com`

Certificate pinning is only active in native builds. Expo Go and local web/dev sessions intentionally skip it.
The pin set currently matches the live Render certificate chain served by both `vitora-api.onrender.com` and `vitora-prod.onrender.com`.

To validate a native build profile locally or in CI:

```bash
cd /home/thande/dev/vitora/mobile
npx expo prebuild --platform android --no-install
eas build --platform android --profile preview
eas build --platform android --profile production
```

Local Android EAS builds require Java 17. In this workspace the preview and production builds both resolved the configured `EXPO_PUBLIC_API_PIN_*` values successfully, then stopped at Gradle because `JAVA_HOME` still points to Java 11.

If the production API host changes, regenerate the pin values before shipping:

```bash
echo | openssl s_client -showcerts -servername vitora-prod.onrender.com -connect vitora-prod.onrender.com:443 2>/dev/null \
	| awk 'BEGIN{c=0} /BEGIN CERTIFICATE/{c++} {print > ("/tmp/vitora-pin-" c ".pem")}'

for f in /tmp/vitora-pin-*.pem; do
	if grep -q 'BEGIN CERTIFICATE' "$f"; then
		printf '%s ' "$f"
		openssl x509 -in "$f" -pubkey -noout \
			| openssl pkey -pubin -outform DER \
			| openssl dgst -sha256 -binary \
			| openssl enc -base64
	fi
done
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
- `expo.slug`: `mobile`

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
