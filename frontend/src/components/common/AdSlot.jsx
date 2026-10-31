import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmsApi } from '../../services';

/** Admin-managed banner. Renders nothing when no active ad exists for the placement. */
const AdSlot = ({ placement, className = '' }) => {
  const { data } = useQuery({ queryKey: ['ads', placement], queryFn: () => cmsApi.ads(placement), staleTime: 5 * 60 * 1000 });
  const ad = (Array.isArray(data) ? data : data?.items || []).find((a) => a.type === 'banner' && a.image?.url);
  if (!ad) return null;
  const click = () => cmsApi.adClick(ad._id).catch(() => {});
  return (
    <div className={className}>
      <a href={ad.link || '#'} target="_blank" rel="noopener noreferrer sponsored" onClick={click} className="block overflow-hidden rounded-xl">
        <img src={ad.image.url} alt={ad.name} loading="lazy" className="w-full object-cover" />
      </a>
    </div>
  );
};

export default AdSlot;
