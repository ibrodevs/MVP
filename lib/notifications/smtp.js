const nodemailer = require("nodemailer");
function missingSettings(env = process.env) {
  return ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"].filter(
    (key) => typeof env[key] !== "string" || !env[key].trim(),
  );
}
function address(value) {
  if (
    typeof value !== "string" ||
    !/^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/u.test(value)
  )
    throw Error("Invalid mail address");
  return value;
}
function smtpOptions(env = process.env) {
  if (missingSettings(env).length)
    throw Object.assign(Error("SMTP configuration is incomplete"), {
      code: "SMTP_NOT_CONFIGURED",
    });
  if (Number(env.SMTP_PORT || 587) !== 587)
    throw Error("SMTP port 587 with mandatory STARTTLS is required");
  const host = env.SMTP_HOST.trim();
  if (!/^[a-z0-9.-]+$/i.test(host)) throw Error("Invalid SMTP host");
  address(env.SMTP_USER);
  address(env.EMAIL_FROM);
  return {
    host,
    port: 587,
    secure: false,
    requireTLS: true,
    ignoreTLS: false,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: host },
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 5000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
async function withSmtp(
  operation,
  {
    signal,
    transportFactory = nodemailer.createTransport,
    env = process.env,
  } = {},
) {
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
    : AbortSignal.timeout(30000);
  bounded.throwIfAborted();
  const transport = transportFactory(smtpOptions(env));
  let abort;
  try {
    const stopped = new Promise((_, reject) => {
      abort = () => {
        transport.close();
        reject(
          Object.assign(Error("SMTP operation timed out"), {
            code: "SMTP_TIMEOUT",
          }),
        );
      };
      bounded.addEventListener("abort", abort, { once: true });
    });
    return await Promise.race([
      Promise.resolve().then(() => operation(transport)),
      stopped,
    ]);
  } finally {
    bounded.removeEventListener("abort", abort);
    transport.close();
  }
}
async function verify(options) {
  await withSmtp((t) => t.verify(), options);
  return { authenticated: true, starttlsRequired: true };
}
async function deliver(mail, options) {
  address(typeof mail.to === "string" ? mail.to : mail.to?.address);
  const info = await withSmtp(
    (t) =>
      t.sendMail({ ...mail, disableFileAccess: true, disableUrlAccess: true }),
    options,
  );
  if (info.accepted?.length !== 1 || info.rejected?.length)
    throw Object.assign(Error("SMTP recipient was not accepted"), {
      code: "SMTP_RECIPIENT_REJECTED",
    });
  return { accepted: true, acceptedCount: 1 };
}
module.exports = {
  smtpOptions,
  missingSettings,
  address,
  withSmtp,
  verify,
  deliver,
};
