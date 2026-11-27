const smtp = require("./smtp");
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
    testNotice: "PREVIEW TEST — mock payment; no real charge.",
    bookingId: "Booking ID",
    name: "Full name",
    email: "Email",
    phone: "Phone",
    companyName: "Company",
    task: "Task description",
    status: "Payment status",
    paid: "Paid",
  },
  ru: {
    title: "Ваша консультация подтверждена",
    service: "Услуга",
    date: "Дата / время",
    duration: "Продолжительность (ч)",
    total: "Оплачено",
    contact: "Контакт",
    company: "Новая оплаченная консультация",
    testNotice: "ТЕСТ PREVIEW — тестовая оплата, реального списания нет.",
    bookingId: "Номер бронирования",
    name: "Полное имя",
    email: "Электронная почта",
    phone: "Телефон",
    companyName: "Компания",
    task: "Описание задачи",
    status: "Статус оплаты",
    paid: "Оплачено",
  },
  ar: {
    title: "تم تأكيد استشارتك",
    service: "الخدمة",
    date: "التاريخ والوقت",
    duration: "المدة (ساعات)",
    total: "المدفوع",
    contact: "تواصل",
    company: "استشارة جديدة مدفوعة",
    testNotice: "اختبار PREVIEW — دفع تجريبي دون خصم حقيقي.",
    bookingId: "رقم الحجز",
    name: "الاسم الكامل",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    companyName: "الشركة",
    task: "وصف المهمة",
    status: "حالة الدفع",
    paid: "مدفوع",
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
  const lang = ["en", "ru", "ar"].includes(b.language) ? b.language : "en",
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
    (c.mock ? t.testNotice + "\n\n" : "") +
    `${kind === "company_email" ? t.company : t.title}\n${t.bookingId}: ${b.id}\n${t.service}: ${service}\n${t.date}: ${date}\n${t.duration}: ${b.duration_hours}\n${t.total}: ${(b.amount_minor / 100).toFixed(2)} ${b.currency}\n${t.status}: ${t.paid}\n${t.contact}: projects@bteglobal.ae` +
    (kind === "company_email"
      ? `\n${t.name}: ${b.customer_name}\n${t.email}: ${b.customer_email}\n${t.phone}: ${b.customer_phone}\n${t.companyName}: ${b.company_name}\n${t.task}: ${b.task_description}`
      : "");
  return {
    subject:
      (c.mock ? "[PREVIEW TEST] " : "") +
      "BTE Global · " +
      (kind === "company_email" ? t.company : t.title),
    text,
    html: `<div lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}" style="background:#050B16;color:#F4F7FB;padding:32px;font:16px/1.7 sans-serif"><h2 style="color:#22D3EE">BTE Global</h2><p style="white-space:pre-line">${escape(text)}</p></div>`,
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
    "SUMMARY:BTE Global · " + (copy[b.language] || copy.en).title,
    "DESCRIPTION:projects@bteglobal.ae",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
function requirePaidBooking(b, kind) {
  if (
    !["customer_email", "company_email"].includes(kind) ||
    b.payment_status !== "paid" ||
    !b.paid_at ||
    b.booking_status !== "confirmed" ||
    !b.calendar_event_id
  )
    throw Object.assign(
      Error("Notification requires a paid, calendar-confirmed booking"),
      { code: "NOTIFICATION_NOT_READY" },
    );
}
async function send(b, kind, options = {}) {
  requirePaidBooking(b, kind);
  if (config().mock && process.env.EMAIL_MODE === "mock") return { mock: true };
  if (process.env.EMAIL_MODE !== "smtp")
    throw Error("SMTP delivery is not enabled");
  const recipient = smtp.address(
    kind === "customer_email"
      ? b.customer_email
      : process.env.BOOKING_NOTIFICATION_EMAIL || "projects@bteglobal.ae",
  );
  return smtp.deliver(
    {
      from: smtp.address(process.env.EMAIL_FROM),
      to: recipient,
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
    },
    options,
  );
}
module.exports = { send, message, invitation, requirePaidBooking };
