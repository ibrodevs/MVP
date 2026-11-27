const http = require("node:http"),
  fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  if (process.argv.includes("--demo")) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL)
      throw Error("Local demo forbidden");
    Object.assign(process.env, {
      NODE_ENV: "test",
      PAYMENT_MODE: "mock",
      BOOKING_DEMO_SCHEDULE: "true",
      CALENDAR_MODE: "mock",
      EMAIL_MODE: "mock",
    });
    const { testDatabase } = require("./test-database");
    require("../lib/booking/db").useTestDatabase(await testDatabase());
    console.log(
      "LOCAL DEMO: PostgreSQL test engine, demo calendar, mock email and payments. Data resets on restart.",
    );
  }
  const root = process.cwd(),
    types = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".xml": "application/xml",
      ".txt": "text/plain",
    };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/consultations/")) {
        const name = url.pathname.split("/").at(-1);
        if (
          ![
            "config",
            "availability",
            "bookings",
            "status",
            "mock-payment",
            "worker",
            "smtp-check",
    "calendar-check",
          ].includes(name)
        ) {
          res.writeHead(404);
          res.end();
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 16384) {
            res.writeHead(413);
            res.end();
            return;
          }
        }
        req.body = body ? JSON.parse(body) : undefined;
        req.query = Object.fromEntries(url.searchParams);
        res.status = (n) => {
          res.statusCode = n;
          return res;
        };
        res.json = (b) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(b));
        };
        await require("../api/consultations/" + name)(req, res);
        return;
      }
      const file = path.resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      const relative = path.relative(root, file);
      if (
        relative.startsWith("..") ||
        relative.split(path.sep).some((p) => p.startsWith(".")) ||
        (![
          "index.html",
          "book-consultation.html",
          "consultation.css",
          "consultation.js",
          "consultation-i18n.js",
          "preferences.js",
          "support.js",
          "legal.js",
          "legal.css",
          "privacy.html",
          "terms.html",
          "refund.html",
          "public-offer.html",
          "disclaimer.html",
          "payment.html",
          "payment-success.html",
          "payment-cancelled.html",
          "payment-failed.html",
          "logo.png",
          "sitemap.xml",
          "robots.txt",
        ].includes(relative) &&
          !relative.startsWith("assets" + path.sep))
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const data = await fs.readFile(file);
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.end(data);
    } catch (e) {
      res.writeHead(400);
      res.end("Request unavailable");
    }
  });
  server.listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
    console.log("Local: http://localhost:" + (process.env.PORT || 3000)),
  );
  if (process.env.NODE_ENV === "test") {
    const worker = setInterval(
      () =>
        require("../lib/booking/worker")
          .work()
          .catch(() => {}),
      3000,
    );
    worker.unref();
  }
})();
