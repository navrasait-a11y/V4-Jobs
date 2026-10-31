import React from 'react';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';
import { useFollowing } from '../../hooks/useData';

const FollowButton = ({ organizationId, variant = 'pill', className = '' }) => {
  const { ids, toggle } = useFollowing();
  const following = ids.has(organizationId);
  const click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(organizationId);
  };
  if (variant === 'icon') {
    return (
      <button onClick={click} aria-label={following ? 'Unfollow company' : 'Follow company'} aria-pressed={following} className={clsx('flex h-8 w-8 items-center justify-center rounded-full border border-brand-border bg-white text-brand-blue hover:bg-brand-blue-tint', className)}>
        <Icon name={following ? 'check' : 'add'} size={18} />
      </button>
    );
  }
  return (
    <button onClick={click} aria-pressed={following} className={clsx('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors', following ? 'border-brand-green bg-brand-green-tint text-brand-green' : 'border-brand-blue text-brand-blue hover:bg-brand-blue-tint', className)}>
      <Icon name={following ? 'check' : 'add'} size={15} /> {following ? 'Following' : 'Follow'}
    </button>
  );
};

export default FollowButton;
