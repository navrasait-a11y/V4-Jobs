import pino from 'pino';
import config from './env.js';

const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: 'freejobwala-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.otp', '*.token', '*.refreshToken', '*.secret'],
    censor: '[REDACTED]',
  },
  transport: config.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } },
});

export default logger;
