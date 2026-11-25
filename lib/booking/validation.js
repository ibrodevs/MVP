const { domainToASCII } = require("node:url");
const { config } = require("./config");
const { DateTime } = require("luxon");
function invalid(field) {
  throw Object.assign(Error("Invalid input"), {
    status: 400,
    code: "invalid",
    field,
  });
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("form");
  const c = config();
  const text = (key, min, max) => {
    if (typeof body[key] !== "string") invalid(key);
    const s = body[key].trim().normalize("NFC");
    if (
      s.length < min ||
      s.length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)
    )
      invalid(key);
    return s;
  };
  const service_id = text("service_id", 1, 80);
  if (!c.services.includes(service_id)) invalid("service_id");
  const duration_hours = body.duration_hours;
  if (!Number.isInteger(duration_hours) || !c.prices[duration_hours])
    invalid("duration_hours");
  const start_at = text("start_at", 20, 35);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(start_at) ||
    !DateTime.fromISO(start_at).isValid
  )
    invalid("start_at");
  const customer_name = text("customer_name", 2, 120),
    customer_email = text("customer_email", 3, 254),
    customer_phone = text("customer_phone", 7, 30),
    task_description = text("task_description", 10, 3000);
  const parts = customer_email.split("@");
  if (
    parts.length !== 2 ||
    parts[0].length > 64 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) ||
    parts[0].startsWith(".") ||
    parts[0].endsWith(".") ||
    parts[0].includes("..")
  )
    invalid("customer_email");
  const domain = domainToASCII(parts[1]);
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(
      domain,
    )
  )
    invalid("customer_email");
  if (
    !/^\+[1-9][\d ()-]{6,28}$/.test(customer_phone) ||
    customer_phone.replace(/\D/g, "").length > 15 ||
    customer_phone.replace(/\D/g, "").length < 7
  )
    invalid("customer_phone");
  const company_name = body.company_name ? text("company_name", 0, 160) : "";
  if (body.terms_accepted !== true) invalid("terms_accepted");
  if (body.website) invalid("form");
  if (!["en", "ru", "ar"].includes(body.language)) invalid("language");
  return {
    service_id,
    duration_hours,
    start_at: new Date(start_at).toISOString(),
    customer_name,
    customer_email,
    customer_phone,
    company_name,
    task_description,
    language: body.language,
  };
}
module.exports = { validate };
