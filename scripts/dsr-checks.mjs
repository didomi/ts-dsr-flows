const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpUrl(value) {
  try {
    return (
      typeof value === "string" &&
      ["http:", "https:"].includes(new URL(value).protocol)
    );
  } catch {
    return false;
  }
}

function modernAsset(def) {
  return (
    def.artifacts?.web?.en?.modern ??
    def.artifacts?.web?.[def.defaultLanguage]?.modern
  );
}

export function checkLoad(state = {}) {
  const findings = [];
  const add = (id, severity, title, evidence, suggestion) =>
    findings.push({ id, severity, title, evidence, suggestion });
  if (state.apiKey && !uuidPattern.test(state.apiKey))
    add(
      "api-key-format",
      "error",
      "Public API key is not a UUID",
      "apiKey must be a UUID.",
      "In Console → Flows → Publishing, copy the public API key. A private key will not load a Flow.",
    );
  if (state.attemptedLoad && !state.flow_id)
    add(
      "flow-id-missing",
      "error",
      "Flow ID is missing",
      "target / flow_id is required to load a DSR Flow.",
      "Copy the Flow ID from Console → Flows → Publishing for a Subject Request Flow.",
    );
  if (state.region && !state.country)
    add(
      "region-without-country",
      "error",
      "Region requires a country",
      "region is set without country.",
      "Set Country, or clear Region.",
    );
  const blockedStatus = [state.loaderStatus, state.configStatus].find(
    (status) => status === 403 || status === 404,
  );
  if (blockedStatus && state.environment === "production")
    add(
      "production-allowlist",
      "warning",
      "Production configs are allowlisted",
      `HTTP ${blockedStatus} from the production loader or config URL.`,
      "Production only serves DSR configs for allowlisted organizations. A 403 or 404 here usually means this org is not on that list, or the Flow was not published to production. Confirm publication and the allowlist, or test on staging.",
    );
  else if (blockedStatus === 404)
    add(
      "route-not-deployed",
      "error",
      "DSR loader route is not available",
      "HTTP 404 from the loader or config URL.",
      "The public /dsr CDN route may not be deployed yet. Set Configs base URL if you have a working host, or turn on Mock mode.",
    );
  else if (blockedStatus === 403)
    add(
      "feature-lock",
      "warning",
      "Configs host returned 403",
      "HTTP 403 from the loader or config URL.",
      "A 403 on staging usually means a stale or wrong base URL. Production allowlisting is a separate finding when environment is production.",
    );
  if (state.internalError)
    add(
      "internal-error",
      "error",
      "Loader reported an internal error",
      "The response included internalError: true.",
      "The key resolved no config. Confirm the public API key, Flow ID, selected environment, and platform=web.",
    );
  if (state.unreachable)
    add(
      "loader-unreachable",
      "error",
      "Could not reach the DSR loader",
      "The loader script failed to load or the request failed.",
      "Check Network, CORS, and blockers. Turn on Mock mode to confirm this sandbox still works.",
    );
  if (state.timedOut && !state.ready)
    add(
      "sdk-not-ready",
      "error",
      "DSR SDK did not become ready",
      "No DidomiDSR or DidomiSRM global after 20 seconds.",
      "Confirm the loader URL. Both globals are checked because the live name is still in flux.",
    );
  if (state.mock === "1")
    add(
      "mock-mode",
      "info",
      "Mock mode is on",
      "This page loaded the bundled mocked DidomiDSR, not the live SDK.",
      "Turn Mock mode off to try the live loader for the selected environment. The live /dsr route may still be unavailable.",
    );
  return findings;
}

export function checkConfig(config, state = {}) {
  const findings = [];
  const add = (id, severity, title, evidence, suggestion) =>
    findings.push({ id, severity, title, evidence, suggestion });
  if (!isObject(config)) {
    add(
      "config-unavailable",
      state.ready ? "error" : "info",
      "No loaded config available",
      state.ready
        ? "The SDK is ready but did not return a JSON object."
        : "The SDK has not provided a config yet.",
      "Confirm the public API key, Flow ID, and publication in the selected environment. Use Mock mode to inspect the fixture.",
    );
    return findings;
  }
  if (state.apiKey && config.app?.apiKey && config.app.apiKey !== state.apiKey)
    add(
      "api-key-mismatch",
      "warning",
      "Loaded API key differs from this test",
      "app.apiKey does not match the applied API key.",
      "Confirm the Console organization and copy the public API key from this Flow’s Publishing tab.",
    );
  const regulation = config.regulation?.name;
  if (!regulation)
    add(
      "regulation-missing",
      "warning",
      "No regulation name in the config",
      "regulation.name is missing.",
      "In Flows → Regulations, attach a DSAR regulation, then publish to the selected environment.",
    );
  else if (regulation === "none")
    add(
      "regulation-none",
      "info",
      "No applicable regulation selected",
      "regulation.name is none.",
      "Check country and region coverage, or test a location covered by the Flow.",
    );
  if (state.regulation && regulation && regulation !== state.regulation)
    add(
      "regulation-mismatch",
      "warning",
      "Requested regulation was not returned",
      `Requested ${state.regulation}; received ${regulation}.`,
      "Confirm the regulation is attached and covers this location, then publish to the selected environment.",
    );
  if (
    state.ready &&
    regulation &&
    regulation !== "none" &&
    !config.regulation?.regulationConfigId
  )
    add(
      "regulation-config-id-missing",
      "warning",
      "regulationConfigId is missing",
      "Submit bodies need regulation.regulationConfigId.",
      "Re-publish the Flow to the selected environment and reload.",
    );
  const catalog = isObject(config.widgets) ? config.widgets : {};
  const ids = Object.keys(catalog);
  if (config.widgets !== undefined && !isObject(config.widgets))
    add(
      "widgets-shape",
      "error",
      "Widget catalog has an unexpected shape",
      "widgets must be an object keyed by widget ID.",
      "Publish again without custom JSON. If it persists, contact support with the returned config.",
    );
  if (!ids.length && regulation !== "none")
    add(
      "widgets-empty",
      "warning",
      "No widgets in the delivered config",
      "The widget catalog is absent or empty.",
      "In Flows → Privacy Widgets, assign widgets and a default, then publish to the selected environment.",
    );
  for (const [id, definition] of Object.entries(catalog)) {
    if (!isObject(definition)) {
      add(
        `widget-shape-${id}`,
        "error",
        "Widget definition is not an object",
        `widgets[${JSON.stringify(id)}] has an unexpected value.`,
        "Confirm the widget assignment, publish to the selected environment, and retest without custom JSON.",
      );
      continue;
    }
    const modern = httpUrl(modernAsset(definition));
    const legacy = httpUrl(definition.bundleUrl);
    if (!modern && !legacy)
      add(
        `widget-bundle-${id}`,
        "error",
        "Widget has no usable web display asset",
        `Widget ${id} has no http(s) artifacts.web modern URL or bundleUrl.`,
        "Confirm publication. Current configs serve artifacts.web; an older bundleUrl alone is not enough for every SDK build.",
      );
    else if (!modern)
      add(
        `widget-bundle-${id}`,
        "info",
        "Widget uses the older bundle URL format",
        `Widget ${id} has bundleUrl but no artifacts.web modern URL.`,
        "Current SDK builds read artifacts.web. bundleUrl is a compatibility leftover.",
      );
  }
  if (config.defaultWidgetId && !has(catalog, config.defaultWidgetId))
    add(
      "default-widget",
      "error",
      "Default widget is absent from the catalog",
      `defaultWidgetId is ${config.defaultWidgetId}.`,
      "Choose a default widget that is assigned to this regulation, then publish to the selected environment.",
    );
  if (state.widget_id && !has(catalog, state.widget_id))
    add(
      "requested-widget",
      "warning",
      "Requested widget is absent from the catalog",
      `The selected Widget ID is ${state.widget_id}.`,
      "Use a widget from the picker, or choose Use Flow rules.",
    );
  if (config.rules !== undefined && !Array.isArray(config.rules))
    add(
      "rules-shape",
      "error",
      "Rules have an unexpected shape",
      "rules is not an array.",
      "Review display rules, publish to the selected environment, and retest without custom JSON.",
    );
  const rules = Array.isArray(config.rules) ? config.rules : [];
  if (ids.length && (config.rules === undefined || rules.length === 0))
    add(
      "widget-rules-empty",
      "warning",
      "No display rules may prevent widget initialization",
      config.rules === undefined
        ? "The widget catalog is present, but rules is missing."
        : "The widget catalog is present, but rules is an empty array ([]).",
      "The live SDK skips widget init when rules are empty. Confirm the intended rules and publication.",
    );
  rules.forEach((rule, index) => {
    if (
      isObject(rule) &&
      rule.targetWidgetId &&
      !has(catalog, rule.targetWidgetId)
    )
      add(
        `rule-widget-${index}`,
        "error",
        "Rule points to a missing widget",
        `Rule ${rule.id || index} targets ${rule.targetWidgetId}.`,
        "Select a widget currently assigned to this regulation, then publish.",
      );
  });
  if (rules.length && rules.every((rule) => rule?.triggerMode === "manual"))
    add(
      "manual-rules",
      "info",
      "All returned rules use manual display",
      "Every rule has triggerMode=manual.",
      "This is common for DSR forms. Use Show widget to open the form.",
    );
  return findings;
}

export function eventSuggestion(entry) {
  const message = `${entry.message} ${entry.detail || ""}`;
  if (entry.kind === "Content security policy")
    return "Allow the SDK, widget, and configs origins in the page Content Security Policy.";
  if (/no bundle url|invalid bundle url|no loadable bundle/i.test(message))
    return "Check artifacts.web for a modern URL, confirm publication, and do not paste a guessed asset URL.";
  if (/no widgets are configured|not found in catalog/i.test(message))
    return "In Flows → Privacy Widgets, check assignments and the default widget, then publish to the selected environment.";
  if (/subject request failed/i.test(message))
    return "Dry-run should not reach a live API. If this appears, the interceptor missed a URL.";
  if (
    /timeout|timed out|failed to fetch|resource|load/i.test(message) ||
    entry.kind === "Resource load"
  )
    return "Check Network for HTTP status. A 404 usually means the /dsr route is not deployed yet.";
  if (/script error\.?$/i.test(entry.message.trim()))
    return "The browser hid details of a cross-origin script failure. Open DevTools Console and Network.";
  return "Confirm the Flow was published to the selected environment. Retest with Mock mode. If it persists, share this message and the loaded config with support.";
}
