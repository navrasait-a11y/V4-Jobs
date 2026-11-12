import { billingApi } from '../services';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => {
      s.remove(); // let the next attempt load it again
      reject(new Error('Could not load the payment window. Check your connection.'));
    };
    document.head.appendChild(s);
  });
}

/**
 * Opens Razorpay Checkout for a checkout / top-up response and confirms the payment with the API.
 * Resolves `true` when paid, `false` when the user closed the window. Only the payment methods the
 * admin left switched on are offered.
 */
export async function payWithRazorpay({ order, razorpay: rz }) {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: rz.keyId,
      order_id: rz.orderId,
      amount: rz.amount,
      currency: rz.currency || 'INR',
      name: rz.name,
      description: rz.description,
      prefill: rz.prefill,
      ...(rz.methods ? { method: rz.methods } : {}),
      theme: { color: '#0151A0' },
      modal: { ondismiss: () => resolve(false) },
      handler: (r) =>
        billingApi
          .verify({ orderId: order._id, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature })
          .then(() => resolve(true), reject),
    });
    checkout.on('payment.failed', () => {}); // Razorpay shows the failure and lets the user retry in the same window
    checkout.open();
  });
}
