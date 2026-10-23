# DSR Flows sandbox

Sandbox for QA, technical support, and developers to test, share, and troubleshoot Didomi DSR (Data Subject Request) flows.

Open the page locally with `npm start` or on a static host. Enter a public API key and a published Subject Request Flow ID, choose staging or production, then **Apply and reload**.

Mock mode (`mock=1`) loads a bundled mocked DidomiDSR and fixture config. Use it when the live `/dsr` loader is unreachable. The mock is labelled in the UI and is not the live SDK.

Submits are **dry-run only** in staging and production. Nothing is POSTed. The payload that would be sent is shown in the submission network log.

## How to use

1. Open the page with query parameters (for example `?apiKey=…&flow_id=…&mock=1`).
2. Change inputs or custom JSON, then click **Apply and reload**.
3. The URL updates automatically — copy and share it.

## Query parameters

| Parameter          | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `apiKey`           | Public API key (UUID)                                                           |
| `flow_id`          | Published Subject Request Flow ID. Incoming `target` is accepted and normalized |
| `environment`      | `staging` (default) or `production`. Selects Flow publication and CDN/API hosts |
| `platform`         | `web` (default)                                                                 |
| `country`          | Two-letter country code                                                         |
| `region`           | Region code; requires `country`                                                 |
| `regulation`       | Regulation override, for example `gdpr`                                         |
| `configs_base_url` | Optional origin for `loader.js` and `didomi_config.json`                        |
| `api_base_url`     | Optional origin for the dry-run submit URL                                      |
| `mock`             | `1` loads the bundled mocked DidomiDSR                                          |
| `widget_id`        | Widget used by Show widget                                                      |
| `layer_name`       | Layer used by Show widget                                                       |
| `config`           | Base64 UTF-8 JSON for `window.didomiConfig`                                     |
| `apply_conf`       | `1` applies `config` on load                                                    |

Example:

```
index.html?apiKey=00000000-0000-4000-8000-000000000001&flow_id=flow-fixture&mock=1
```

Production hosts: `https://sdk.privacy-center.org/` and `https://api.privacy-center.org/`. Staging hosts: `https://sdk.staging.privacy-center.org/` and `https://api.staging.privacy-center.org/`. Production configs are allowlisted; a 403 or 404 there usually means the org is not on that list.

## Repository layout

- `index.html`: sandbox page and styles.
- `scripts/dsr.js`: page setup, loader or mock startup, and widget controls.
- `scripts/dsr-*.mjs`: state, configuration viewer, diagnostics, and dry-run network log.
- `scripts/dsr-mock.js`: bundled mocked DidomiDSR.
- `fixtures/dsr-config.json`: fixture config for mock mode and tests.
- `docs/dsr.md`: usage and what is not live yet.
- `tests/`: unit and browser checks using the mock.

## Development

```sh
npm ci
npx playwright install chromium
npm start
# Open http://127.0.0.1:4173/
# In another terminal:
npm test
npm run prettier:check
```

This repository does not configure GitHub Pages. A maintainer can enable Pages separately (deploy from branch `main`, site root).
