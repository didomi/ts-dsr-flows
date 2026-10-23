# DSR Flows sandbox

For QA, technical support, and developers. Open `index.html` on a static host or run `npm start` locally. Enter a public API key and a published Subject Request Flow ID, choose staging or production, then **Apply and reload**.

Example:

```text
index.html?apiKey=YOUR_PUBLIC_KEY&flow_id=YOUR_FLOW_ID&environment=staging&country=FR&mock=1
```

## Workspace

- **Setup:** Flow details, delivery overrides, optional base URL overrides, and custom JSON. Apply and reload opens the test tab.
- **Test & troubleshoot:** Widget ID, Layer name, Show / Hide widget, Preview submit payload, setup findings, captured messages, and the dry-run network log.
- **Configuration:** tree and plain JSON of the loaded config, generated loader URL, embed snippet, and share link.

Tabs support keyboard arrows, Home, and End. Fragments `#setup`, `#test`, and `#config` open the relevant workspace.

**Mock mode** is labelled in the status line and runtime summary. It is not the live SDK.

## Query parameters

| Parameters                         | Behavior                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apiKey`, `flow_id`                | Required to load. Loader path `/dsr/{apiKey}/loader.js?target={flow_id}`. Also accepts `target`. |
| `environment`                      | `staging` (default) or `production`. Always forwarded to the loader. Selects CDN and API hosts.  |
| `platform`                         | `web` only.                                                                                      |
| `country`, `region`, `regulation`  | Loader geo and regulation overrides. Region requires country.                                    |
| `configs_base_url`, `api_base_url` | Optional host overrides when the public `/dsr` route is not reachable.                           |
| `mock`                             | `1` loads `scripts/dsr-mock.mjs` and `fixtures/dsr-config.json`.                                 |
| `config`, `apply_conf`             | Base64 JSON applied to `window.didomiConfig` only when `apply_conf=1`. Invalid JSON blocks load. |
| `widget_id`, `layer_name`          | Show widget options. Not forwarded to the loader.                                                |

Unknown page parameters are preserved in share links.

Default hosts:

- staging: `https://sdk.staging.privacy-center.org/` and `https://api.staging.privacy-center.org/`
- production: `https://sdk.privacy-center.org/` and `https://api.privacy-center.org/`

## How a DSR flow loads

The page injects:

```text
{CDN}/dsr/{publicApiKey}/loader.js?target={flowId}&environment={staging|production}&platform=web
```

The configs service prepends `window.didomiRemoteConfig` and geo globals, then the base loader injects the DSR/SRM bundle.

On master today the global is `window.DidomiSRM` and widgets mount in `#didomi-srm-host`. This sandbox talks to `DidomiDSR || DidomiSRM`. The mock installs `DidomiDSR` and aliases `DidomiSRM`. Public methods: `getConfig()`, `widgets.show({ widgetId, layerName })`, `widgets.hide()`, `widgets.isVisible({ widgetId })`. There is no ready queue on the live SDK; this page polls for the global.

`GET {CDN}/dsr/{publicApiKey}/didomi_config.json` uses the same query. An unknown key can return HTTP 200 with `internalError: true`.

## What is not live yet

The live parts wait on three open merge requests:

| Waits on                | What it unblocks                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| web/core !3075          | CloudFront routing for `/dsr` on the SDK CDN. Until it lands the live loader returns 404; use **Mock mode** or **Configs base URL**. |
| web/core !3100          | Renames the SDK from `DidomiSRM` to `DidomiDSR` and moves submissions to `/dsr/requests`.                                            |
| privacy-center-api !512 | The public `POST /dsr/requests` route that real submissions go through.                                                              |

- The live SDK name is still `DidomiSRM` on master; `DidomiDSR` is the product name used by the mock.
- This sandbox **never sends** a submit, in staging or production, even after these land. The interceptor also matches the current-master path `/subject-requests/requests`.

## Dry-run network log

`scripts/dsr-network.mjs` wraps `fetch`. Any request to `/dsr/requests` or `/subject-requests/requests` is recorded and resolved locally. The widget form submit and **Preview submit payload** both go through this wrapper.

Body shape (a guess from the open privacy-center-api MR, not a confirmed contract): `flow_id`, `environment_id`, `config_id`, `regulation_config_id`, `type`, `identifiers`, optional `data_subject_message`. Type aliases: access → access_data, deletion → delete_data, portability → data_portability, rectification → correct_data, restriction → restrict_processing, objection → object_to_processing.

## Production allowlist

Production (and preprod) configs only serve allowlisted organizations. A 403 or 404 while **Flow deployment** is production usually means the org is not on that list, or the Flow was not published to production. Staging serves any key once the route exists.

## Troubleshooting scope

Diagnostics use the config returned to this browser and messages from the current page load. They do not inspect Console drafts or publication status. Start in Console: Publishing, DSAR regulations, Privacy Widgets, and a successful publish to the selected environment.

## Development and verification

```sh
npm ci
npx playwright install chromium
npm test
npm run prettier:check
```

Browser tests use `getByRole` and native labels. They load `mock=1` and abort live Didomi hosts.
