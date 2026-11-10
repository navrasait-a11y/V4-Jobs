/**
 * Uniform success envelope used by every endpoint:
 * { success: true, message, data, meta? }
 */
export function ok(res, data = null, message = 'OK', meta = undefined, status = 200) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data = null, message = 'Created') {
  return ok(res, data, message, undefined, 201);
}

export function paginated(res, { items, page, limit, total, meta }, message = 'OK') {
  return ok(res, items, message, {
    ...(meta || {}),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
    hasNext: page * limit < total,
  });
}

export function noContent(res) {
  return res.status(204).end();
}
