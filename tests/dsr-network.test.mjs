import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSubjectRequestBody,
  isSubjectRequest,
  install,
} from "../scripts/dsr-network.mjs";

test("buildSubjectRequestBody maps aliases and keeps unknown types", () => {
  const body = buildSubjectRequestBody(
    {
      type: "access",
      email: "qa@example.invalid",
      empty: "",
      request_type: "ignored-when-type-set",
    },
    {
      flowId: "flow",
      environmentId: "env",
      configId: "cfg",
      regulation: { regulationConfigId: "reg" },
    },
  );
  assert.deepEqual(body, {
    flow_id: "flow",
    environment_id: "env",
    config_id: "cfg",
    regulation_config_id: "reg",
    type: "access_data",
    identifiers: [{ field_id: "email", value: "qa@example.invalid" }],
  });
  assert.equal(
    buildSubjectRequestBody({ type: "withdraw_consent" }, {}).type,
    "withdraw_consent",
  );
});

test("isSubjectRequest matches both submit paths", () => {
  assert.equal(
    isSubjectRequest("https://api.privacy-center.org/dsr/requests?key=1"),
    true,
  );
  assert.equal(
    isSubjectRequest(
      "https://api.staging.privacy-center.org/subject-requests/requests",
    ),
    true,
  );
  assert.equal(
    isSubjectRequest("https://sdk.privacy-center.org/dsr/key/loader.js"),
    false,
  );
});

test("install dry-runs matching POSTs and does not call the original fetch", async () => {
  let forwarded = 0;
  const target = {
    async fetch() {
      forwarded += 1;
      return { ok: false };
    },
  };
  const api = install(target);
  const response = await target.fetch(
    "https://api.staging.privacy-center.org/dsr/requests?key=1",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "access_data" }),
    },
  );
  assert.equal(forwarded, 0);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { dryRun: true });
  const [entry] = api.getLog();
  assert.equal(entry.status, "dry-run");
  assert.equal(entry.method, "POST");
  assert.deepEqual(entry.body, { type: "access_data" });
});

test("unrelated fetch is forwarded", async () => {
  const target = {
    async fetch(url) {
      return { ok: true, url };
    },
  };
  install(target);
  const response = await target.fetch("https://example.test/other");
  assert.equal(response.url, "https://example.test/other");
});

test("clearLog empties entries", async () => {
  const target = { async fetch() {} };
  const api = install(target);
  await target.fetch("https://api.example.test/dsr/requests", {
    method: "POST",
    body: "{}",
  });
  assert.equal(api.getLog().length, 1);
  api.clearLog();
  assert.deepEqual(api.getLog(), []);
});
