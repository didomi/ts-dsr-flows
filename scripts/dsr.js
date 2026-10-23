import {
  groups,
  fields,
  readState,
  shareURL,
  validate,
  buildConfig,
  loaderURL,
  configURL,
  requestsURL,
  embedSnippet,
  widgetOptions,
} from "./dsr-state.mjs";
import { createJSONViewer } from "./dsr-json-viewer.mjs";
import { createTroubleshooting } from "./dsr-troubleshooting.mjs";
import { createWorkspace } from "./dsr-layout.mjs";
import { install, buildSubjectRequestBody } from "./dsr-network.mjs";

const form = document.querySelector("#flow-form");
const status = document.querySelector("#status");
const info = document.querySelector("#runtime-info");
const controls = new Map();
const widgetKeys = new Set(["widget_id", "layer_name"]);
const initial = readState(new URLSearchParams(location.search));
const network = install(window);
let applied;
let ready = false;
let readyTimer;
let loadInfo = { ...initial };
const viewer = createJSONViewer(
  document.querySelector('section[aria-labelledby="loaded-config-title"]'),
);
const troubleshooting = createTroubleshooting(
  document.querySelector("#troubleshooting"),
);
const workspace = { current: null };

function sdk() {
  return window.DidomiDSR || window.DidomiSRM;
}

function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}

for (const [groupIndex, group] of groups.entries()) {
  const section = document.createElement("details");
  section.className = "setup-group";
  section.id = `setup-group-${groupIndex}`;
  section.open = groupIndex === 0;
  const summary = document.createElement("summary");
  summary.textContent = group.title;
  const link = document.createElement("a");
  link.href = `#${section.id}`;
  link.textContent = group.title;
  link.addEventListener("click", () => {
    section.open = true;
  });
  document.querySelector("#setup-navigation").append(link);
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = group.title;
  legend.className = "sr-only";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = group.hint;
  const grid = document.createElement("div");
  grid.className = "fields";
  for (const field of group.fields) {
    const label = document.createElement("label");
    label.textContent = field.label;
    label.title = `URL parameter: ${field.key}`;
    const input = document.createElement(
      field.options
        ? "select"
        : field.type === "textarea"
          ? "textarea"
          : "input",
    );
    input.id = field.key;
    input.name = field.key;
    input.setAttribute("form", "flow-form");
    if (field.options) {
      for (const value of field.options) {
        const option = document.createElement("option");
        option.value = value;
        const defaultLabels = {
          "": "Off",
          1: "On",
        };
        option.textContent =
          field.optionLabels?.[value] ?? defaultLabels[value] ?? value;
        input.append(option);
      }
      if (!field.options.includes(initial[field.key])) {
        const invalid = document.createElement("option");
        invalid.value = initial[field.key];
        invalid.textContent = `Unsupported: ${initial[field.key]}`;
        input.append(invalid);
      }
    } else if (field.type !== "textarea") {
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
    }
    input.value = initial[field.key];
    if (["apiKey", "flow_id"].includes(field.key)) input.required = true;
    if (field.type === "textarea") input.spellcheck = false;
    label.htmlFor = input.id;
    const help = document.createElement("small");
    help.id = `${field.key}-help`;
    help.textContent = field.hint;
    input.setAttribute("aria-describedby", help.id);
    const wrapper = document.createElement("div");
    if (field.type === "textarea" || field.key === "apply_conf")
      wrapper.className = "wide";
    wrapper.append(label, input, help);
    const target = widgetKeys.has(field.key)
      ? document.querySelector("#widget-fields")
      : grid;
    target.append(wrapper);
    controls.set(field.key, input);
  }
  fieldset.append(legend, hint, grid);
  section.append(summary, fieldset);
  document.querySelector("#field-groups").append(section);
}
workspace.current = createWorkspace();

function stateFromForm() {
  return Object.fromEntries(
    fields.map(({ key }) => [key, controls.get(key).value]),
  );
}

function preview(state, updateHistory = false) {
  const url = shareURL(state, location.href);
  document.querySelector("#share-url").value = url.href;
  if (updateHistory) history.replaceState(null, "", url);
  try {
    validate(state, false);
    document.querySelector("#effective-config").textContent = JSON.stringify(
      buildConfig(state),
      null,
      2,
    );
    if (!state.apiKey || !state.flow_id) {
      const prompt = "Enter both a public API key and a Flow ID.";
      document.querySelector("#loader-url").textContent = prompt;
      document.querySelector("#embed-snippet").textContent = prompt;
      message(prompt);
      return false;
    }
    document.querySelector("#loader-url").textContent = loaderURL(state).href;
    document.querySelector("#embed-snippet").textContent = embedSnippet(state);
    return true;
  } catch (error) {
    document.querySelector("#loader-url").textContent = error.message;
    document.querySelector("#embed-snippet").textContent = error.message;
    document.querySelector("#effective-config").textContent =
      "Fix input errors to preview the effective config.";
    message(error.message, true);
    return false;
  }
}

function fillWidgetPicker(config) {
  const select = controls.get("widget_id");
  if (!select || select.tagName !== "SELECT") return;
  const current = select.value;
  const ids = Object.keys(config?.widgets || {});
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Use Flow rules";
  select.append(blank);
  for (const id of ids) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    select.append(option);
  }
  if (
    current &&
    ![...select.options].some((option) => option.value === current)
  ) {
    const extra = document.createElement("option");
    extra.value = current;
    extra.textContent = current;
    select.append(extra);
  }
  select.value = current;
}

function renderNetworkLog() {
  const list = document.querySelector("#network-log");
  const entries = network.getLog();
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.textContent = "No dry-run submissions yet.";
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${entry.method} ${entry.status}`;
    const body = document.createElement("pre");
    body.textContent = JSON.stringify(
      { url: entry.url, body: entry.body, note: entry.note },
      null,
      2,
    );
    item.append(title, body);
    list.append(item);
  }
}

function renderRuntime() {
  const config = sdk()?.getConfig?.();
  fillWidgetPicker(config);
  const visible = sdk()?.widgets?.isVisible?.();
  const summary = document.querySelector("#runtime-summary");
  summary.replaceChildren();
  for (const [label, value] of Object.entries({
    Mode: applied?.mock === "1" ? "Mock DidomiDSR" : "Live loader",
    Flow: applied?.flow_id || "—",
    Deployment: applied?.environment || "—",
    Regulation: config?.regulation?.name || "Not returned",
    "Widget visible":
      visible === undefined ? "Unavailable" : visible ? "Yes" : "No",
    Widgets: Object.keys(config?.widgets || {}).join(", ") || "None returned",
  })) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    summary.append(term, description);
  }
  info.textContent = JSON.stringify(
    {
      mock: applied?.mock === "1",
      regulation: config?.regulation?.name ?? null,
      widgetVisible: visible ?? null,
      widgetIds: Object.keys(config?.widgets || {}),
      widgetOptions: widgetOptions(stateFromForm()) ?? null,
      loadedSettings: {
        flowId: applied?.flow_id,
        environment: applied?.environment,
      },
    },
    null,
    2,
  );
}

function renderLoadedConfig() {
  const feedback = document.querySelector("#loaded-config-status");
  const copy = document.querySelector("#copy-config");
  const state = {
    ...loadInfo,
    ...(applied || initial),
    widget_id: controls.get("widget_id").value,
    layer_name: controls.get("layer_name").value,
    ready,
  };
  try {
    const config = sdk()?.getConfig?.();
    viewer.update(config);
    troubleshooting.update(config, state);
    copy.disabled = config === undefined;
    feedback.textContent =
      config === undefined
        ? "No configuration available."
        : applied?.mock === "1"
          ? "Loaded from the mocked DidomiDSR fixture."
          : "Loaded from DidomiDSR.getConfig().";
  } catch (error) {
    viewer.error(`Could not read getConfig(): ${error.message}`);
    troubleshooting.update(undefined, state);
    feedback.textContent = "Configuration could not be displayed.";
    copy.disabled = true;
    window.dsrDebugCapture?.record("Config inspection", "error", error.message);
  }
}

function markReady() {
  ready = true;
  clearTimeout(readyTimer);
  document.querySelector("#show-widget").disabled = false;
  document.querySelector("#hide-widget").disabled = false;
  document.querySelector("#preview-submit").disabled = false;
  document.querySelector("#inspect-config").disabled = false;
  loadInfo = { ...loadInfo, ready: true };
  renderRuntime();
  renderLoadedConfig();
  message(
    applied.mock === "1"
      ? "Mock ready. This is the bundled mocked DidomiDSR, not the live SDK."
      : "SDK ready. Inspect the loaded config and test the DSR widgets.",
  );
}

async function runAction(action) {
  if (!ready) return;
  try {
    await action();
    renderRuntime();
    renderLoadedConfig();
  } catch (error) {
    message(`SDK action failed: ${error.message}`, true);
    window.dsrDebugCapture?.record("SDK action", "error", error.message);
  }
}

for (const [key, input] of controls) {
  input.addEventListener("input", () => {
    const valid = preview(stateFromForm(), true);
    if (widgetKeys.has(key)) {
      if (ready) {
        renderRuntime();
        renderLoadedConfig();
      }
      if (valid)
        message("Widget selection changed. Click Show widget to test it.");
    } else if (valid) {
      message("Settings changed. Apply and reload to test this configuration.");
    }
  });
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const state = stateFromForm();
  if (!preview(state)) return;
  const next = shareURL(state, location.href);
  next.hash = "test";
  history.replaceState({ dsrApplyReload: true }, "", next);
  history.scrollRestoration = "manual";
  location.reload();
});
document.querySelector("#copy-link").addEventListener("click", async () => {
  if (!preview(stateFromForm())) return;
  try {
    await navigator.clipboard.writeText(
      document.querySelector("#share-url").value,
    );
    message("Share link copied.");
  } catch {
    const textarea = document.querySelector("#share-url");
    textarea.closest("details").open = true;
    textarea.focus();
    textarea.select();
    message("Copy the selected share link.");
  }
});
window.addEventListener("popstate", () => location.reload());

const widgetProblem = document.querySelector("#widget-problem");
document
  .querySelector("#close-widget-problem")
  .addEventListener("click", () => widgetProblem.close());
document
  .querySelector("#widget-problem-troubleshooting")
  .addEventListener("click", () => {
    widgetProblem.close();
    workspace.current.activate("test");
    history.replaceState(null, "", "#troubleshooting-title");
    const heading = document.querySelector("#troubleshooting-title");
    heading.scrollIntoView({ block: "start", behavior: "smooth" });
    heading.focus({ preventScroll: true });
  });
document.querySelector("#show-widget").addEventListener("click", async () => {
  if (!ready) return;
  const button = document.querySelector("#show-widget");
  button.disabled = true;
  let timeout;
  try {
    if (typeof sdk()?.widgets?.show !== "function")
      throw new Error("Widget controls are unavailable in the loaded SDK.");
    await Promise.race([
      Promise.resolve(sdk().widgets.show(widgetOptions(stateFromForm()))),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "The widget did not finish opening. It may still appear if loading completes.",
              ),
            ),
          10000,
        );
      }),
    ]);
    const deadline = Date.now() + 3000;
    while (sdk().widgets.isVisible?.() === false && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (sdk().widgets.isVisible?.() === false)
      throw new Error("No widget appeared for the current test settings.");
    renderRuntime();
    renderLoadedConfig();
  } catch (error) {
    const detail = error?.message || "The SDK could not display a widget.";
    message(
      "The widget could not be displayed. Read Troubleshooting on tab 2 for checks to try.",
      true,
    );
    window.dsrDebugCapture?.record("Show widget", "error", detail);
    renderRuntime();
    renderLoadedConfig();
    document.querySelector("#widget-problem-detail").textContent = detail;
    if (!widgetProblem.open) widgetProblem.showModal();
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
});
document
  .querySelector("#hide-widget")
  .addEventListener("click", () => runAction(() => sdk().widgets.hide()));
document
  .querySelector("#inspect-config")
  .addEventListener("click", renderLoadedConfig);
document.querySelector("#copy-config").addEventListener("click", async () => {
  renderLoadedConfig();
  if (document.querySelector("#copy-config").disabled) return;
  const output = document.querySelector("#loaded-config");
  const feedback = document.querySelector("#loaded-config-status");
  try {
    await navigator.clipboard.writeText(output.textContent);
    feedback.textContent = "Configuration JSON copied.";
  } catch {
    const range = document.createRange();
    viewer.showPlain();
    range.selectNodeContents(output);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    output.focus();
    feedback.textContent = "Copy the selected configuration JSON.";
  }
});
document
  .querySelector("#preview-submit")
  .addEventListener("click", async () => {
    const sample = { type: "access", email: "qa@example.invalid" };
    const current = sdk();
    if (typeof current?.submit === "function") await current.submit(sample);
    else {
      const body = buildSubjectRequestBody(
        sample,
        current?.getConfig?.() || {},
      );
      await fetch(requestsURL(applied || stateFromForm()).href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    renderNetworkLog();
    message("Dry-run submit recorded. Nothing was sent.");
  });
network.subscribe(renderNetworkLog);
renderNetworkLog();

function waitForSdk(ms = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (sdk()) return resolve(sdk());
      if (Date.now() - start >= ms) return reject(new Error("timeout"));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}.`));
    document.head.append(script);
  });
}

async function start() {
  troubleshooting.update(undefined, { ...initial, ready: false });
  if (!preview(initial)) return;
  applied = initial;
  window.didomiConfig = buildConfig(applied);
  window.__dsrRequestsURL = requestsURL(applied).href;
  loadInfo = { ...applied, attemptedLoad: true, ready: false };
  message(
    applied.mock === "1"
      ? "Loading the mocked DidomiDSR…"
      : "Loading the DSR SDK…",
  );
  readyTimer = setTimeout(() => {
    if (!ready) {
      loadInfo = { ...loadInfo, timedOut: true };
      message(
        "The SDK has not become ready. Verify the API key, Flow publication, environment, and browser console.",
        true,
      );
      window.dsrDebugCapture?.record(
        "SDK startup",
        "error",
        "SDK readiness timed out after 20 seconds.",
      );
      renderLoadedConfig();
    }
  }, 20000);
  try {
    if (applied.mock === "1") {
      const fixture = await fetch("fixtures/dsr-config.json");
      if (!fixture.ok) throw new Error("Could not load the mock fixture.");
      window.__dsrFixture = await fixture.json();
      await loadScript("scripts/dsr-mock.js");
      await waitForSdk();
      markReady();
      return;
    }
    const url = loaderURL(applied);
    try {
      const probe = await fetch(url.href);
      loadInfo = { ...loadInfo, loaderStatus: probe.status };
      if (probe.status === 404 || probe.status === 403) {
        clearTimeout(readyTimer);
        message(
          `Could not load the SDK (HTTP ${probe.status}). Check Troubleshooting.`,
          true,
        );
        renderLoadedConfig();
        return;
      }
    } catch {
      loadInfo = { ...loadInfo, unreachable: true };
    }
    try {
      const configResponse = await fetch(configURL(applied).href);
      loadInfo = { ...loadInfo, configStatus: configResponse.status };
      if (configResponse.ok) {
        const payload = await configResponse.json().catch(() => null);
        if (payload?.internalError)
          loadInfo = { ...loadInfo, internalError: true };
        if (payload && !sdk()) viewer.update(payload);
      }
    } catch {
      /* config probe is optional */
    }
    writeSDK(url.href);
    const loader = document.querySelector("#spcloader");
    loader.addEventListener("error", () => {
      clearTimeout(readyTimer);
      loadInfo = { ...loadInfo, unreachable: true };
      window.dsrDebugCapture?.record(
        "SDK startup",
        "error",
        "Could not load the SDK loader.",
      );
      message(
        "Could not load the SDK. Check the generated loader URL and your network connection.",
        true,
      );
      renderLoadedConfig();
    });
    await waitForSdk();
    markReady();
  } catch (error) {
    if (error.message === "timeout") return;
    message(error.message, true);
    window.dsrDebugCapture?.record("SDK startup", "error", error.message);
    renderLoadedConfig();
  }
}
start();
