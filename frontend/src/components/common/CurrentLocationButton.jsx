import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Icon, Spinner } from '../ui/feedback';
import { lookupApi } from '../../services';

/**
 * "Use my current location": asks the browser for the position, maps it to the nearest city on the
 * server (coordinates are not stored) and hands back that place. Works only on HTTPS / localhost.
 */
const CurrentLocationButton = ({ onPlace, className = '' }) => {
  const [busy, setBusy] = useState(false);
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  const locate = () => {
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const hit = await lookupApi.nearest(coords.latitude, coords.longitude);
          if (hit?.place) onPlace(hit.place);
          else toast.error('We could not find a city near you. Please type it instead.');
        } catch {
          toast.error('Could not get your location. Please type your city.');
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        toast.error(err.code === 1 ? 'Location permission is off. Allow it in your browser or type your city.' : 'Could not get your location. Please type your city.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  };
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={locate} disabled={busy} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-brand-blue hover:bg-brand-blue-tint disabled:opacity-60 ${className}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-blue-tint">{busy ? <Spinner size={16} /> : <Icon name="my_location" size={17} />}</span>
      {busy ? 'Finding your city…' : 'Use my current location'}
    </button>
  );
};

export default CurrentLocationButton;
