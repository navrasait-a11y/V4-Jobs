import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { Icon, Modal } from '../ui/feedback';
import { invoiceApi } from '../../services';

/** Invoice preview with Print and Download PDF. The iframe keeps the invoice styles away from the app. */
const InvoiceViewer = ({ invoice, onClose, admin = false }) => {
  const frame = useRef(null);
  const [saving, setSaving] = useState(false);
  const api = invoiceApi(admin);
  const query = useQuery({
    queryKey: ['invoice-html', admin, invoice?._id],
    queryFn: () => api.html(invoice._id),
    enabled: Boolean(invoice?._id),
  });

  const download = async () => {
    setSaving(true);
    try {
      await api.pdf(invoice._id, invoice.number);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      size="xl"
      title="Tax invoice"
      subtitle={invoice?.number}
      footer={
        <>
          <Button variant="ghost" disabled={!query.data} onClick={() => frame.current?.contentWindow.print()}>
            <Icon name="print" size={18} /> Print
          </Button>
          <Button loading={saving} disabled={!query.data} onClick={download}>
            <Icon name="download" size={18} /> Download PDF
          </Button>
        </>
      }
    >
      {query.isError ? (
        <p className="py-10 text-center text-sm text-brand-gray">{query.error.message}</p>
      ) : query.data ? (
        <iframe ref={frame} title="Invoice preview" srcDoc={query.data} sandbox="allow-same-origin allow-modals" className="h-[65vh] w-full rounded-lg border border-brand-border bg-white" />
      ) : (
        <div className="h-[65vh] animate-pulse rounded-lg bg-brand-tint" />
      )}
    </Modal>
  );
};

export default InvoiceViewer;
