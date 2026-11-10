import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Joi from 'joi';

// Anchored to the backend folder, so the app starts the same from any working directory.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

/**
 * Centralised, validated environment configuration.
 * The process refuses to boot when a required variable is missing or malformed,
 * so misconfiguration is caught at deploy time instead of at request time.
 */
const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(5000),
  APP_NAME: Joi.string().default('Freejobwala'),
  API_PREFIX: Joi.string().default('/api/v1'),
  APP_URL: Joi.string().uri().default('http://localhost:5000'),
  WEB_URL: Joi.string().uri().default('http://localhost:3000'),
  ADMIN_URL: Joi.string().uri().default('http://localhost:3001'),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:3000,http://localhost:3001'),
  TRUST_PROXY: Joi.alternatives(Joi.number(), Joi.boolean(), Joi.string()).default(1),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),

  MONGODB_URI: Joi.string().required(),
  MONGODB_DB_NAME: Joi.string().default('freejobwala'),
  MONGODB_MAX_POOL: Joi.number().default(50),
  MONGODB_AUTO_INDEX: Joi.boolean().default(true),

  REDIS_URL: Joi.string().allow('').default(''),
  // sensitive = only auth / OTP / form limits use Redis (saves Upstash commands) | all | none
  REDIS_RATE_LIMIT_SCOPE: Joi.string().valid('sensitive', 'all', 'none').default('sensitive'),
  // Needed only when more than one API instance runs (each emit costs Redis commands)
  REDIS_SOCKET_ADAPTER: Joi.boolean().default(false),
  REDIS_QUEUE_ENABLED: Joi.boolean().default(true),
  QUEUE_DRAIN_DELAY_SECONDS: Joi.number().min(5).default(120),
  QUEUE_STALLED_INTERVAL_MS: Joi.number().min(30000).default(300000),
  QUEUE_CONCURRENCY: Joi.number().min(1).default(5),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: Joi.number().default(30),
  JWT_ISSUER: Joi.string().default('freejobwala'),
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  COOKIE_DOMAIN: Joi.string().allow('').default(''),
  COOKIE_SECURE: Joi.boolean().default(false),

  OTP_TTL_SECONDS: Joi.number().default(300),
  OTP_MAX_ATTEMPTS: Joi.number().default(5),
  OTP_DEV_BYPASS: Joi.boolean().default(false),

  GOOGLE_CLIENT_IDS: Joi.string().allow('').default(''),

  // e-mail: brevo (production) | console (dev - logs only)
  EMAIL_PROVIDER: Joi.string().valid('brevo', 'console').default('console'),
  MAIL_FROM_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .allow('')
    .default(''),
  MAIL_FROM_NAME: Joi.string().default('Freejobwala'),
  MAIL_REPLY_TO: Joi.string()
    .email({ tlds: { allow: false } })
    .allow('')
    .default(''),
  BREVO_API_KEY: Joi.string().allow('').default(''),
  BREVO_API_URL: Joi.string().uri().default('https://api.brevo.com/v3'),
  BREVO_WEBHOOK_TOKEN: Joi.string().allow('').default(''),
  BREVO_SANDBOX: Joi.boolean().default(false),
  EMAIL_TIMEOUT_MS: Joi.number().default(15000),

  SMS_PROVIDER: Joi.string().valid('console', 'apitxt').default('console'),
  SENTRY_DSN: Joi.string().uri().allow('').default(''),
  SENTRY_ENVIRONMENT: Joi.string().allow('').default(''),
  SENTRY_RELEASE: Joi.string().allow('').default(''),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0),
  ATLAS_SEARCH_INDEX: Joi.string().allow('').default(''),
  APITXT_BASE_URL: Joi.string().uri().default('https://apitxt.com'),
  APITXT_AUTH_KEY: Joi.string().allow('').default(''),
  APITXT_API_KEY: Joi.string().allow('').default(''), // Bearer token; either key fills in for the other
  APITXT_SENDER_ID: Joi.string().allow('').default(''), // DLT approved 6-char header
  APITXT_ROUTE: Joi.string().default('4'), // 4 = transactional, 1 = promotional
  APITXT_PE_ID: Joi.string().allow('').default(''), // DLT principal entity id
  // OTP: "otp_api" = Unified OTP API (/api/sendOTP, no DLT template needed); "dlt" = DLT template SMS via /api/sendMsg.
  APITXT_OTP_MODE: Joi.string().valid('dlt', 'otp_api').default('otp_api'),
  APITXT_OTP_CHANNEL: Joi.string().valid('sms', 'whatsapp', 'voice').default('sms'),
  APITXT_OTP_TEMPLATE_ID: Joi.string().allow('').default(''), // optional: apitxt dashboard SMS template id (sms channel)
  APITXT_OTP_TEMPLATE_NAME: Joi.string().allow('').default(''), // optional: WhatsApp template name (whatsapp channel)
  APITXT_TEMPLATE_OTP: Joi.string().allow('').default(''),
  APITXT_TEMPLATE_INTERVIEW: Joi.string().allow('').default(''),
  APITXT_TEMPLATE_INTERVIEW_REMINDER: Joi.string().allow('').default(''),
  APITXT_TEMPLATE_GENERIC: Joi.string().allow('').default(''),
  APITXT_TEMPLATE_BULK: Joi.string().allow('').default(''),
  SMS_TIMEOUT_MS: Joi.number().default(10000),

  WHATSAPP_PROVIDER: Joi.string().valid('console', 'meta').default('console'),
  WHATSAPP_TOKEN: Joi.string().allow('').default(''),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').default(''),
  WHATSAPP_TEMPLATE_LANG: Joi.string().default('en'),

  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().allow('').default(''),

  // local (dev only) | r2 (production)
  STORAGE_DRIVER: Joi.string().valid('local', 'r2').default('local'),
  LOCAL_UPLOAD_DIR: Joi.string().default('uploads'),
  R2_ACCOUNT_ID: Joi.string().allow('').default(''),
  R2_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  R2_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  R2_PUBLIC_BUCKET: Joi.string().allow('').default(''),
  R2_PRIVATE_BUCKET: Joi.string().allow('').default(''),
  R2_PUBLIC_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .default(''),

  RAZORPAY_KEY_ID: Joi.string().allow('').default(''),
  RAZORPAY_KEY_SECRET: Joi.string().allow('').default(''),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().allow('').default(''),

  COMPANY_GSTIN: Joi.string().allow('').default(''),
  COMPANY_STATE_CODE: Joi.string().default('08'),
  COMPANY_LEGAL_NAME: Joi.string().default('Freejobwala'),
  COMPANY_ADDRESS: Joi.string().allow('').default(''),

  RUN_SCHEDULER: Joi.boolean().default(true),
  RUN_WORKERS: Joi.boolean().default(true),
})
  .unknown(true)
  .required();

const { value: env, error } = schema.validate(process.env, { abortEarly: false, convert: true });

/** Provider keys that must be present in production so messages never silently go nowhere. */
function productionChecks(e) {
  if (e.NODE_ENV !== 'production' && !e.__all) return [];
  const missing = [];
  if (/^redis:\/\/.*upstash\.io/i.test(e.REDIS_URL)) missing.push('REDIS_URL');
  const need = (cond, key) => cond && !e[key] && missing.push(key);
  need(e.EMAIL_PROVIDER === 'brevo', 'BREVO_API_KEY');
  need(e.EMAIL_PROVIDER === 'brevo', 'MAIL_FROM_EMAIL');
  return missing.map((k) =>
    k === 'REDIS_URL' ? 'REDIS_URL must start with rediss:// for Upstash (TLS)' : `${k} is required in production`,
  );
}

/** Launch keys that may arrive after the first deploy. The app boots, but these features stay off. */
function launchWarnings(e) {
  if (e.NODE_ENV !== 'production') return [];
  const warnings = [];
  const missing = (cond, keys, effect) => {
    const empty = keys.filter((k) => !e[k]);
    if (cond && empty.length) warnings.push(`${empty.join(', ')} not set: ${effect}`);
  };
  const dlt = e.SMS_PROVIDER === 'apitxt' && e.APITXT_OTP_MODE === 'dlt';
  missing(e.SMS_PROVIDER === 'apitxt' && !e.APITXT_API_KEY, ['APITXT_AUTH_KEY'], 'SMS will fail');
  missing(dlt, ['APITXT_SENDER_ID', 'APITXT_PE_ID', 'APITXT_TEMPLATE_OTP'], 'OTP SMS will fail');
  missing(e.SMS_PROVIDER === 'apitxt', ['APITXT_SENDER_ID', 'APITXT_PE_ID'], 'non-OTP SMS (interview, alerts, bulk) fail and are logged until DLT is set up');
  missing(e.RAZORPAY_KEY_ID, ['COMPANY_GSTIN', 'COMPANY_ADDRESS'], 'tax invoices will be incomplete');
  return warnings;
}

/**
 * R2 public access applies to a whole bucket, so private files need a bucket of their own.
 * Local disk is refused in production because uploads would be lost on redeploy.
 */
function storageChecks(e) {
  const errors = [];
  if (e.NODE_ENV === 'production' && e.STORAGE_DRIVER !== 'r2') errors.push('STORAGE_DRIVER must be r2 in production');
  if (e.STORAGE_DRIVER !== 'r2') return errors;
  for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BUCKET', 'R2_PRIVATE_BUCKET', 'R2_PUBLIC_URL']) {
    if (!e[key]) errors.push(`${key} is required when STORAGE_DRIVER=r2`);
  }
  if (e.R2_PUBLIC_BUCKET && e.R2_PUBLIC_BUCKET === e.R2_PRIVATE_BUCKET) errors.push('R2_PUBLIC_BUCKET and R2_PRIVATE_BUCKET must be different buckets');
  return errors;
}

const prodErrors = error ? [] : [...productionChecks(env), ...storageChecks(env)];
if (prodErrors.length) {
  console.error(`Invalid environment configuration:\n${prodErrors.map((m) => ` - ${m}`).join('\n')}`);
  process.exit(1);
}

if (!error) launchWarnings(env).forEach((m) => console.warn(`[config] ${m}`));

if (error) {
  // Logger is not initialised yet - fail loudly on stderr.
  console.error(`Invalid environment configuration:\n${error.details.map((d) => ` - ${d.message}`).join('\n')}`);
  process.exit(1);
}

const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const config = Object.freeze({
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  appName: env.APP_NAME,
  apiPrefix: env.API_PREFIX,
  urls: { app: env.APP_URL, web: env.WEB_URL, admin: env.ADMIN_URL },
  corsOrigins: list(env.CORS_ORIGINS),
  trustProxy: env.TRUST_PROXY,
  logLevel: env.LOG_LEVEL,
  mongo: { uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME, maxPool: env.MONGODB_MAX_POOL, autoIndex: env.MONGODB_AUTO_INDEX },
  redis: {
    url: env.REDIS_URL,
    rateLimitScope: env.REDIS_RATE_LIMIT_SCOPE,
    socketAdapter: env.REDIS_SOCKET_ADAPTER && Boolean(env.REDIS_URL),
  },
  queue: {
    enabled: env.REDIS_QUEUE_ENABLED && Boolean(env.REDIS_URL),
    drainDelaySeconds: env.QUEUE_DRAIN_DELAY_SECONDS,
    stalledIntervalMs: env.QUEUE_STALLED_INTERVAL_MS,
    concurrency: env.QUEUE_CONCURRENCY,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpires: env.JWT_ACCESS_EXPIRES,
    refreshExpiresDays: env.JWT_REFRESH_EXPIRES_DAYS,
    issuer: env.JWT_ISSUER,
  },
  encryptionKey: env.ENCRYPTION_KEY,
  cookie: { domain: env.COOKIE_DOMAIN || undefined, secure: env.COOKIE_SECURE || env.NODE_ENV === 'production' },
  otp: { ttl: env.OTP_TTL_SECONDS, maxAttempts: env.OTP_MAX_ATTEMPTS, devBypass: env.OTP_DEV_BYPASS && env.NODE_ENV !== 'production' },
  google: { clientIds: list(env.GOOGLE_CLIENT_IDS) },
  sentry: { dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT, release: env.SENTRY_RELEASE, tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE },
  search: { atlasIndex: env.ATLAS_SEARCH_INDEX },
  email: {
    provider: env.EMAIL_PROVIDER,
    fromEmail: env.MAIL_FROM_EMAIL,
    fromName: env.MAIL_FROM_NAME,
    replyTo: env.MAIL_REPLY_TO,
    timeoutMs: env.EMAIL_TIMEOUT_MS,
    brevo: { apiKey: env.BREVO_API_KEY, apiUrl: env.BREVO_API_URL.replace(/\/$/, ''), webhookToken: env.BREVO_WEBHOOK_TOKEN, sandbox: env.BREVO_SANDBOX },
  },
  sms: {
    provider: env.SMS_PROVIDER,
    timeoutMs: env.SMS_TIMEOUT_MS,
    apitxt: {
      baseUrl: env.APITXT_BASE_URL.replace(/\/$/, ''),
      authKey: env.APITXT_AUTH_KEY || env.APITXT_API_KEY,
      apiKey: env.APITXT_API_KEY || env.APITXT_AUTH_KEY,
      senderId: env.APITXT_SENDER_ID,
      route: env.APITXT_ROUTE,
      peId: env.APITXT_PE_ID,
      otpMode: env.APITXT_OTP_MODE,
      otpChannel: env.APITXT_OTP_CHANNEL,
      otpTemplateId: env.APITXT_OTP_TEMPLATE_ID,
      otpTemplateName: env.APITXT_OTP_TEMPLATE_NAME,
      templates: {
        otp: env.APITXT_TEMPLATE_OTP,
        interview: env.APITXT_TEMPLATE_INTERVIEW,
        interview_reminder: env.APITXT_TEMPLATE_INTERVIEW_REMINDER,
        generic: env.APITXT_TEMPLATE_GENERIC,
        bulk: env.APITXT_TEMPLATE_BULK,
      },
    },
  },
  whatsapp: {
    provider: env.WHATSAPP_PROVIDER,
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    lang: env.WHATSAPP_TEMPLATE_LANG,
  },
  firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT_JSON,
  storage: {
    driver: env.STORAGE_DRIVER,
    localDir: path.resolve(ROOT, env.LOCAL_UPLOAD_DIR),
    r2: {
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      publicBucket: env.R2_PUBLIC_BUCKET,
      privateBucket: env.R2_PRIVATE_BUCKET,
      publicUrl: env.R2_PUBLIC_URL.replace(/\/$/, ''),
    },
  },
  razorpay: { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET },
  billing: {
    gstin: env.COMPANY_GSTIN,
    stateCode: env.COMPANY_STATE_CODE,
    legalName: env.COMPANY_LEGAL_NAME,
    address: env.COMPANY_ADDRESS,
  },
  runScheduler: env.RUN_SCHEDULER,
  runWorkers: env.RUN_WORKERS,
});

/** Missing optional keys, for the admin health panel (any environment). */
export const configWarnings = () => (error ? [] : launchWarnings({ ...env, __all: true }));

export default config;
