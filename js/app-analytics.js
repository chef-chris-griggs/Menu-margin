/* Optional app analytics. No third-party code or Google requests before consent. */
(() => {
  'use strict';
  const measurementId = 'G-E2DHD366MW';
  const consentKey = 'mep-app-analytics-consent-v1';
  const retention = 180 * 86400000;
  let enabled = false, loaded = false, controls, banner;
  const analyticsName = 'ga-disable-' + measurementId;
  function choice() {
    try {
      const saved = JSON.parse(localStorage.getItem(consentKey));
      if (saved && ['accepted', 'rejected'].includes(saved.value) &&
          Number.isFinite(saved.at) && saved.at <= Date.now() &&
          Date.now() - saved.at < retention) return saved.value;
    } catch {}
    return null;
  }
  function safeLocation() {
    // Auth links can contain secrets; do not forward any query or fragment.
    return location.origin + location.pathname;
  }
  function safeReferrer() {
    // Preserve the source origin across website-to-app navigation without
    // exposing any referrer path, query parameters or auth fragments.
    try {
      const referrer = new URL(document.referrer);
      return referrer.protocol === 'https:' || referrer.protocol === 'http:'
        ? referrer.origin + '/' : '';
    } catch { return ''; }
  }
  function clearCookies() {
    for (const value of document.cookie.split(';')) {
      const cookieName = value.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(cookieName)) continue;
      document.cookie = cookieName + '=; Max-Age=0; Path=/; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '');
    }
  }
  function gtag() { window.dataLayer.push(arguments); }
  function enable() {
    if (loaded) return;
    loaded = true;
    window[analyticsName] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = gtag;
    gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    gtag('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    gtag('set', {
      page_location: safeLocation(), page_referrer: safeReferrer(),
      allow_google_signals: false, allow_ad_personalization_signals: false,
      ads_data_redaction: true, user_data: {}, cookie_expires: retention / 1000
    });
    // Cross-domain linker requires GA4 admin setup for BOTH domains as well.
    gtag('set', 'linker', {
      domains: ['miseenprice.co.uk', 'menu-margin.pages.dev'], accept_incoming: true
    });
    gtag('js', new Date());
    gtag('config', measurementId, {send_page_view: true});
    const tag = document.createElement('script');
    tag.async = true;
    tag.id = 'mep-app-google-tag';
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.append(tag);
  }
  window.mmAnalyticsTrack = (name, parameters = {}) => {
    if (!enabled || !loaded || !['sign_up', 'signup_start', 'trial_started'].includes(name)) return;
    gtag('event', name, {...parameters, user_data: {}});
  };
  function apply(value) {
    enabled = value === 'accepted';
    try { localStorage.setItem(consentKey, JSON.stringify({value, at:Date.now()})); } catch {}
    banner.hidden = true;
    controls.setAttribute('aria-expanded', 'false');
    if (enabled) enable();
    else {
      window[analyticsName] = true;
      clearCookies();
      // Stop previously loaded Google code on withdrawal.
      if (loaded) location.reload();
    }
  }
  function init() {
    controls = document.createElement('button');
    controls.type = 'button';
    controls.className = 'mep-app-cookie-settings';
    controls.textContent = 'Analytics settings';
    controls.setAttribute('aria-controls', 'mep-app-analytics-banner');
    controls.setAttribute('aria-expanded', 'false');
    banner = document.createElement('aside');
    banner.id = 'mep-app-analytics-banner';
    banner.className = 'mep-app-analytics-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Optional app analytics');
    const title = document.createElement('strong');
    title.textContent = 'Optional app analytics';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Help us measure verified signups and first-time trial starts. This is a separate choice from website analytics. We do not send email, account IDs, recipes, prices or invoice data to Google. Your app works without analytics. ';
    const policy = document.createElement('a');
    policy.href = './privacy.html';
    policy.textContent = 'Privacy information';
    paragraph.append(policy);
    const buttons = document.createElement('div');
    buttons.className = 'mep-app-analytics-actions';
    for (const [value, label] of [['rejected', 'Reject analytics'], ['accepted', 'Accept analytics']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => apply(value));
      buttons.append(b);
    }
    banner.append(title, paragraph, buttons);
    controls.addEventListener('click', () => {
      banner.hidden = false;
      controls.setAttribute('aria-expanded', 'true');
    });
    document.body.prepend(banner, controls);
    const saved = choice();
    banner.hidden = saved !== null;
    enabled = saved === 'accepted';
    if (enabled) enable();
    else { window[analyticsName] = true; clearCookies(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
