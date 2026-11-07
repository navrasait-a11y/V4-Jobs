import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmsApi } from '../../services';

/** Admin-managed ad: banner (with an optional mobile image) or custom HTML. Renders nothing when no ad is active. */
const AdSlot = ({ placement, className = '' }) => {
  const { data } = useQuery({ queryKey: ['ads', placement], queryFn: () => cmsApi.ads(placement), staleTime: 5 * 60 * 1000 });
  const ad = (Array.isArray(data) ? data : data?.items || []).find((a) => (a.type === 'banner' && (a.image?.url || a.mobileImage?.url)) || (a.type === 'html' && a.html));
  if (!ad) return null;
  const click = () => cmsApi.adClick(ad._id).catch(() => {});
  if (ad.type === 'html') {
    return (
      <div className={className} onClick={click} role="presentation">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-brand-gray-muted">Sponsored</p>
        <div dangerouslySetInnerHTML={{ __html: ad.html }} />
      </div>
    );
  }
  const desktop = ad.image?.url || ad.mobileImage?.url;
  return (
    <div className={className}>
      <a href={ad.link || '#'} target="_blank" rel="noopener noreferrer sponsored" onClick={click} className="block overflow-hidden rounded-xl" aria-label={`Sponsored: ${ad.name}`}>
        <picture>
          {ad.mobileImage?.url && <source media="(max-width: 640px)" srcSet={ad.mobileImage.url} />}
          <img src={desktop} alt={ad.name} loading="lazy" className="w-full object-cover" />
        </picture>
      </a>
    </div>
  );
};

export default AdSlot;
