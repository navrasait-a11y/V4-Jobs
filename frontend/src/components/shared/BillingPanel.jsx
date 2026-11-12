import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import PlanCheckout from './PlanCheckout';
import InvoiceViewer from './InvoiceViewer';
import Button from '../ui/Button';
import { Badge, DataTable, Pagination, Section, StatusBadge, Tabs } from '../ui/data';
import { Alert, CardSkeleton, Icon } from '../ui/feedback';
import { TextField } from '../ui/form';
import { useAction, usePublicSettings } from '../../hooks/useData';
import toast from 'react-hot-toast';
import { billingApi } from '../../services';
import { payWithRazorpay } from '../../utils/razorpay';
import { formatCurrency, formatDate, formatDateTime, formatNumber, titleCase } from '../../utils/format';

const Plans = ({ audience, active }) => {
  const [buying, setBuying] = useState(null);
  const client = useQueryClient();
  const { data: plans, isPending, refetch } = useQuery({ queryKey: ['plans', audience], queryFn: () => billingApi.plans(audience) });
  if (isPending) return <CardSkeleton />;
  const main = (plans || []).filter((p) => p.tier !== 'addon');
  const addons = (plans || []).filter((p) => p.tier === 'addon');
  const card = (p, addon) => {
    const current = !addon && (active?.plan === p._id || active?.plan?._id === p._id);
    return (
      <div key={p._id} className={clsx('flex flex-col rounded-xl border bg-white p-5', current ? 'border-brand-blue' : 'border-brand-border')}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-brand-dark">{p.name}</p>
          {current && <Badge tone="blue">Current</Badge>}
        </div>
        <p className="mt-2 text-2xl font-bold text-brand-blue">{p.price ? formatCurrency(p.price) : 'Free'}</p>
        <p className="text-xs text-brand-gray-muted">
          {p.durationDays} days{p.price ? ' · excl. GST' : ''}
        </p>
        <ul className="mt-3 flex-1 space-y-1.5 text-sm text-brand-gray">
          {(p.highlights || []).map((h) => (
            <li key={h} className="flex gap-1.5">
              <Icon name="check" size={16} className="text-brand-green" /> {h}
            </li>
          ))}
        </ul>
        {addon && (
          <p className="mt-2 text-xs text-brand-gray-muted">
            Adds{' '}
            {Object.entries(p.credits || {})
              .filter(([, v]) => v)
              .map(([k, v]) => `${formatNumber(v)} ${k.replace(/_/g, ' ')}`)
              .join(', ') || 'credits'}{' '}
            to your account. Your current plan stays as it is.
          </p>
        )}
        {p.price > 0 && (
          <Button size="sm" variant={addon ? 'outline' : 'primary'} className="mt-4" onClick={() => setBuying(p)}>
            {addon ? 'Add pack' : 'Buy now'}
          </Button>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{main.map((p) => card(p, false))}</div>
      {addons.length > 0 && (
        <div>
          <h3 className="mb-1 text-[15px] font-bold text-brand-dark">Add-on packs</h3>
          <p className="mb-3 text-sm text-brand-gray">Need more resume views or featured jobs? Top up without changing your plan.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{addons.map((p) => card(p, true))}</div>
        </div>
      )}
      {buying && (
        <PlanCheckout
          plan={buying}
          onClose={() => setBuying(null)}
          onPaid={() => {
            setBuying(null);
            refetch();
            // The plan card, credits, wallet balance and order list all change with a purchase.
            for (const key of ['subscriptions', 'wallet', 'orders', 'org']) client.invalidateQueries({ queryKey: [key] });
          }}
        />
      )}
    </div>
  );
};

const Orders = () => {
  const [page, setPage] = useState(1);
  const [invoice, setInvoice] = useState(null);
  const query = useQuery({ queryKey: ['orders', page], queryFn: () => billingApi.orders({ page, limit: 20 }) });
  const columns = [
    { key: 'orderNumber', header: 'Order' },
    { key: 'plan', header: 'Item', render: (o) => o.planName || o.plan?.name || '—' },
    { key: 'total', header: 'Total', render: (o) => formatCurrency(o.total ?? o.amount) },
    { key: 'date', header: 'Date', render: (o) => formatDate(o.createdAt) },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={query.data?.data}
        query={query}
        actions={(o) =>
          o.invoice?._id && (
            <Button size="sm" variant="ghost" onClick={() => setInvoice(o.invoice)}>
              Invoice
            </Button>
          )
        }
      />
      <Pagination meta={query.data?.meta} onPage={setPage} />
      <InvoiceViewer invoice={invoice} onClose={() => setInvoice(null)} />
    </>
  );
};

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

/** Adds money to the wallet through Razorpay. Limits and the on/off switch come from admin settings. */
const TopUp = ({ onDone }) => {
  const settings = usePublicSettings();
  const rule = { enabled: true, min: 100, max: 100000, ...(settings.payments?.walletTopup || {}) };
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const error = amount && (!Number.isFinite(value) || value < rule.min || value > rule.max) ? `Enter an amount between ${formatCurrency(rule.min)} and ${formatCurrency(rule.max)}` : '';
  if (!rule.enabled) return null;

  const pay = async (e) => {
    e.preventDefault();
    if (!amount || error || busy) return;
    setBusy(true);
    try {
      const data = await billingApi.walletTopup(value);
      if (await payWithRazorpay(data)) {
        toast.success(`${formatCurrency(value)} added to your wallet`);
        setAmount('');
        onDone();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={pay} className="rounded-xl border border-brand-border bg-brand-tint p-4">
      <p className="text-sm font-semibold text-brand-dark">Add money</p>
      <p className="mt-0.5 text-xs text-brand-gray">Wallet balance pays for plans at checkout and keeps auto-renew running.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.filter((n) => n >= rule.min && n <= rule.max).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setAmount(String(n))}
            className={clsx('rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors', value === n ? 'border-brand-blue bg-white text-brand-blue' : 'border-brand-border bg-white text-brand-gray hover:border-brand-blue')}
          >
            {formatCurrency(n)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-2">
        <TextField className="flex-1" label="Amount (₹)" type="number" inputMode="numeric" min={rule.min} max={rule.max} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} error={error} />
        <Button type="submit" size="sm" variant="primary" className="mt-[26px] h-11" loading={busy} disabled={!amount || Boolean(error)}>
          Add money
        </Button>
      </div>
    </form>
  );
};

const REASONS = { topup: 'Money added', purchase: 'Plan purchase', refund: 'Refund', referral_reward: 'Referral reward', admin_adjustment: 'Adjusted by support', auto_renew: 'Auto-renewal' };

const Wallet = () => {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['wallet', page], queryFn: () => billingApi.wallet({ page, limit: 20 }), placeholderData: (prev) => prev });
  const { data } = query;
  const txns = data?.transactions || {};
  const items = txns.items || [];
  const limit = txns.limit || 20;
  return (
    <Section title="Wallet">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray-muted">Available balance</p>
          <p className="mt-1 text-3xl font-bold text-brand-dark">{formatCurrency(data?.balance ?? 0)}</p>
          <p className="mt-2 text-xs text-brand-gray">Tick "Use wallet balance" while buying a plan to pay with it.</p>
        </div>
        <TopUp onDone={() => client.invalidateQueries({ predicate: (q) => ['wallet', 'orders'].includes(q.queryKey[0]) })} />
      </div>
      <h3 className="mb-1 mt-5 text-sm font-bold text-brand-dark">Transactions</h3>
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {!query.isPending && !query.isError && !items.length && <p className="text-sm text-brand-gray">No wallet transactions yet.</p>}
      <ul className="divide-y divide-brand-border">
        {items.map((t) => (
          <li key={t._id} className="flex justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0 text-brand-dark">
              {REASONS[t.reason] || t.note || titleCase(t.reason || t.type)}
              <span className="block text-xs text-brand-gray-muted">
                {formatDateTime(t.createdAt)}
                {t.balanceAfter !== undefined ? ` · Balance ${formatCurrency(t.balanceAfter)}` : ''}
              </span>
            </span>
            <span className={clsx('shrink-0 font-semibold', t.type === 'credit' ? 'text-brand-green' : 'text-brand-red')}>
              {t.type === 'credit' ? '+' : '-'}
              {formatCurrency(t.amount)}
            </span>
          </li>
        ))}
      </ul>
      <Pagination meta={{ page: txns.page || 1, total: txns.total || 0, limit, totalPages: Math.ceil((txns.total || 0) / limit) }} onPage={setPage} />
    </Section>
  );
};

/** Plans, orders and wallet for candidates (Profile Booster) and employers. */
const BillingPanel = ({ audience }) => {
  const [tab, setTab] = useState('plans');
  const { data: subs } = useQuery({ queryKey: ['subscriptions'], queryFn: billingApi.subscriptions });
  const autoRenew = useAction(({ id, value }) => billingApi.autoRenew(id, value), { success: 'Updated', invalidate: ['subscriptions'] });
  const active = subs?.active;
  const credits = subs?.credits;
  return (
    <div className="space-y-4">
      {active && (
        <Section title={active.planSnapshot?.name || 'Active plan'} actions={<Badge tone="green">Active</Badge>}>
          <p className="text-sm text-brand-gray">Valid till {formatDate(active.endsAt)}</p>
          <label className="mt-2 flex items-center gap-2 text-sm text-brand-gray">
            <input type="checkbox" checked={Boolean(active.autoRenew)} onChange={(e) => autoRenew.mutate({ id: active._id, value: e.target.checked })} /> Auto-renew from wallet
          </label>
          {credits && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(credits).map(([k, v]) => (
                <Badge key={k} tone="blue">
                  {titleCase(k)}: {formatNumber(v)}
                </Badge>
              ))}
            </div>
          )}
        </Section>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'plans', label: 'Plans' },
          { value: 'orders', label: 'Orders' },
          { value: 'wallet', label: 'Wallet' },
        ]}
      />
      {tab === 'plans' && <Plans audience={audience} active={active} />}
      {tab === 'orders' && <Orders />}
      {tab === 'wallet' && <Wallet />}
    </div>
  );
};

export default BillingPanel;
