// Mocked DidomiDSR for the sandbox. Not the live SDK.
// Guess: the live global is still DidomiSRM mounting in #didomi-srm-host until
// the SDK rename ships, so the mock exposes both names and uses that host.
import { buildSubjectRequestBody } from "./dsr-network.mjs";

export function installMock(fixture, requestsURL) {
  let host = document.getElementById("didomi-srm-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "didomi-srm-host";
    document.body.append(host);
  }
  let activeWidgetId = null;

  function mergeConfig() {
    const extra =
      window.didomiConfig && typeof window.didomiConfig === "object"
        ? window.didomiConfig
        : {};
    return Object.assign({}, fixture, extra, {
      user: Object.assign({}, fixture.user, extra.user),
    });
  }

  function showForm(widgetId, layerName) {
    const heading = document.createElement("h2");
    heading.textContent = "Mock DSR widget";
    const note = document.createElement("p");
    note.textContent =
      "This is the bundled mocked DidomiDSR, not the live SDK.";
    if (layerName) note.textContent += ` Layer: ${layerName}.`;
    const form = document.createElement("form");
    const emailLabel = document.createElement("label");
    emailLabel.textContent = "Email";
    const email = document.createElement("input");
    email.type = "email";
    email.value = "qa@example.invalid";
    emailLabel.append(email);
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Request type";
    const type = document.createElement("select");
    for (const value of ["access", "deletion"]) type.append(new Option(value));
    typeLabel.append(type);
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Submit mock request";
    form.append(emailLabel, typeLabel, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const body = buildSubjectRequestBody(
        { email: email.value, type: type.value },
        mergeConfig(),
      );
      fetch(requestsURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });
    host.replaceChildren(heading, note, form);
    activeWidgetId = widgetId;
  }

  const api = {
    getConfig: mergeConfig,
    widgets: {
      show(options) {
        const config = mergeConfig();
        const widgetId = options?.widgetId || config.defaultWidgetId;
        if (!widgetId || !config.widgets?.[widgetId]) {
          console.warn(
            `Didomi - Widget '${widgetId || ""}' not found in catalog`,
          );
          return;
        }
        showForm(widgetId, options?.layerName);
      },
      hide() {
        host.replaceChildren();
        activeWidgetId = null;
      },
      isVisible(options) {
        if (!activeWidgetId) return false;
        return options?.widgetId === undefined
          ? true
          : activeWidgetId === options.widgetId;
      },
    },
  };
  window.DidomiDSR = api;
  window.DidomiSRM = api;
}
