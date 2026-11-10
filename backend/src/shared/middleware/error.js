import mongoose from 'mongoose';
import logger from '../../config/logger.js';
import config from '../../config/env.js';
import ApiError from '../errors/ApiError.js';
import { captureError } from '../services/monitoring.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

function normalize(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.validation(Object.values(err.errors).map((e) => ({ field: e.path, message: e.message, location: 'body' })));
  }
  if (err instanceof mongoose.Error.CastError) return ApiError.badRequest(`Invalid value for ${err.path}`, undefined, 'INVALID_ID');
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`${field} already exists`, 'DUPLICATE_KEY');
  }
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body', undefined, 'INVALID_JSON');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  if (err?.statusCode && err.statusCode < 500 && err.expose) return new ApiError(err.statusCode, err.message, 'BAD_REQUEST');
  return null;
}

export function errorHandler(err, req, res, _next) {
  const apiErr = normalize(err);
  if (!apiErr) {
    logger.error({ err, requestId: req.id, path: req.originalUrl, method: req.method }, 'Unhandled error');
  } else if (apiErr.statusCode >= 500) {
    logger.error({ err, requestId: req.id }, apiErr.message);
  }
  if (!apiErr || apiErr.statusCode >= 500) captureError(err, { requestId: req.id, path: req.route?.path || req.originalUrl.split('?')[0], method: req.method, userId: req.user?._id, role: req.user?.role });

  const status = apiErr?.statusCode || 500;
  const body = {
    success: false,
    error: {
      code: apiErr?.code || 'INTERNAL_ERROR',
      message: apiErr?.message || 'Something went wrong. Please try again later',
      ...(apiErr?.details ? { details: apiErr.details } : {}),
    },
    requestId: req.id,
  };
  if (!config.isProd && !apiErr) body.error.debug = err?.message;
  res.status(status).json(body);
}
