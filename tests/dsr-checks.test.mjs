import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkConfig,
  checkLoad,
  eventSuggestion,
} from "../scripts/dsr-checks.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/dsr-config.json", import.meta.url), "utf8"),
);

test("valid fixture only reports mock-mode and manual-rules", () => {
  const findings = [
    ...checkLoad({ mock: "1" }),
    ...checkConfig(fixture, { mock: "1" }),
  ];
  assert.deepEqual(findings.map((item) => item.id).sort(), [
    "manual-rules",
    "mock-mode",
  ]);
  assert.deepEqual(
    checkConfig(fixture).map((item) => item.id),
    ["manual-rules"],
  );
  assert.deepEqual(checkLoad({}), []);
});

test("UUID, missing flow, and region-without-country", () => {
  assert.ok(
    checkLoad({ apiKey: "not-a-uuid" }).some(
      (item) => item.id === "api-key-format",
    ),
  );
  assert.ok(
    checkLoad({ attemptedLoad: true, flow_id: "" }).some(
      (item) => item.id === "flow-id-missing",
    ),
  );
  assert.ok(
    checkLoad({ region: "CA" }).some(
      (item) => item.id === "region-without-country",
    ),
  );
});

test("production 403/404 suggests the allowlist", () => {
  const finding = checkLoad({
    environment: "production",
    loaderStatus: 403,
  }).find((item) => item.id === "production-allowlist");
  assert.equal(finding.severity, "warning");
  assert.match(finding.suggestion, /allowlisted/);
  assert.ok(
    checkLoad({ environment: "production", loaderStatus: 404 }).some(
      (item) => item.id === "production-allowlist",
    ),
  );
  assert.ok(
    !checkLoad({ environment: "staging", loaderStatus: 404 }).some(
      (item) => item.id === "production-allowlist",
    ),
  );
});

test("staging 404 is route-not-deployed; staging 403 is feature-lock", () => {
  assert.ok(
    checkLoad({ environment: "staging", loaderStatus: 404 }).some(
      (item) => item.id === "route-not-deployed",
    ),
  );
  assert.ok(
    checkLoad({ environment: "staging", loaderStatus: 403 }).some(
      (item) => item.id === "feature-lock",
    ),
  );
});

test("internalError, empty widgets, and missing regulationConfigId", () => {
  assert.ok(
    checkLoad({ internalError: true }).some(
      (item) => item.id === "internal-error",
    ),
  );
  const empty = checkConfig({
    app: { apiKey: "key" },
    regulation: { name: "gdpr", regulationConfigId: "reg" },
    widgets: {},
    rules: [],
  });
  assert.ok(empty.some((item) => item.id === "widgets-empty"));
  assert.ok(
    checkConfig(
      {
        ...fixture,
        regulation: { name: "gdpr" },
      },
      { ready: true },
    ).some((item) => item.id === "regulation-config-id-missing"),
  );
});

test("empty rules warn; default and requested widgets are checked", () => {
  const config = {
    ...fixture,
    rules: [],
    defaultWidgetId: "missing",
  };
  const findings = checkConfig(config, {
    widget_id: "also-missing",
    ready: true,
  });
  assert.ok(findings.some((item) => item.id === "widget-rules-empty"));
  assert.ok(findings.some((item) => item.id === "default-widget"));
  assert.ok(findings.some((item) => item.id === "requested-widget"));
});

test("eventSuggestion distinguishes bundle, network, and script errors", () => {
  assert.match(
    eventSuggestion({
      message: "Didomi - No bundle URL for widget",
      kind: "SDK console",
    }),
    /artifacts\.web/,
  );
  assert.match(
    eventSuggestion({ message: "Blocked", kind: "Resource load" }),
    /404/,
  );
  assert.match(
    eventSuggestion({ message: "Script error.", kind: "Page exception" }),
    /hid details/,
  );
});

test("bad shapes do not throw", () => {
  for (const value of [null, [], "bad", 4, {}])
    assert.doesNotThrow(() => checkConfig(value));
});
