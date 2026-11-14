import toast from 'react-hot-toast';
import { adminApi } from '../../services';
import { impersonationUrl } from '../../utils/impersonation';

/**
 * Opens the user's account in a new tab. The tab is opened right away, inside the click, because
 * browsers block pop-ups opened after an `await`; it is pointed at the account once the API has
 * issued the session. Must be called directly from a click handler. If pop-ups are blocked the
 * account opens in the current tab instead.
 */
export async function loginAs(userId, name) {
  const tab = window.open('', '_blank');
  if (!tab) {
    // Pop-ups blocked: open the account in this tab instead. The session is kept per tab, and
    // "End session" brings this tab back to the admin panel.
    try {
      const data = await adminApi.post(`/users/${userId}/impersonate`);
      toast.success(`Opening ${name || 'the account'} here (pop-ups are blocked for this site).`);
      window.location.assign(impersonationUrl(data.tokens, { sameTab: true }));
    } catch (e) {
      toast.error(e.message);
    }
    return;
  }
  try {
    tab.document.title = 'Opening account…';
    tab.document.body.style.cssText = 'font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#4B5563';
    tab.document.body.textContent = `Opening ${name || 'the account'}…`;
  } catch {
    /* cross-origin blank page: just navigate */
  }
  try {
    const data = await adminApi.post(`/users/${userId}/impersonate`);
    tab.opener = null; // the user's tab must not be able to reach back into the admin panel
    tab.location.replace(impersonationUrl(data.tokens));
    toast.success(`Opened ${name || 'the account'} in a new tab. The session ends after 2 hours.`);
  } catch (e) {
    tab.close();
    toast.error(e.message);
  }
}
