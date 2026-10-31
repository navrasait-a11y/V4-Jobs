import React, { useState } from 'react';
import Button from '../ui/Button';
import { Modal } from '../ui/feedback';
import { SelectField, TextAreaField } from '../ui/form';
import { useAction } from '../../hooks/useData';
import { moderationApi } from '../../services';
import { REPORT_REASON_LABELS } from '../../utils/format';

const REASONS = {
  job: ['spam_misleading', 'job_not_available', 'offensive_inappropriate', 'asking_money', 'abusive_language', 'wrong_contact_details', 'other'],
  organization: ['spam_misleading', 'employer_not_available', 'offensive_inappropriate', 'asking_money', 'abusive_language', 'wrong_contact_details', 'other'],
  candidate: ['spam_misleading', 'not_searching_job', 'offensive_inappropriate', 'abusive_language', 'wrong_contact_details', 'other'],
};

const ReportModal = ({ targetType, targetId, onClose }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const send = useAction(() => moderationApi.report({ targetType, targetId, reason, details: details || undefined }), { success: 'Report sent. Our team will review it', onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Report"
      size="sm"
      footer={
        <Button size="sm" variant="danger" loading={send.isPending} disabled={!reason || (reason === 'other' && !details)} onClick={() => send.mutate()}>
          Send report
        </Button>
      }
    >
      <div className="space-y-4">
        <SelectField label="Reason" required options={REASONS[targetType].map((r) => ({ value: r, label: REPORT_REASON_LABELS[r] }))} value={reason} onChange={(e) => setReason(e.target.value)} />
        <TextAreaField label="Details" required={reason === 'other'} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
    </Modal>
  );
};

export default ReportModal;
