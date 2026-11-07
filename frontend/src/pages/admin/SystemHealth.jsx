import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { PageHeader, Section, StatTile } from '../../components/ui/data';
import { Alert, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatDateTime, formatNumber, titleCase } from '../../utils/format';

const Dot = ({ ok }) => <span className={clsx('inline-block h-2.5 w-2.5 rounded-full', ok ? 'bg-brand-green' : 'bg-brand-red')} />;
const uptime = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

/** PRD "Platform health monitoring" and "Monitoring & Threat Detection". Refreshes every minute. */
const SystemHealth = () => {
  useDocumentTitle('Platform health');
  const q = useQuery({ queryKey: ['admin', 'system-health'], queryFn: () => adminApi.get('/system/health'), refetchInterval: 60 * 1000 });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const h = q.data;
  const services = Object.entries(h.services);
  const failedEmails = h.last24h.emails.failed || 0;
  const failedMessages = Object.values(h.last24h.messages).reduce((n, byStatus) => n + (byStatus.failed || 0), 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform health"
        subtitle={`Checked ${formatDateTime(h.checkedAt)} · refreshes every minute`}
        actions={
          <Button size="sm" variant="outline" loading={q.isFetching} onClick={() => q.refetch()} leftIcon={<Icon name="refresh" size={16} />}>
            Check now
          </Button>
        }
      />
      {h.warnings.length > 0 && (
        <Alert tone="warning">
          <p className="font-semibold">Configuration to finish</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {h.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="mail" label="E-mails sent (24h)" value={formatNumber(h.last24h.emails.sent || 0)} note={failedEmails ? `${failedEmails} failed` : 'No failures'} />
        <StatTile icon="sms" label="SMS / WhatsApp (24h)" value={formatNumber(Object.values(h.last24h.messages).reduce((n, s) => n + (s.sent || 0), 0))} note={failedMessages ? `${failedMessages} failed` : 'No failures'} />
        <StatTile icon="login" label="Successful logins (24h)" value={formatNumber(h.last24h.logins.success)} />
        <StatTile icon="gpp_maybe" label="Failed logins (24h)" value={formatNumber(h.last24h.logins.failed)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Services">
          <ul className="divide-y divide-brand-border text-sm">
            {services.map(([name, s]) => (
              <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 font-medium text-brand-dark">
                  <Dot ok={s.ok} /> {titleCase(name)}
                </span>
                <span className="text-right text-brand-gray">
                  {Object.entries(s)
                    .filter(([k]) => k !== 'ok')
                    .map(([k, v]) => `${titleCase(k)}: ${v}`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Integrations">
          <ul className="divide-y divide-brand-border text-sm">
            {Object.entries(h.providers).map(([name, v]) => (
              <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 font-medium text-brand-dark">
                  <Dot ok={!/console|not configured/.test(v)} /> {titleCase(name)}
                </span>
                <span className="text-brand-gray">{v}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Suspicious activity (24h)">
          {h.last24h.suspiciousIps.length ? (
            <ul className="divide-y divide-brand-border text-sm">
              {h.last24h.suspiciousIps.map((i) => (
                <li key={i.ip} className="flex justify-between py-2">
                  <span className="font-mono text-brand-dark">{i.ip}</span>
                  <span className="text-brand-red">{i.failedLogins} failed logins</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-gray">No IP with 10 or more failed logins.</p>
          )}
          <p className="mt-2 text-xs text-brand-gray-muted">Block an IP, e-mail or number from Moderation → Blocklist.</p>
        </Section>
        <Section title="Server">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-brand-gray-muted">Environment</dt>
              <dd className="font-medium">{h.process.env}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-gray-muted">Node.js</dt>
              <dd className="font-medium">{h.process.node}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-gray-muted">Uptime</dt>
              <dd className="font-medium">{uptime(h.process.uptimeSec)}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-gray-muted">Memory</dt>
              <dd className="font-medium">
                {h.process.memoryMb} MB (heap {h.process.heapMb} MB)
              </dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
};

export default SystemHealth;
