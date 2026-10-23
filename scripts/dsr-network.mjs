const REQUEST_TYPE_TO_API = {
  access: "access_data",
  deletion: "delete_data",
  portability: "data_portability",
  rectification: "correct_data",
  restriction: "restrict_processing",
  objection: "object_to_processing",
};

const RESERVED_FORM_KEYS = new Set([
  "type",
  "request_type",
  "data_subject_message",
  "message",
]);

function firstString(data, keys) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

export function buildSubjectRequestBody(formData, config) {
  const data = formData && typeof formData === "object" ? formData : {};
  const identifiers = Object.entries(data)
    .filter(
      ([key, value]) =>
        !RESERVED_FORM_KEYS.has(key) &&
        typeof value === "string" &&
        value !== "",
    )
    .map(([field_id, value]) => ({ field_id, value }));
  const type = firstString(data, ["type", "request_type"]);
  const body = {
    flow_id: config?.flowId,
    environment_id: config?.environmentId,
    config_id: config?.configId,
    regulation_config_id: config?.regulation?.regulationConfigId,
    type: type ? REQUEST_TYPE_TO_API[type] || type : undefined,
    identifiers,
  };
  const message = firstString(data, ["data_subject_message", "message"]);
  if (message) body.data_subject_message = message;
  return body;
}

export function isSubjectRequest(url) {
  try {
    const path = new URL(url, "https://example.invalid").pathname;
    return (
      path.endsWith("/dsr/requests") ||
      path.endsWith("/subject-requests/requests")
    );
  } catch {
    return false;
  }
}

export function install(target) {
  const original = target.fetch.bind(target);
  const entries = [];
  const listeners = new Set();
  let nextId = 1;

  function notify() {
    for (const listener of listeners) listener(entries.slice());
  }

  function record(entry) {
    entries.push(entry);
    notify();
  }

  target.fetch = async (input, init = {}) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    if (!isSubjectRequest(url)) return original(input, init);
    let body = init.body ?? "";
    if (typeof body !== "string") {
      try {
        body = JSON.stringify(body);
      } catch {
        body = String(body);
      }
    }
    let parsed = body;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
    record({
      id: nextId++,
      at: new Date().toISOString(),
      method: (init.method || "GET").toUpperCase(),
      url,
      headers: init.headers || { "Content-Type": "application/json" },
      body: parsed,
      status: "dry-run",
      note: "Not sent. Live submit is not enabled in this sandbox.",
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ dryRun: true }),
    };
  };

  return {
    getLog() {
      return entries.slice();
    },
    clearLog() {
      entries.length = 0;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
