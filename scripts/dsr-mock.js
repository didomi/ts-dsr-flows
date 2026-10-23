// Bundled mocked DidomiDSR. Not the live SDK.
// Guess: also expose DidomiSRM and #didomi-dsr-host until the live rename lands.
(function () {
  const fixture = window.__dsrFixture;
  if (!fixture || typeof fixture !== "object") {
    console.error("Mock DidomiDSR: missing fixture config.");
    return;
  }

  function ensureHost(id) {
    let host = document.getElementById(id);
    if (host) return host;
    host = document.createElement("div");
    host.id = id;
    document.body.append(host);
    return host;
  }

  const srmHost = ensureHost("didomi-srm-host");
  ensureHost("didomi-dsr-host");

  function mergeConfig() {
    const extra =
      window.didomiConfig && typeof window.didomiConfig === "object"
        ? window.didomiConfig
        : {};
    return Object.assign({}, fixture, extra, {
      user: Object.assign({}, fixture.user, extra.user),
    });
  }

  let activeWidgetId = null;

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  async function postSubmit(formData) {
    const config = mergeConfig();
    const url =
      window.__dsrRequestsURL ||
      `https://api.staging.privacy-center.org/dsr/requests?key=${encodeURIComponent(config.app?.apiKey || "")}`;
    const body = {
      flow_id: config.flowId,
      environment_id: config.environmentId,
      config_id: config.configId,
      regulation_config_id: config.regulation?.regulationConfigId,
      type:
        formData.type === "access"
          ? "access_data"
          : formData.type || formData.request_type,
      identifiers: Object.entries(formData)
        .filter(
          ([key, value]) =>
            ![
              "type",
              "request_type",
              "data_subject_message",
              "message",
            ].includes(key) &&
            typeof value === "string" &&
            value,
        )
        .map(([field_id, value]) => ({ field_id, value })),
    };
    if (formData.data_subject_message || formData.message)
      body.data_subject_message =
        formData.data_subject_message || formData.message;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function showForm(widgetId, layerName) {
    srmHost.replaceChildren();
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
    email.name = "email";
    email.type = "email";
    email.value = "qa@example.invalid";
    emailLabel.append(email);
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Request type";
    const type = document.createElement("select");
    type.name = "type";
    for (const value of ["access", "deletion"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      type.append(option);
    }
    typeLabel.append(type);
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Submit mock request";
    form.append(emailLabel, typeLabel, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = {
        email: email.value,
        type: type.value,
      };
      postSubmit(data);
    });
    srmHost.append(heading, note, form);
    activeWidgetId = widgetId;
  }

  const api = {
    getConfig() {
      return mergeConfig();
    },
    widgets: {
      show(options) {
        const config = mergeConfig();
        const catalog = config.widgets || {};
        const widgetId = options?.widgetId || config.defaultWidgetId;
        if (!widgetId || !catalog[widgetId]) {
          console.warn(
            `Didomi - Widget '${widgetId || ""}' not found in catalog`,
          );
          return;
        }
        showForm(widgetId, options?.layerName);
      },
      hide() {
        srmHost.replaceChildren();
        activeWidgetId = null;
      },
      isVisible(options) {
        if (options !== undefined && !isPlainObject(options)) {
          console.warn(
            'Didomi isVisible expects an options object, e.g. { widgetId: "..." }',
          );
          return false;
        }
        if (!activeWidgetId) return false;
        return options?.widgetId === undefined
          ? true
          : activeWidgetId === options.widgetId;
      },
    },
    // Sandbox-only. Not on the live DidomiSRM / DidomiDSR API.
    submit(formData) {
      return postSubmit(
        formData || { type: "access", email: "qa@example.invalid" },
      );
    },
  };

  window.DidomiDSR = api;
  window.DidomiSRM = api;
})();
