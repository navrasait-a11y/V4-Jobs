import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Icon, Modal } from '../ui/feedback';

const LABELS = { facebook: 'Facebook', twitter: 'X', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', telegram: 'Telegram', sms: 'SMS' };

/** `load` returns the API's share links, fetched only when opened. */
const ShareMenu = ({ load, className = '' }) => {
  const [links, setLinks] = useState(null);
  const open = async () => {
    try {
      setLinks(await load());
    } catch (e) {
      toast.error(e.message);
    }
  };
  const url = links?.url || window.location.href;
  return (
    <>
      <button onClick={open} className={className || 'inline-flex items-center gap-1.5 rounded-lg border border-brand-border px-4 py-2.5 text-sm font-medium text-brand-gray hover:border-brand-blue'}>
        <Icon name="share" size={18} /> Share
      </button>
      <Modal open={Boolean(links)} onClose={() => setLinks(null)} title="Share" size="sm">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(LABELS)
            .filter(([k]) => links?.[k])
            .map(([k, label]) => (
              <a key={k} href={links[k]} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-brand-border px-3 py-2 text-center text-sm font-medium text-brand-dark hover:border-brand-blue">
                {label}
              </a>
            ))}
        </div>
        <button
          className="mt-3 w-full rounded-lg bg-brand-blue-tint px-3 py-2 text-sm font-semibold text-brand-blue"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
          }}
        >
          Copy link
        </button>
      </Modal>
    </>
  );
};

export default ShareMenu;
