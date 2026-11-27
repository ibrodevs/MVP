(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    dict = window.BTE_I18N;
  let lang = "en";
  try {
    const saved = localStorage.getItem("ta_lang");
    if (dict[saved]) lang = saved;
  } catch (e) {}
  let c = null,
    service = null,
    duration = 1,
    selected = null,
    date = null,
    month = 0,
    request = 0,
    slots = [],
    busy = false,
    key = null,
    payloadHash = null,
    loadError = null,
    slotError = null,
    loading = false,
    currentError = null;
  const icon = (n) =>
    `<svg aria-hidden="true"><use href="assets/icons.svg#${n}"></use></svg>`;
  const t = (k) => dict[lang][k] || dict[lang].unavailable;
  const locale = () => ({ en: "en-GB", ru: "ru-RU", ar: "ar-AE" })[lang];
  const money = (n) =>
    new Intl.NumberFormat(locale(), {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n / 100);
  const time = (iso) =>
    new Intl.DateTimeFormat(locale(), {
      timeZone: c.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  const dateLabel = (d) =>
    new Intl.DateTimeFormat(locale(), {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(d + "T12:00:00Z"));
  function today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: c.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  async function api(path, options = {}) {
    const r = await fetch("/api/consultations/" + path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    let b;
    try {
      b = await r.json();
    } catch (e) {
      throw { error: "unavailable" };
    }
    if (!r.ok) throw b;
    return b;
  }
  function languages() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.dataset.i18n;
      if (k === "title") el.innerHTML = t(k);
      else el.textContent = t(k);
    });
    document
      .querySelectorAll("[data-lang]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.lang === lang)),
      );
    document
      .querySelector("[data-theme-toggle]")
      ?.setAttribute("aria-label", t("theme"));
    if ($("booking")) {
      document.title = t("book") + " — BTE Global";
      if (c) {
        renderServices();
        renderDurations();
        renderCalendar();
        renderSlots();
        summary();
        notice();
      } else if (loadError) $("notice").textContent = t(loadError);
    } else if (order) renderStatus();
    if (currentError && $("form-error"))
      $("form-error").textContent = t(currentError);
  }
  function notice() {
    $("notice").textContent = loadError
      ? t(loadError)
      : c.demo
        ? t("demo")
        : !c.payment_available
          ? t("payments_unavailable")
          : !c.schedule_ready
            ? t("schedule_unavailable")
            : "";
  }
  function radioKeys(container) {
    container.addEventListener("keydown", (e) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowDown",
          "ArrowUp",
          "Home",
          "End",
        ].includes(e.key)
      )
        return;
      const items = [...container.querySelectorAll("[role=radio]")];
      let n = items.indexOf(document.activeElement);
      if (n < 0) return;
      e.preventDefault();
      n =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : (n +
                (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) +
                items.length) %
              items.length;
      items[n].click();
      container.querySelectorAll("[role=radio]")[n].focus();
    });
  }
  function renderServices() {
    $("services").replaceChildren();
    const names = dict[lang].services,
      descs = dict[lang].descriptions;
    c.services.forEach((id, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "service";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(service === id));
      b.tabIndex = service === id || (!service && i === 0) ? 0 : -1;
      b.innerHTML =
        icon(["code-xml", "unplug", "database", "workflow", "compass"][i]) +
        `<span><strong>${names[i]}</strong><small>${descs[i]}</small></span>`;
      b.onclick = () => {
        service = id;
        renderServices();
        summary();
      };
      $("services").append(b);
    });
  }
  function renderDurations() {
    $("durations").replaceChildren();
    Object.entries(c.prices).forEach(([h, price]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "duration";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(duration === Number(h)));
      b.tabIndex = duration === Number(h) ? 0 : -1;
      b.innerHTML = `<span>${h} ${t(Number(h) === 1 ? "hour" : "hours")}</span><small>${money(price)}</small>`;
      b.onclick = () => {
        duration = Number(h);
        selected = null;
        renderDurations();
        summary();
        if (date) fetchSlots();
      };
      $("durations").append(b);
    });
  }
  function monthDate(offset) {
    const d = new Date(today() + "T12:00:00Z");
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1, 12),
    );
  }
  function renderCalendar() {
    const maxMonth = Math.ceil(c.horizon_days / 28),
      d = monthDate(month),
      year = d.getUTCFullYear(),
      m = d.getUTCMonth();
    $("month").replaceChildren();
    for (let i = 0; i <= maxMonth; i++) {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = new Intl.DateTimeFormat(locale(), {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }).format(monthDate(i));
      $("month").append(o);
    }
    $("month").value = month;
    $("month").setAttribute("aria-label", t("schedule"));
    $("previous").disabled = month === 0;
    $("next").disabled = month === maxMonth;
    $("previous").setAttribute("aria-label", t("previous"));
    $("next").setAttribute("aria-label", t("next"));
    $("weekdays").replaceChildren();
    for (let i = 0; i < 7; i++) {
      const span = document.createElement("span");
      span.textContent = new Intl.DateTimeFormat(locale(), {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, 0, 1 + i)));
      $("weekdays").append(span);
    }
    $("days").replaceChildren();
    const offset = (d.getUTCDay() + 6) % 7;
    for (let i = 0; i < offset; i++)
      $("days").append(document.createElement("span"));
    const limit = new Date(today() + "T12:00:00Z");
    limit.setUTCDate(limit.getUTCDate() + c.horizon_days);
    for (let n = 1; n <= new Date(Date.UTC(year, m + 1, 0)).getUTCDate(); n++) {
      const stamp = `${year}-${String(m + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`,
        b = document.createElement("button");
      b.type = "button";
      b.textContent = new Intl.NumberFormat(locale()).format(n);
      b.disabled =
        stamp < today() ||
        stamp > limit.toISOString().slice(0, 10) ||
        !c.schedule_ready;
      b.className = stamp === today() ? "today" : "";
      b.setAttribute("aria-label", dateLabel(stamp));
      b.setAttribute("aria-pressed", String(date === stamp));
      b.onclick = () => {
        date = stamp;
        selected = null;
        renderCalendar();
        summary();
        fetchSlots();
      };
      $("days").append(b);
    }
  }
  async function fetchSlots() {
    const r = ++request;
    loading = true;
    slotError = null;
    slots = [];
    selected = null;
    renderSlots();
    summary();
    try {
      const b = await api(`availability?date=${date}&duration=${duration}`);
      if (r !== request) return;
      slots = b.slots;
    } catch (e) {
      if (r !== request) return;
      slotError = e.error || "unavailable";
    } finally {
      if (r === request) {
        loading = false;
        renderSlots();
        summary();
      }
    }
  }
  function renderSlots() {
    $("slots").replaceChildren();
    const message = loading
      ? "loading"
      : slotError || (!date ? "selectDate" : !slots.length ? "noSlots" : null);
    if (message) {
      const p = document.createElement("p");
      p.className = "slot-message";
      p.textContent = t(message);
      $("slots").append(p);
      return;
    }
    slots.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.textContent = time(s.start);
      b.setAttribute("aria-pressed", String(selected?.start === s.start));
      b.onclick = () => {
        selected = s;
        renderSlots();
        summary();
      };
      $("slots").append(b);
    });
  }
  function validField(el) {
    const value = el.value.trim();
    if (el.required && !value) return false;
    if (el.id === "customer_name" && value.length < 2) return false;
    if (el.id === "task_description" && value.length < 10) return false;
    if (el.type === "tel") {
      const n = value.replace(/\D/g, "");
      if (
        n.length < 7 ||
        n.length > 15 ||
        !/^\+[1-9][\d ()-]{6,28}$/.test(value)
      )
        return false;
    }
    return el.checkValidity();
  }
  function ready() {
    return (
      c?.payment_available &&
      service &&
      selected &&
      !busy &&
      !loading &&
      $("terms").checked &&
      [...$("booking").querySelectorAll(".field input,.field textarea")].every(
        validField,
      )
    );
  }
  function summary() {
    const empty = t("notSelected");
    $("summary-selectedService").textContent = service
      ? dict[lang].services[c.services.indexOf(service)]
      : empty;
    $("summary-date").textContent = date ? dateLabel(date) : empty;
    $("summary-start").textContent = selected ? time(selected.start) : "—";
    $("summary-end").textContent = selected ? time(selected.end) : "—";
    $("summary-timezone").textContent = t("zoneName") + " · " + c.timezone;
    $("summary-duration").textContent =
      duration + " " + t(duration === 1 ? "hour" : "hours");
    $("summary-currency").textContent = "USD";
    $("total").textContent = money(c.prices[duration]);
    $("submit").disabled = !ready();
    $("submit").textContent = t(busy ? "processing" : "proceed");
  }
  let order = null;
  async function status() {
    const [id, token] = location.hash.slice(1).split(":");
    if (!id || !token) {
      $("payment-error").textContent = t("unavailable");
      return;
    }
    $("booking-id").textContent = id;
    try {
      order = await api("status?id=" + encodeURIComponent(id), {
        headers: { Authorization: "Bearer " + token },
      });
      renderStatus();
    } catch (e) {
      $("payment-error").textContent = t(e.error);
    }
  }
  function renderStatus() {
    if (!order) return;
    $("booking-status").textContent = t(order.booking_status);
    $("payment-status").textContent = t(order.payment_status);
    $("payment-total").textContent = money(order.amount_minor) + " · USD";
    $("mock-pay").hidden = !(
      c?.payment_available &&
      order.booking_status === "pending_payment" &&
      order.payment_status === "pending"
    );
    $("payment-notice").textContent = c?.payment_available
      ? t("mockLabel")
      : t("payments_unavailable");
  }
  async function init() {
    languages();
    document.querySelectorAll("[data-lang]").forEach(
      (b) =>
        (b.onclick = () => {
          lang = b.dataset.lang;
          try {
            localStorage.setItem("ta_lang", lang);
          } catch (e) {}
          languages();
        }),
    );
    try {
      c = await api("config");
    } catch (e) {
      loadError = e.error || "unavailable";
      if ($("notice")) $("notice").textContent = t(loadError);
      else $("payment-error").textContent = t(loadError);
      return;
    }
    if (!$("booking")) {
      $("refresh").onclick = status;
      $("mock-pay").onclick = async () => {
        const b = $("mock-pay");
        b.disabled = true;
        const [id, token] = location.hash.slice(1).split(":");
        try {
          await api("mock-payment", {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
            body: JSON.stringify({ id }),
          });
          location.href = "payment-success.html#" + id + ":" + token;
        } catch (e) {
          $("payment-error").textContent = t(e.error);
        } finally {
          b.disabled = false;
        }
      };
      await status();
      return;
    }
    languages();
    radioKeys($("services"));
    radioKeys($("durations"));
    $("month").onchange = (e) => {
      month = Number(e.target.value);
      renderCalendar();
    };
    $("previous").onclick = () => {
      month--;
      renderCalendar();
    };
    $("next").onclick = () => {
      month++;
      renderCalendar();
    };
    $("booking").addEventListener("input", (e) => {
      e.target.removeAttribute("aria-invalid");
      currentError = null;
      $("form-error").textContent = "";
      summary();
    });
    $("booking")
      .querySelectorAll(".field input,.field textarea")
      .forEach((el) =>
        el.addEventListener("blur", () => {
          el.setAttribute("aria-invalid", String(!validField(el)));
          if (!validField(el)) {
            currentError = "invalid";
            $("form-error").textContent = t(currentError);
          }
        }),
      );
    $("booking").onsubmit = async (e) => {
      e.preventDefault();
      if (!ready()) return;
      busy = true;
      summary();
      currentError = null;
      $("form-error").textContent = "";
      const body = {
        service_id: service,
        duration_hours: duration,
        start_at: selected.start,
        language: lang,
        terms_accepted: $("terms").checked,
        website: $("booking").elements.website.value,
      };
      document
        .querySelectorAll(".field input,.field textarea")
        .forEach((el) => (body[el.name] = el.value.trim()));
      const serialized = JSON.stringify(body);
      if (payloadHash !== serialized) {
        key = crypto.randomUUID();
        payloadHash = serialized;
      }
      try {
        const order = await api("bookings", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: serialized,
        });
        location.assign(order.checkout_url);
      } catch (err) {
        currentError = err.error;
        $("form-error").textContent = t(currentError);
        if (err.field && $(err.field)) {
          $(err.field).setAttribute("aria-invalid", "true");
          $(err.field).focus();
        }
        if (err.error === "slot_unavailable") fetchSlots();
        if (err.error === "idempotency_conflict") payloadHash = null;
      } finally {
        busy = false;
        summary();
      }
    };
  }
  init();
})();
