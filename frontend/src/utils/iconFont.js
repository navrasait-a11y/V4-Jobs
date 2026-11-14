/**
 * Material Symbols draws each icon from its name ("expand_more"). Until the icon font has loaded,
 * the browser would show those names as plain text, so icons stay invisible (index.css) until this
 * marks the page with `icons-ready`. Their space is already reserved, so nothing jumps.
 */
const FAMILY = 'Material Symbols Outlined';

export function revealIcons() {
  const root = document.documentElement;
  const done = () => root.classList.add('icons-ready');
  const fonts = document.fonts;
  if (!fonts?.load) return done(); // very old browsers: nothing to wait for

  const ready = () => fonts.check(`24px "${FAMILY}"`, 'home') && [...fonts].some((f) => f.family.replace(/"/g, '') === FAMILY && f.status === 'loaded');
  const waitForFont = () => {
    if (ready()) return done();
    // The font may still be on its way (slow network); reveal as soon as any font load finishes it.
    const onDone = () => {
      if (!ready()) return;
      fonts.removeEventListener('loadingdone', onDone);
      done();
    };
    fonts.addEventListener('loadingdone', onDone);
  };
  // load() starts the download right away instead of waiting for the first icon to render.
  fonts.load(`24px "${FAMILY}"`, 'home').then(waitForFont, waitForFont);
}
