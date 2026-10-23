const field = (key, label, hint = "", options) => ({
  key,
  label,
  hint,
  options,
});

export const groups = [
  {
    title: "Flow and deployment",
    hint: "Copy the public API key and Flow ID from Console → Flows → Publishing. Choose the environment that Flow was published to.",
    fields: [
      field(
        "apiKey",
        "Public API key",
        "Public UUID from the Flow’s Publishing tab. Required. A private API key will not work.",
      ),
      field(
        "flow_id",
        "Flow ID",
        "Published Subject Request Flow to load. Required.",
      ),
      field(
        "environment",
        "Flow deployment",
        "Staging or production publication. This also selects the SDK CDN and submit API hosts. Submits are dry-run in both environments.",
        ["staging", "production"],
      ),
      field(
        "platform",
        "Platform",
        "Published Flow platform. Web only in this sandbox.",
        ["web"],
      ),
      field(
        "mock",
        "Mock mode",
        "On loads a bundled mocked DidomiDSR and fixture config. Off tries the live loader for the selected environment. The live /dsr route may still be unavailable.",
        ["", "1"],
      ),
    ],
  },
  {
    title: "Delivery overrides",
    hint: "Choose which published content to request. Leave blank to use the loader defaults.",
    fields: [
      field(
        "country",
        "Country",
        "Two-letter country code, for example FR. Leave blank for the default.",
      ),
      field(
        "region",
        "Region",
        "State or subdivision, for example CA. Requires Country.",
      ),
      field(
        "regulation",
        "Regulation",
        "Request a regulation such as gdpr. Leave blank to choose by location.",
      ),
    ],
  },
  {
    title: "Base URL overrides",
    hint: "Use these when the public CDN does not yet serve /dsr. They do not change your published Flow.",
    fields: [
      field(
        "configs_base_url",
        "Configs base URL",
        "Origin for loader.js and didomi_config.json. Leave blank to use the host for the selected environment.",
      ),
      field(
        "api_base_url",
        "Submit API base URL",
        "Origin shown in the dry-run submit URL. Leave blank to use the host for the selected environment.",
      ),
    ],
  },
  {
    title: "SDK configuration and tools",
    hint: "These settings change only this sandbox session. They are not saved to Console.",
    fields: [
      field(
        "apply_conf",
        "Apply custom JSON",
        "Set to On, then click Apply and reload to use the JSON below. Off keeps the JSON in your share link without applying it.",
        ["", "1"],
      ),
      {
        ...field(
          "widget_id",
          "Widget ID",
          "Widget to open with Show widget. Leave as Use Flow rules to use the default widget from the loaded config.",
          [""],
        ),
        optionLabels: { "": "Use Flow rules" },
      },
      field(
        "layer_name",
        "Layer name",
        "Screen or layer to open with Show widget. Leave blank for the widget’s default.",
      ),
      {
        ...field(
          "config",
          "Custom didomiConfig JSON",
          "JSON object merged into window.didomiConfig when Apply custom JSON is On. Use it for sdkPath or apiPath experiments.",
        ),
        type: "textarea",
      },
    ],
  },
];

export const fields = groups.flatMap((group) => group.fields);

const defaults = {
  environment: "staging",
  platform: "web",
};

const configsHosts = {
  staging: "https://sdk.staging.privacy-center.org/",
  production: "https://sdk.privacy-center.org/",
};
const apiHosts = {
  staging: "https://api.staging.privacy-center.org/",
  production: "https://api.privacy-center.org/",
};

export function encodeConfig(value) {
  return btoa(
    Array.from(new TextEncoder().encode(value), (byte) =>
      String.fromCharCode(byte),
    ).join(""),
  );
}

export function decodeConfig(value) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(value), (char) => char.charCodeAt(0)),
  );
}

export function readState(params) {
  const state = Object.fromEntries(
    fields.map(({ key }) => [key, params.get(key) ?? defaults[key] ?? ""]),
  );
  if (!state.flow_id && params.get("target"))
    state.flow_id = params.get("target") || "";
  if (state.config) {
    try {
      state.config = decodeConfig(state.config);
    } catch {
      state.config = "Invalid base64 config. Replace this with a JSON object.";
    }
  }
  return state;
}

export function shareURL(state, href) {
  const url = new URL(href);
  for (const { key } of fields) {
    url.searchParams.delete(key);
    const value = state[key];
    if (value !== "" && value !== undefined && value !== defaults[key]) {
      url.searchParams.set(key, key === "config" ? encodeConfig(value) : value);
    }
  }
  url.searchParams.delete("target");
  return url;
}

function objectJSON(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be a JSON object.`);
  return value;
}

function httpBase(value, label) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error(`${label} must be an http(s) URL.`);
  return value.endsWith("/") ? value : `${value}/`;
}

export function validate(state, requireTarget = true) {
  if (requireTarget && (!state.apiKey || !state.flow_id))
    throw new Error("Enter both a public API key and a Flow ID.");
  for (const { key, options } of fields) {
    if (options && !options.includes(state[key] ?? ""))
      throw new Error(`Unsupported value for ${key}.`);
  }
  for (const key of ["country", "region"]) {
    if (state[key] && !/^[A-Za-z]{2}$/.test(state[key]))
      throw new Error(`${key} must contain two letters.`);
  }
  if (state.region && !state.country)
    throw new Error("Region requires a loader country.");
  if (state.configs_base_url)
    httpBase(state.configs_base_url, "Configs base URL");
  if (state.api_base_url) httpBase(state.api_base_url, "Submit API base URL");
  if (state.config) objectJSON(state.config, "Custom didomiConfig JSON");
}

export function buildConfig(state) {
  const config =
    state.apply_conf === "1" && state.config
      ? objectJSON(state.config, "Custom didomiConfig JSON")
      : {};
  const user = () => {
    if (
      !config.user ||
      typeof config.user !== "object" ||
      Array.isArray(config.user)
    )
      config.user = {};
    return config.user;
  };
  if (state.country) {
    user().country = state.country;
    delete user().region;
  }
  if (state.region) user().region = state.region;
  return config;
}

function configsBase(state) {
  return state.configs_base_url
    ? httpBase(state.configs_base_url, "Configs base URL")
    : configsHosts[state.environment] || configsHosts.staging;
}

function apiBase(state) {
  return state.api_base_url
    ? httpBase(state.api_base_url, "Submit API base URL")
    : apiHosts[state.environment] || apiHosts.staging;
}

function dsrSearch(url, state) {
  url.searchParams.set("target", state.flow_id);
  url.searchParams.set("environment", state.environment || "staging");
  if (state.platform) url.searchParams.set("platform", state.platform);
  for (const key of ["country", "region", "regulation"])
    if (state[key]) url.searchParams.set(key, state[key]);
  return url;
}

export function loaderURL(state) {
  validate(state);
  const url = new URL(
    `dsr/${encodeURIComponent(state.apiKey)}/loader.js`,
    configsBase(state),
  );
  return dsrSearch(url, state);
}

export function configURL(state) {
  validate(state);
  const url = new URL(
    `dsr/${encodeURIComponent(state.apiKey)}/didomi_config.json`,
    configsBase(state),
  );
  return dsrSearch(url, state);
}

export function requestsURL(state) {
  const url = new URL("dsr/requests", apiBase(state));
  if (state.apiKey) url.searchParams.set("key", state.apiKey);
  return url;
}

export function embedSnippet(state) {
  return `<script src="${loaderURL(state).href}"></script>`;
}

export function widgetOptions(state) {
  const options = {};
  if (state.widget_id) options.widgetId = state.widget_id;
  if (state.layer_name) options.layerName = state.layer_name;
  return Object.keys(options).length ? options : undefined;
}
