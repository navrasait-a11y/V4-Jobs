import Joi from 'joi';
import { USERNAME_REGEX, TIMESPANS } from '../constants/index.js';

export const objectId = Joi.string().hex().length(24);
export const email = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } })
  .max(254);
export const mobile = Joi.string()
  .trim()
  .pattern(/^(\+?91[- ]?)?[6-9]\d{9}$/)
  .message('Enter a valid 10 digit Indian mobile number');
export const password = Joi.string()
  .min(8)
  .max(64)
  .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
  .message('Password must be 8-64 characters and contain at least one letter and one number');
export const username = Joi.string()
  .pattern(USERNAME_REGEX)
  .message('Username must be 3-30 characters (letters, numbers, underscore) and cannot start or end with "_"');
export const otp = Joi.string()
  .trim()
  .pattern(/^\d{4,8}$/)
  .message('Invalid OTP');
export const url = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(500);
export const shortText = Joi.string().trim().max(200);
export const longText = Joi.string().trim().max(30000);
export const stringList = (max = 50, itemMax = 150) => Joi.array().items(Joi.string().trim().max(itemMax)).max(max);
export const idParam = Joi.object({ id: objectId.required() });

export const place = Joi.object({
  locality: shortText.allow(''),
  district: shortText.allow(''),
  city: shortText.allow(''),
  state: shortText.allow(''),
  country: shortText.allow(''),
  pincode: Joi.string().trim().max(12).allow(''),
  location: objectId,
});

export const fileRef = Joi.object({
  key: Joi.string().max(500),
  url: Joi.string().max(1000),
  name: Joi.string().max(200),
  size: Joi.number(),
  mime: Joi.string().max(100),
});

export const socialLink = Joi.object({ platform: shortText.required(), url: url.required() });

export const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
  sort: Joi.string().trim().max(100),
};

export const timespan = {
  timespan: Joi.string().valid(...TIMESPANS, 'today', 'yesterday', '1d', '2d', '5d', '15d', '45d', '2m', '4m', '1y', '2y'),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
};

export const listQuery = (extra = {}) => Joi.object({ ...pagination, ...timespan, q: Joi.string().trim().max(200).allow(''), ...extra });

export const bulkIds = (max = 1000) => Joi.array().items(objectId).min(1).max(max).unique().required();

export const exportFormat = Joi.string().valid('xlsx', 'csv').default('xlsx');
