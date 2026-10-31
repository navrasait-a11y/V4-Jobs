/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Anything thrown that is NOT an ApiError is treated as an unexpected 500.
 */
export default class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request', details, code = 'BAD_REQUEST') {
    return new ApiError(400, message, code, details);
  }

  static validation(details, message = 'Validation failed') {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message = 'Resource already exists', code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }

  static tooMany(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }

  static paymentRequired(message = 'Insufficient credits. Please upgrade your plan', code = 'QUOTA_EXCEEDED') {
    return new ApiError(402, message, code);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}
