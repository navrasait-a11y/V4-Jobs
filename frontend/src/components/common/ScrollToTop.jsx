import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * New page -> top of the page. A link with a #hash scrolls to that section instead; pages load
 * lazily, so it waits (up to ~2 s) for the element to appear.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return undefined;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer;
    const find = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      tries += 1;
      if (tries < 20) timer = setTimeout(find, 100);
    };
    find();
    return () => clearTimeout(timer);
  }, [pathname, hash]);
  return null;
};

export default ScrollToTop;
