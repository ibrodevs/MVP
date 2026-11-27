const { randomUUID } = require("node:crypto");
const smtp = require("./smtp");
const texts = {
  en: {
    subject: "BTE Global — technical SMTP test",
    text: "Technical email delivery test only. This is not a booking, payment receipt or consultation confirmation.",
  },
  ru: {
    subject: "BTE Global — технический тест SMTP",
    text: "Только техническая проверка отправки почты. Это не бронирование, не квитанция об оплате и не подтверждение консультации.",
  },
  ar: {
    subject: "BTE Global — اختبار تقني للبريد",
    text: "اختبار تقني لإرسال البريد فقط. هذه ليست رسالة حجز أو إيصال دفع أو تأكيد استشارة.",
  },
};
function testMessage(language = "en") {
  const lang = texts[language] ? language : "en",
    t = texts[lang];
  // Fixed agreed mailbox. This endpoint can never become an arbitrary-recipient relay.
  return {
    from: smtp.address(process.env.EMAIL_FROM),
    to: "projects@bteglobal.ae",
    subject: t.subject,
    text: t.text,
    html: `<div lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><h2>BTE Global</h2><p>${t.text}</p></div>`,
    messageId: `<smtp-test.${randomUUID()}@bteglobal.ae>`,
  };
}
function safeError(error) {
  if (error.code === "EAUTH") return "smtp_authentication_failed";
  if (
    [
      "ETLS",
      "CERT_HAS_EXPIRED",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
    ].includes(error.code)
  )
    return "smtp_tls_failed";
  if (["SMTP_RECIPIENT_REJECTED", "EENVELOPE"].includes(error.code))
    return "smtp_recipient_rejected";
  return "smtp_operation_failed";
}
async function check(action, language, options = {}) {
  options = {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(40000)])
      : AbortSignal.timeout(40000),
  };
  const missing = smtp.missingSettings();
  if (missing.length)
    return {
      configured: false,
      missing,
      authenticated: false,
      messageSent: false,
    };
  try {
    await smtp.verify(options);
  } catch (e) {
    return {
      configured: true,
      authenticated: false,
      messageSent: false,
      error: safeError(e),
    };
  }
  if (action === "verify")
    return {
      configured: true,
      authenticated: true,
      starttlsRequired: true,
      messageSent: false,
    };
  try {
    const result = await smtp.deliver(testMessage(language), options);
    return {
      configured: true,
      authenticated: true,
      starttlsRequired: true,
      messageSent: true,
      smtpAccepted: result.accepted,
      inboxReceiptVerified: false,
    };
  } catch (e) {
    return {
      configured: true,
      authenticated: true,
      messageSent: false,
      error: safeError(e),
    };
  }
}
module.exports = { testMessage, check };
