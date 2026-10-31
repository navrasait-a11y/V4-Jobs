import logger from '../../config/logger.js';
import * as s from './billing.service.js';
import { renderInvoiceHtml, renderInvoicePdf } from './invoice.render.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { isAdmin } from '../../shared/middleware/auth.js';

export const plans = async (req, res) => ok(res, await s.listPlans(req.user, req.query.audience));
export const quote = async (req, res) => {
  const q = await s.quote(req.user, req.body);
  return ok(res, {
    ...q,
    plan: { _id: q.plan._id, name: q.plan.name, code: q.plan.code },
    coupon: q.coupon ? { code: q.coupon.code } : null,
    referrer: undefined,
  });
};
export const checkout = async (req, res) => created(res, await s.createOrder(req.user, req.body), 'Order created');
export const verify = async (req, res) => ok(res, await s.verifyPayment(req.user, req.body), 'Payment successful');
export const subscriptions = async (req, res) => ok(res, await s.mySubscriptions(req.user));
export const autoRenew = async (req, res) => ok(res, await s.setAutoRenew(req.user, req.params.id, req.body.autoRenew), 'Updated');
export const orders = async (req, res) => paginated(res, await s.myOrders(req.user, { ...parsePagination(req.query), status: req.query.status }));
export const wallet = async (req, res) => ok(res, await s.walletSummary(req.user, parsePagination(req.query)));

export const invoice = async (req, res) => {
  const inv = await s.getInvoice(req.user, req.params.id, { isAdmin: isAdmin(req.user) });
  if (req.query.format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    return res.send(renderInvoiceHtml(inv));
  }
  if (req.query.format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${inv.number}.pdf"`);
    return res.send(await renderInvoicePdf(inv));
  }
  return ok(res, inv);
};

/** Raw-body webhook (mounted in app.js before the JSON parser). Always 200 for processed/ignored events. */
export const paymentWebhook = async (req, res) => {
  try {
    const result = await s.handleWebhook(req.body, req.get('x-razorpay-signature'));
    res.json({ success: true, ...result });
  } catch (err) {
    logger.warn({ err: err.message }, 'Razorpay webhook rejected');
    res.status(err.statusCode || 400).json({ success: false });
  }
};
