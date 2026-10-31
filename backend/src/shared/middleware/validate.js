import ApiError from '../errors/ApiError.js';

const OPTIONS = { abortEarly: false, stripUnknown: true, convert: true, errors: { wrap: { label: '' } } };

/**
 * validate({ body, query, params }) - Joi schemas per request part.
 * Unknown keys are stripped so clients can never mass-assign protected fields.
 * Express 5 exposes req.query as a getter, so validated values are re-defined on the request.
 */
export default function validate(schemas) {
  return (req, _res, next) => {
    const details = [];
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const { value, error } = schemas[part].validate(req[part] ?? {}, OPTIONS);
      if (error) {
        details.push(...error.details.map((d) => ({ field: d.path.join('.'), message: d.message, location: part })));
        continue;
      }
      Object.defineProperty(req, part, { value, writable: true, enumerable: true, configurable: true });
    }
    if (details.length) throw ApiError.validation(details);
    next();
  };
}
