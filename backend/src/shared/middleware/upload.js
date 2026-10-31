import multer from 'multer';
import ApiError from '../errors/ApiError.js';

const MB = 1024 * 1024;

/**
 * Allowed upload kinds. Each declares allowed MIME types, max size and a magic-byte check so a
 * renamed executable cannot be smuggled in with a fake extension / content-type.
 */
const SIGNATURES = {
  pdf: (b) => b.slice(0, 4).toString('latin1') === '%PDF',
  zipOffice: (b) => b[0] === 0x50 && b[1] === 0x4b, // docx/xlsx are zip containers
  ole: (b) => b.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), // legacy .doc/.xls
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: (b) => b.slice(0, 3).toString('latin1') === 'GIF',
  webp: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  text: (b) => !b.slice(0, 512).includes(0x00),
};

const MIME = {
  'application/pdf': ['pdf'],
  'application/msword': ['ole'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zipOffice'],
  'application/vnd.ms-excel': ['ole'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zipOffice'],
  'text/csv': ['text'],
  'image/jpeg': ['jpg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
};

export const UPLOAD_KINDS = {
  resume: { mimes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxSize: 5 * MB },
  image: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxSize: 5 * MB },
  document: { mimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], maxSize: 10 * MB },
  excel: { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'], maxSize: 20 * MB },
  chat: {
    mimes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxSize: 10 * MB,
  },
};

function verifySignature(file) {
  const checks = MIME[file.mimetype] || [];
  return checks.some((name) => SIGNATURES[name](file.buffer));
}

/**
 * upload(kind, field, { multiple, maxCount }) -> [multerMiddleware, verifyMiddleware]
 * Files are kept in memory (bounded by maxSize) and streamed to the storage driver by services.
 */
export function upload(kind, field = 'file', { multiple = false, maxCount = 5, required = true } = {}) {
  const cfg = UPLOAD_KINDS[kind];
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cfg.maxSize, files: multiple ? maxCount : 1, fields: 50 },
    fileFilter: (_req, file, cb) => {
      if (!cfg.mimes.includes(file.mimetype)) return cb(ApiError.badRequest(`Unsupported file type ${file.mimetype}`, undefined, 'INVALID_FILE_TYPE'));
      cb(null, true);
    },
  });
  const parser = multiple ? m.array(field, maxCount) : m.single(field);

  const handle = (req, res, next) =>
    parser(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? `File too large. Max ${cfg.maxSize / MB}MB allowed` : err.message;
        return next(ApiError.badRequest(msg, undefined, 'UPLOAD_ERROR'));
      }
      next(err);
    });

  const verify = (req, _res, next) => {
    const files = multiple ? req.files || [] : req.file ? [req.file] : [];
    if (required && !files.length) throw ApiError.badRequest(`File field "${field}" is required`, undefined, 'FILE_REQUIRED');
    for (const f of files) {
      if (!verifySignature(f)) throw ApiError.badRequest(`File "${f.originalname}" content does not match its type`, undefined, 'INVALID_FILE_CONTENT');
    }
    next();
  };

  return [handle, verify];
}
