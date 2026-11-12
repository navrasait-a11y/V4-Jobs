import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmsApi } from '../../services';
import { usePublicSettings } from '../../hooks/useData';
import { useConsent } from '../../utils/consent';

const ADSENSE_CLIENT = /^ca-pub-\d{10,20}$/;
let adsenseLoading = null;

/** Loads the AdSense library once per page, for the publisher id set in Admin > Settings > Ads. */
function loadAdsense(client) {
  if (!adsenseLoading) {
    adsenseLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      s.onload = resolve;
      s.onerror = () => {
        adsenseLoading = null; // ad blocker or offline: allow a later retry
        reject(new Error('AdSense blocked'));
      };
      document.head.appendChild(s);
    });
  }
  return adsenseLoading;
}

const AdsenseUnit = ({ client, slot, className }) => {
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    loadAdsense(client)
      .then(() => {
        // Each <ins> may be filled only once, otherwise AdSense throws.
        if (!live || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [client, slot]);
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-brand-gray-muted">Advertisement</p>
      <ins ref={ref} className="adsbygoogle block" style={{ display: 'block' }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
};

/**
 * Admin-managed ad for a placement: image banner (with an optional mobile image), Google AdSense
 * unit or custom HTML. Renders nothing when ads are switched off or no ad is active.
 */
const AdSlot = ({ placement, className = '' }) => {
  const settings = usePublicSettings();
  const enabled = settings.ads?.enabled !== false;
  // AdSense sets advertising cookies, so it waits for the visitor's consent. Banners and HTML ads do not.
  const consent = useConsent();
  const client = consent === 'all' && ADSENSE_CLIENT.test(settings.ads?.adsenseClientId || '') ? settings.ads.adsenseClientId : null;
  const { data } = useQuery({ queryKey: ['ads', placement], queryFn: () => cmsApi.ads(placement), staleTime: 5 * 60 * 1000, enabled });
  if (!enabled) return null;
  const ad = (Array.isArray(data) ? data : data?.items || []).find(
    (a) => (a.type === 'banner' && (a.image?.url || a.mobileImage?.url)) || (a.type === 'html' && a.html) || (a.type === 'adsense' && client && /^\d{4,20}$/.test(a.adUnitId || '')),
  );
  if (!ad) return null;
  if (ad.type === 'adsense') return <AdsenseUnit key={ad._id} client={client} slot={ad.adUnitId} className={className} />;
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
