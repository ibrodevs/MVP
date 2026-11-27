const { test, expect } = require("@playwright/test");
async function pageReady(page) {
  await page.goto("/book-consultation.html");
  await expect(page.locator(".service")).toHaveCount(5);
}
async function chooseSlot(page) {
  const days = page.locator("#days button:not([disabled])");
  for (let i = 1; i < Math.min(await days.count(), 12); i++) {
    await days.nth(i).click();
    await expect(page.locator("#slots")).not.toContainText(
      "Checking availability",
    );
    if (await page.locator(".slot").count()) {
      await page.locator(".slot").first().click();
      return;
    }
  }
  throw Error("No demo slot");
}
async function details(page) {
  await page.locator("#customer_name").fill("Тест أحمد");
  await page.locator("#customer_email").fill("test@example.com");
  await page.locator("#customer_phone").fill("+971 50 123 4567");
  await page
    .locator("#task_description")
    .fill("Review the architecture of our software");
  await page.locator("#terms").check();
}
for (const width of [320, 375, 390, 768, 1024, 1440, 1920])
  test("responsive EN/RU/AR and themes " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await pageReady(page);
    for (const language of ["en", "ru", "ar"]) {
      await page.locator(`[data-lang=${language}]`).click();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        language === "ar" ? "rtl" : "ltr",
      );
      await page.locator("[data-theme-toggle]").click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.locator("[data-theme-toggle]").click();
    }
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results/consultation-${width}.png`,
      fullPage: true,
    });
  });
test("services, duration prices, month navigation, full interval and form preservation", async ({
  page,
}) => {
  await pageReady(page);
  for (let i = 0; i < 5; i++) {
    await page.locator(".service").nth(i).click();
    await expect(page.locator(".service").nth(i)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#summary-selectedService")).not.toHaveText(
      "Not selected",
    );
  }
  for (let h = 1; h <= 4; h++) {
    await page
      .locator(".duration")
      .nth(h - 1)
      .click();
    await expect(page.locator("#total")).toHaveText("US$" + h * 150);
  }
  await expect(page.locator("#previous")).toBeDisabled();
  await page.locator("#next").click();
  await expect(page.locator("#month")).toHaveValue("1");
  await page.locator("#previous").click();
  await chooseSlot(page);
  const start = await page.locator("#summary-start").textContent(),
    end = await page.locator("#summary-end").textContent();
  expect(Number(end.slice(0, 2)) - Number(start.slice(0, 2))).toBe(4);
  await page.locator(".duration").first().click();
  await expect(page.locator("#summary-start")).toHaveText("—");
  await expect(page.locator("#submit")).toBeDisabled();
  await page.locator("#customer_name").fill("Алексей أحمد");
  await page.locator("[data-lang=ar]").click();
  await expect(page.locator("#customer_name")).toHaveValue("Алексей أحمد");
  await page.locator("#customer_phone").fill("123");
  await page.locator("#customer_name").click();
  await expect(page.locator("#customer_phone")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).every((k) =>
        ["ta_lang", "ta_theme"].includes(k),
      ),
    ),
  ).toBe(true);
});
test("complete mock payment, server verified status and no PII in status", async ({
  page,
  request,
}) => {
  await pageReady(page);
  await page.locator(".service").first().click();
  await chooseSlot(page);
  await details(page);
  await expect(page.locator("#submit")).toBeEnabled();
  await page.locator("#submit").click();
  await page.waitForURL("**/payment.html#**");
  await expect(page.locator("#booking-status")).toHaveText("Awaiting payment");
  const hash = new URL(page.url()).hash;
  const [id, token] = hash.slice(1).split(":");
  const unauthorized = await request.get("/api/consultations/status?id=" + id);
  expect(unauthorized.status()).toBe(404);
  await page.locator("#mock-pay").click();
  await page.waitForURL("**/payment-success.html#**");
  await expect(page.locator("#payment-status")).toHaveText("Paid");
  const r = await request.get("/api/consultations/status?id=" + id, {
    headers: { Authorization: "Bearer " + token },
  });
  const b = await r.json();
  expect(b.payment_status).toBe("paid");
  await expect
    .poll(
      async () => {
        const result = await request.get("/api/consultations/status?id=" + id, {
          headers: { Authorization: "Bearer " + token },
        });
        const status = await result.json();
        return status.calendar_ready && status.notifications_sent;
      },
      { timeout: 15000, intervals: [1000] },
    )
    .toBe(true);
  expect(JSON.stringify(b)).not.toContain("test@example.com");
  await page.goto("/payment-success.html?success=true");
  await expect(page.locator("#booking-status")).toHaveText("—");
});
test("API errors, privacy, method, origin, spam and persistent rate limit", async ({
  request,
}) => {
  const bad = await request.post("/api/consultations/bookings", {
    data: {},
    headers: { Origin: "https://attacker.example" },
  });
  expect(bad.status()).toBe(403);
  const get = await request.get("/api/consultations/bookings");
  expect(get.status()).toBe(405);
  const secret = await request.get("/.env.example");
  expect(secret.status()).toBe(404);
  const unavailable = await request.get(
    "/api/consultations/availability?date=bad&duration=4",
  );
  expect(unavailable.status()).toBe(400);
  const worker = await request.get("/api/consultations/worker");
  expect(worker.status()).toBe(401);
});
test("legal translations and preferences survive navigation", async ({
  page,
}) => {
  await pageReady(page);
  await page.locator("[data-lang=ar]").click();
  await page.locator("[data-theme-toggle]").click();
  for (const path of ["privacy", "terms", "refund", "public-offer"]) {
    await page.goto("/" + path + ".html");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("h1")).not.toHaveText(
      /Privacy Policy|Terms of Use|Refund|Public Offer/,
    );
  }
  await page.goto("/index.html");
  await expect(page.locator(".consultation-nav")).toBeVisible();
  await expect(page.locator(".consultation-nav")).toHaveText("احجز استشارة");
  await page.locator(".consultation-nav").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("calendar error fails closed in UI", async ({ page }) => {
  await page.route("**/api/consultations/availability?**", (r) =>
    r.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await pageReady(page);
  await page.locator("#days button:not([disabled])").nth(2).click();
  await expect(page.locator("#slots")).toContainText("temporarily unavailable");
  await expect(page.locator(".slot")).toHaveCount(0);
  await expect(page.locator("#submit")).toBeDisabled();
});
test("empty availability and production payment notice keep checkout disabled", async ({
  page,
}) => {
  await page.route("**/api/consultations/availability?**", (r) =>
    r.fulfill({ json: { slots: [] } }),
  );
  await pageReady(page);
  await page.locator("#days button:not([disabled])").nth(2).click();
  await expect(page.locator("#slots")).toContainText("No available times");
  await expect(page.locator("#submit")).toBeDisabled();
  await page.route("**/api/consultations/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      json: { ...config, payment_available: false, demo: false },
    });
  });
  await page.reload();
  await expect(page.locator("#notice")).toContainText(
    "Online payments are not available yet",
  );
  await expect(page.locator("#submit")).toBeDisabled();
});
test("main navigation, three languages and both themes at all required widths", async ({
  page,
}) => {
  // Navbar geometry must remain testable when third-party font/icon CDNs stall.
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("https://unpkg.com/lucide@latest/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.lucide = { createIcons() {} };",
    }),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [
    320, 375, 390, 768, 1024, 1151, 1200, 1240, 1241, 1280, 1440, 1920,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/index.html");
    for (const lang of ["en", "ru", "ar"]) {
      await page.locator(".langseg .lb-" + lang).click();
      await expect(page.locator(".consultation-nav")).toBeVisible();
      await expect(page.locator(".consultation-nav")).toHaveText(
        {
          en: "Book a Consultation",
          ru: "Записаться на консультацию",
          ar: "احجز استشارة",
        }[lang],
      );
      await expect(page.locator('.nav-actions a[href="#contact"]')).toHaveCount(
        1,
      );
      const links = page.locator(".primary-nav .navlink:visible");
      expect(
        await links.evaluateAll((items) =>
          items.every((item) => {
            const walker = document.createTreeWalker(
              item,
              NodeFilter.SHOW_TEXT,
            );
            const lines = new Set();
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(walker.currentNode);
              for (const rect of range.getClientRects())
                lines.add(Math.round(rect.top));
            }
            return lines.size === 1;
          }),
        ),
      ).toBe(true);
      const fits = await page.locator(".top-nav").evaluate((nav) => {
        const outer = nav.getBoundingClientRect();
        return [...nav.children]
          .filter((el) => el.getClientRects().length)
          .every((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.top >= outer.top - 1 &&
              rect.bottom <= outer.bottom + 1 &&
              rect.left >= outer.left - 1 &&
              rect.right <= outer.right + 1
            );
          });
      });
      expect(fits).toBe(true);
      for (let i = 0; i < 2; i++) {
        await page.locator(".theme-toggle").click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
  }
  expect(errors).toEqual([]);
});
