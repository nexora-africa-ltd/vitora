# Maestro E2E Specs

This folder contains the five critical Phase 7 mobile paths as Maestro scenarios.

Run all specs with:

```bash
npm run test:e2e:maestro
```

Run a single flow with:

```bash
maestro test e2e/maestro/login-dashboard.yaml
```

These scenarios assume a dev client or simulator is already booted with the Vitora mobile app installed and pointed at a reachable backend.
