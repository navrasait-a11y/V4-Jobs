import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { Modal } from '../ui/feedback';
import { CheckboxField, TextField } from '../ui/form';
import { billingApi } from '../../services';
import { formatCurrency } from '../../utils/format';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  });
}

const Row = ({ label, value, strong }) => (
  <div className={`flex justify-between text-sm ${strong ? 'border-t border-brand-border pt-2 font-bold text-brand-dark' : 'text-brand-gray'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

/** Always shows the server's price breakdown before opening Razorpay. */
const PlanCheckout = ({ plan, onClose, onPaid }) => {
  const [couponCode, setCouponCode] = useState('');
  const [applied, setApplied] = useState('');
  const [useWallet, setUseWallet] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    billingApi
      .quote({ planId: plan._id, couponCode: applied || undefined, useWallet })
      .then((q) => {
        if (!live) return;
        setQuote(q);
        setError('');
      })
      .catch((e) => {
        if (!live) return;
        setError(e.message);
        setApplied('');
      });
    return () => {
      live = false;
    };
  }, [plan._id, applied, useWallet]);

  const pay = async () => {
    setBusy(true);
    try {
      const data = await billingApi.checkout({ planId: plan._id, couponCode: applied || undefined, useWallet });
      if (!data.paymentRequired) {
        toast.success('Plan activated');
        onPaid();
        return;
      }
      await loadRazorpay();
      const rz = data.razorpay;
      new window.Razorpay({
        key: rz.keyId,
        order_id: rz.orderId,
        amount: rz.amount,
        currency: 'INR',
        name: rz.name,
        description: rz.description,
        prefill: rz.prefill,
        theme: { color: '#0151A0' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r) => {
          try {
            await billingApi.verify({ orderId: data.order._id, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature });
            toast.success('Payment successful. Plan activated');
            onPaid();
          } catch (e) {
            toast.error(e.message);
          } finally {
            setBusy(false);
          }
        },
      }).open();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Buy ${plan.name}`}
      size="sm"
      footer={
        <Button size="sm" variant="primary" loading={busy} disabled={!quote} onClick={pay}>
          Pay {quote ? formatCurrency(quote.total) : ''}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <TextField className="flex-1" label="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} error={error} />
          <Button size="sm" variant="outline" className="h-11" onClick={() => setApplied(couponCode)}>
            Apply
          </Button>
        </div>
        <CheckboxField label="Use wallet balance" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
        {quote && (
          <div className="space-y-1.5 rounded-lg bg-brand-tint p-3">
            <Row label="Plan price" value={formatCurrency(quote.amount)} />
            {quote.discount > 0 && <Row label="Discount" value={`- ${formatCurrency(quote.discount)}`} />}
            <Row label="GST" value={formatCurrency(quote.gst?.total)} />
            {quote.walletUsed > 0 && <Row label="Wallet" value={`- ${formatCurrency(quote.walletUsed)}`} />}
            <Row strong label="Total" value={formatCurrency(quote.total)} />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PlanCheckout;
