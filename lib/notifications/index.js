const nodemailer = require("nodemailer");
const { DateTime } = require("luxon");
const { config } = require("../booking/config");
const copy = {
  en: {
    title: "Your consultation is confirmed",
    service: "Service",
    date: "Date / time",
    duration: "Duration (hours)",
    total: "Paid",
    contact: "Contact",
    company: "New paid consultation",
  },
  ru: {
    title: "Ваша консультация подтверждена",
    service: "Услуга",
    date: "Дата / время",
    duration: "Продолжительность (ч)",
    total: "Оплачено",
    contact: "Контакт",
    company: "Новая оплаченная консультация",
  },
  ar: {
    title: "تم تأكيد استشارتك",
    service: "الخدمة",
    date: "التاريخ والوقت",
    duration: "المدة (ساعات)",
    total: "المدفوع",
    contact: "تواصل",
    company: "استشارة جديدة مدفوعة",
  },
};
const services = {
  en: [
    "Software Development",
    "API Integration",
    "Database Solutions & Data Engineering",
    "Business Process Automation",
    "IT & Technology Consulting",
  ],
  ru: [
    "Разработка ПО",
    "Интеграция API",
    "Базы данных и инженерия данных",
    "Автоматизация бизнес-процессов",
    "IT-консалтинг",
  ],
  ar: [
    "تطوير البرمجيات",
    "تكامل واجهات API",
    "قواعد البيانات وهندسة البيانات",
    "أتمتة عمليات الأعمال",
    "استشارات تكنولوجيا المعلومات",
  ],
};
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function message(b, kind) {
  const lang = b.language,
    t = copy[lang] || copy.en,
    c = config();
  const service = services[lang][c.services.indexOf(b.service_id)];
  const date =
    DateTime.fromJSDate(new Date(b.start_at))
      .setZone(b.timezone)
      .setLocale(lang)
      .toLocaleString(DateTime.DATETIME_FULL) +
    " — " +
    DateTime.fromJSDate(new Date(b.end_at))
      .setZone(b.timezone)
      .toFormat("HH:mm") +
    " · " +
    b.timezone;
  const text =
    `${kind === "company_email" ? t.company : t.title}\nBooking ID: ${b.id}\n${t.service}: ${service}\n${t.date}: ${date}\n${t.duration}: ${b.duration_hours}\n${t.total}: ${(b.amount_minor / 100).toFixed(2)} ${b.currency}\n${t.contact}: projects@bteglobal.ae` +
    (kind === "company_email"
      ? `\n${b.customer_name}\n${b.customer_email}\n${b.customer_phone}\n${b.company_name}\n${b.task_description}`
      : "");
  return {
    subject: kind === "company_email" ? t.company : t.title,
    text,
    html: `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="background:#050B16;color:#F4F7FB;padding:32px;font:16px/1.7 sans-serif"><h2 style="color:#22D3EE">BTE Global</h2><p style="white-space:pre-line">${escape(text)}</p></div>`,
  };
}
function invitation(b) {
  const utc = (d) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  // Intentionally excludes task description, phone, email, company and internal notes.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BTE Global//Consultation//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@bteglobal.ae`,
    `DTSTAMP:${utc(b.paid_at)}`,
    `DTSTART:${utc(b.start_at)}`,
    `DTEND:${utc(b.end_at)}`,
    "SUMMARY:BTE Global consultation",
    "DESCRIPTION:projects@bteglobal.ae",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
async function send(b, kind) {
  if (config().mock && process.env.EMAIL_MODE === "mock") return;
  if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM)
    throw Error("Email not configured");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    requireTLS: process.env.SMTP_PORT !== "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to:
      kind === "customer_email"
        ? b.customer_email
        : process.env.BOOKING_NOTIFICATION_EMAIL || "projects@bteglobal.ae",
    messageId: `<${b.id}.${kind}@bteglobal.ae>`,
    ...message(b, kind),
    ...(kind === "customer_email"
      ? {
          attachments: [
            {
              filename: "consultation.ics",
              content: invitation(b),
              contentType: "text/calendar",
            },
          ],
        }
      : {}),
  });
}
module.exports = { send, message, invitation };
