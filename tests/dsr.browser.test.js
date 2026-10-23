const { test, expect } = require("@playwright/test");

const mockQuery =
  "apiKey=00000000-0000-4000-8000-000000000001&flow_id=flow-fixture&mock=1";

async function blockLive(page) {
  await page.route("https://sdk*/**", (route) => route.abort());
  await page.route("https://api*/**", (route) => route.abort());
}

async function openSetup(page) {
  await page.getByRole("tab", { name: "1. Setup", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Setup sections" });
  for (const name of [
    "Flow and deployment",
    "Delivery overrides",
    "Base URL overrides",
    "SDK configuration and tools",
  ])
    await nav.getByRole("link", { name, exact: true }).click();
}

async function waitMockReady(page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Mock ready" }),
  ).toBeVisible();
}

test("empty form is usable and does not load a loader or mock", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/loader.js") ||
      request.url().includes("dsr-mock")
    )
      requests.push(request.url());
  });
  await page.goto("/index.html?flow_id=only-flow");
  await expect(
    page.getByRole("status").filter({ hasText: "Enter both" }),
  ).toBeVisible();
  await expect(page.getByLabel("Flow ID", { exact: true })).toHaveValue(
    "only-flow",
  );
  await page
    .getByRole("tab", { name: "2. Test & troubleshoot", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Show widget", exact: true }),
  ).toBeDisabled();
  expect(requests).toEqual([]);
});

test("applying setup opens the test workspace at the top", async ({ page }) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#setup`);
  await openSetup(page);
  const apply = page.getByRole("button", {
    name: "Apply and reload",
    exact: true,
  });
  await apply.scrollIntoViewIfNeeded();
  await Promise.all([page.waitForEvent("load"), apply.click()]);
  await expect(
    page.getByRole("tab", { name: "2. Test & troubleshoot" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Widget controls" }),
  ).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("mock mode loads DidomiDSR and labels itself as a mock", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}`);
  await waitMockReady(page);
  const flowId = await page.evaluate(() => window.DidomiDSR.getConfig().flowId);
  expect(flowId).toBe("flow-fixture");
  expect(await page.evaluate(() => window.DidomiSRM === window.DidomiDSR)).toBe(
    true,
  );
  await page
    .getByRole("tab", { name: "2. Test & troubleshoot", exact: true })
    .click();
  await expect(page.getByText("Mock DidomiDSR", { exact: true })).toBeVisible();
});

test("show and hide widget mount the labelled mock form", async ({ page }) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#test`);
  await waitMockReady(page);
  await page.getByRole("button", { name: "Show widget", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mock DSR widget" }),
  ).toBeVisible();
  await expect(
    page.getByText("This is the bundled mocked DidomiDSR, not the live SDK.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.DidomiDSR.widgets.isVisible())).toBe(
    true,
  );
  await page.getByRole("button", { name: "Hide widget", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mock DSR widget" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.DidomiDSR.widgets.isVisible())).toBe(
    false,
  );
});

test("widget picker and layer update show options and the share URL", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#test`);
  await waitMockReady(page);
  await page
    .getByLabel("Widget ID", { exact: true })
    .selectOption("access-widget");
  await page.getByLabel("Layer name", { exact: true }).fill("form");
  await page.getByRole("button", { name: "Show widget", exact: true }).click();
  await expect(page.getByText("Layer: form.")).toBeVisible();
  const shared = new URL(page.url());
  expect(shared.searchParams.get("widget_id")).toBe("access-widget");
  expect(shared.searchParams.get("layer_name")).toBe("form");
});

test("preview submit payload records a dry-run POST and sends nothing", async ({
  page,
}) => {
  const leaked = [];
  page.on("request", (request) => {
    if (request.url().includes("privacy-center.org"))
      leaked.push(request.url());
  });
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#test`);
  await waitMockReady(page);
  await page
    .getByRole("button", { name: "Preview submit payload", exact: true })
    .click();
  await expect(page.getByText("POST dry-run", { exact: true })).toBeVisible();
  await expect(page.getByText("/dsr/requests")).toBeVisible();
  await expect(page.getByText("access_data")).toBeVisible();
  expect(leaked).toEqual([]);
});

test("mock widget form submit is dry-run with the mapped request type", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#test`);
  await waitMockReady(page);
  await page.getByRole("button", { name: "Show widget", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Request type" })
    .selectOption("deletion");
  await page
    .getByRole("button", { name: "Submit mock request", exact: true })
    .click();
  await expect(page.getByText("POST dry-run", { exact: true })).toBeVisible();
  await expect(page.getByText(/"delete_data"/)).toBeVisible();
});

test("configuration tree renders the fixture and keeps HTML as text", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedConfig = text;
        },
      },
    });
  });
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#config`);
  await waitMockReady(page);
  await expect(page.getByText('"flow-fixture"', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const config = window.DidomiDSR.getConfig();
    config.text = '<img src=x onerror="window.treeInjected=true">';
    window.DidomiDSR.getConfig = () => config;
  });
  await page
    .getByRole("button", { name: "Refresh loaded config", exact: true })
    .click();
  await page.getByRole("button", { name: "Plain JSON", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Loaded SDK configuration" })
      .getByText(/treeInjected/)
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.treeInjected === undefined)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Copy JSON", exact: true }).click();
  expect(await page.evaluate(() => window.copiedConfig)).toContain(
    "flow-fixture",
  );
});

test("custom JSON applies only after enabling and reloading", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}`);
  await waitMockReady(page);
  await openSetup(page);
  await page
    .getByLabel("Custom didomiConfig JSON", { exact: true })
    .fill('{"testOverride":"saved"}');
  await page
    .getByRole("button", { name: "Apply and reload", exact: true })
    .click();
  await waitMockReady(page);
  expect(
    await page.evaluate(() => window.DidomiDSR.getConfig().testOverride),
  ).toBeUndefined();
  await openSetup(page);
  await page.getByLabel("Apply custom JSON", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Apply and reload", exact: true })
    .click();
  await waitMockReady(page);
  expect(
    await page.evaluate(() => window.DidomiDSR.getConfig().testOverride),
  ).toBe("saved");
});

test("malformed shared JSON blocks SDK startup", async ({ page }) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}&config=%%%&apply_conf=1`);
  await expect(
    page.getByRole("status").filter({ hasText: "must be valid JSON" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Boolean(document.getElementById("spcloader"))),
  ).toBe(false);
});

test("live loader 404 on staging reports the missing route", async ({
  page,
}) => {
  await page.route("**/dsr/**", (route) =>
    route.fulfill({ status: 404, body: "Route does not exist" }),
  );
  await page.goto(
    "/index.html?apiKey=00000000-0000-4000-8000-000000000001&flow_id=flow",
  );
  await page
    .getByRole("tab", { name: "2. Test & troubleshoot", exact: true })
    .click();
  await expect(
    page.getByText("DSR loader route is not available"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show widget", exact: true }),
  ).toBeDisabled();
});

test("live loader 404 on production suggests the allowlist", async ({
  page,
}) => {
  await page.route("**/dsr/**", (route) =>
    route.fulfill({ status: 404, body: "Route does not exist" }),
  );
  await page.goto(
    "/index.html?apiKey=00000000-0000-4000-8000-000000000001&flow_id=flow&environment=production",
  );
  await page
    .getByRole("tab", { name: "2. Test & troubleshoot", exact: true })
    .click();
  await expect(
    page.getByText("warning: Production configs are allowlisted", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/allowlisted organizations/)).toBeVisible();
});

test("production environment selects production hosts in the loader URL", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}`);
  await waitMockReady(page);
  await openSetup(page);
  await page
    .getByLabel("Flow deployment", { exact: true })
    .selectOption("production");
  await page
    .getByRole("tab", { name: "3. Configuration", exact: true })
    .click();
  const loaderUrl = page.getByRole("group").filter({
    has: page.getByText("Generated loader URL", { exact: true }),
  });
  await expect(loaderUrl).toContainText("sdk.privacy-center.org");
  await expect(loaderUrl).toContainText("environment=production");
  expect(new URL(page.url()).searchParams.get("environment")).toBe(
    "production",
  );
});

test("UUID finding appears for a non-UUID key", async ({ page }) => {
  await page.goto("/index.html?apiKey=not-a-uuid");
  await page
    .getByRole("tab", { name: "2. Test & troubleshoot", exact: true })
    .click();
  await expect(page.getByText("Public API key is not a UUID")).toBeVisible();
});

test("workspace tabs support keyboard navigation and deep links", async ({
  page,
}) => {
  await page.goto("/index.html#troubleshooting-title");
  await expect(
    page.getByRole("tab", { name: "2. Test & troubleshoot" }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("tab", { name: "2. Test & troubleshoot" })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "3. Configuration" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "3. Configuration" }).press("Home");
  await expect(
    page.getByRole("tab", { name: "1. Setup", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("mobile page fits the viewport and every input has a label", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "#sandbox input, #sandbox select, #sandbox textarea",
        ),
      ].every((input) => input.labels && input.labels.length > 0),
    ),
  ).toBe(true);
});

test("sandbox styles do not change elements outside its root", async ({
  page,
}) => {
  await page.goto("/index.html");
  const styles = await page.evaluate(() => {
    const host = document.createElement("div");
    const elements = ["main", "nav", "button", "p", "footer", "form"].map(
      (tag) => {
        const el = document.createElement(tag);
        el.textContent = "SDK fixture";
        host.append(el);
        return el;
      },
    );
    document.body.append(host);
    const read = () =>
      elements.map((el) => {
        const style = getComputedStyle(el);
        return Object.fromEntries(
          [
            "maxWidth",
            "padding",
            "display",
            "gap",
            "flexWrap",
            "fontFamily",
            "lineHeight",
            "boxSizing",
          ].map((key) => [key, style[key]]),
        );
      });
    const styled = read();
    document.querySelector("head style").sheet.disabled = true;
    const baseline = read();
    return { styled, baseline };
  });
  expect(styles.styled).toEqual(styles.baseline);
});

test("show widget failures offer a dialog and a route to troubleshooting", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#test`);
  await waitMockReady(page);
  await page.evaluate(() => {
    window.DidomiDSR.widgets.isVisible = () => false;
    window.DidomiDSR.widgets.show = () => {
      throw new Error("Widget unavailable");
    };
  });
  await page.getByRole("button", { name: "Show widget", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page
    .getByRole("button", { name: "Read troubleshooting", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Troubleshooting" }),
  ).toBeFocused();
});

test("troubleshooting captures startup messages and clear keeps findings", async ({
  page,
}) => {
  await blockLive(page);
  await page.goto(`/index.html?${mockQuery}#test`);
  await waitMockReady(page);
  await page.evaluate(() => {
    console.warn("Didomi - No bundle URL for widget test");
    console.warn("Didomi - No bundle URL for widget test");
  });
  await page
    .getByText("Technical evidence: captured runtime messages", { exact: true })
    .click();
  await expect(page.getByText("(×2)")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear captured messages", exact: true })
    .click();
  await expect(page.getByText("No warnings or errors captured")).toBeVisible();
  await expect(page.getByText("Mock mode is on")).toBeVisible();
});
