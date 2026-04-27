## DRWA ES Harness

This directory contains the reproducible Elasticsearch harness for the DRWA API end-to-end spec.

Canonical entry point:

```bash
npm run test:drwa-es-e2e
```

What it does:

- starts a dedicated single-node Elasticsearch container named `drwa-es-e2e`
- binds it to host port `9201` by default
- waits for health
- runs `src/test/api/drwa.api-spec.ts` with:
  - `DRWA_ES_E2E=1`
  - `DRWA_ES_URL=http://localhost:9201`
- tears the container down automatically unless `DRWA_ES_KEEP_UP=1`

Useful overrides:

```bash
DRWA_ES_PORT=9202 npm run test:drwa-es-e2e
DRWA_ES_KEEP_UP=1 npm run test:drwa-es-e2e
DRWA_ES_BOOT_TIMEOUT_SEC=180 npm run test:drwa-es-e2e
```

This harness is intended to avoid collisions with any developer Elasticsearch already running on `9200`.
