import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readState,
  shareURL,
  loaderURL,
  configURL,
  requestsURL,
  validate,
  buildConfig,
  widgetOptions,
  embedSnippet,
} from "../scripts/dsr-state.mjs";

const state = (overrides) => ({
  ...readState(new URLSearchParams("apiKey=public-key&flow_id=my-flow")),
  ...overrides,
});

test("loader defaults use staging hosts and always send environment=staging", () => {
  const url = loaderURL(state());
  assert.equal(url.origin, "https://sdk.staging.privacy-center.org");
  assert.equal(url.pathname, "/dsr/public-key/loader.js");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    target: "my-flow",
    environment: "staging",
    platform: "web",
  });
  assert.equal(url.searchParams.has("target_type"), false);
});

test("production environment selects production CDN and API hosts", () => {
  const input = state({ environment: "production" });
  const loader = loaderURL(input);
  assert.equal(loader.origin, "https://sdk.privacy-center.org");
  assert.equal(loader.searchParams.get("environment"), "production");
  assert.equal(
    configURL(input).href,
    "https://sdk.privacy-center.org/dsr/public-key/didomi_config.json?target=my-flow&environment=production&platform=web",
  );
  assert.equal(
    requestsURL(input).href,
    "https://api.privacy-center.org/dsr/requests?key=public-key",
  );
});

test("country, region, regulation and configs_base_url reach the loader", () => {
  const url = loaderURL(
    state({
      country: "US",
      region: "CA",
      regulation: "cpra",
      configs_base_url: "https://configs.example.test",
    }),
  );
  assert.equal(url.origin, "https://configs.example.test");
  assert.equal(url.searchParams.get("country"), "US");
  assert.equal(url.searchParams.get("region"), "CA");
  assert.equal(url.searchParams.get("regulation"), "cpra");
});

test("configURL mirrors the loader path with didomi_config.json", () => {
  const url = configURL(state({ environment: "staging" }));
  assert.equal(url.pathname, "/dsr/public-key/didomi_config.json");
  assert.equal(url.searchParams.get("target"), "my-flow");
});

test("requestsURL uses the environment API host and key", () => {
  assert.equal(
    requestsURL(state()).href,
    "https://api.staging.privacy-center.org/dsr/requests?key=public-key",
  );
  assert.equal(
    requestsURL(state({ api_base_url: "https://api.example.test" })).href,
    "https://api.example.test/dsr/requests?key=public-key",
  );
});

test("share URL round-trips mock, production, Unicode JSON and unknown params", () => {
  const original = state({
    environment: "production",
    mock: "1",
    config: '{"message":"日本語"}',
    apply_conf: "1",
  });
  const url = shareURL(
    original,
    "https://example.com/index.html?unrelated=keep#test",
  );
  assert.deepEqual(readState(url.searchParams), original);
  assert.equal(url.searchParams.get("unrelated"), "keep");
  assert.equal(url.searchParams.get("environment"), "production");
  assert.equal(url.searchParams.has("target"), false);
  assert.equal(url.hash, "#test");
});

test("incoming target normalizes to flow_id", () => {
  const parsed = readState(
    new URLSearchParams("apiKey=key&target=flow-from-loader"),
  );
  assert.equal(parsed.flow_id, "flow-from-loader");
});

test("custom JSON applies only when apply_conf is on; country overlay wins", () => {
  const input = state({
    config: '{"user":{"country":"FR","region":"IDF"},"test":true}',
    apply_conf: "1",
    country: "US",
  });
  const config = buildConfig(input);
  assert.equal(config.user.country, "US");
  assert.equal(config.user.region, undefined);
  assert.equal(config.test, true);
  assert.deepEqual(buildConfig(state({ config: '{"test":true}' })), {});
});

test("invalid inputs block loading", () => {
  for (const overrides of [
    { apiKey: "" },
    { flow_id: "" },
    { environment: "draft" },
    { platform: "ctv" },
    { region: "CA" },
    { country: "USA" },
    { config: "{bad" },
  ])
    assert.throws(() => validate(state(overrides)), JSON.stringify(overrides));
});

test("widget options omit blanks", () => {
  assert.equal(widgetOptions(state()), undefined);
  assert.deepEqual(
    widgetOptions(state({ widget_id: "access-widget", layer_name: "form" })),
    { widgetId: "access-widget", layerName: "form" },
  );
});

test("embed snippet wraps the loader URL", () => {
  const snippet = embedSnippet(state());
  assert.match(snippet, /^<script src="https:\/\//);
  assert.match(snippet, /\/dsr\/public-key\/loader\.js\?/);
});
