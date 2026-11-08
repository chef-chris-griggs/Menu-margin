/* Website analytics only. Load the supplied Google tag after explicit opt-in. */
(() => {
  'use strict';
  if (window.__mepAnalyticsBooted) return;
  window.__mepAnalyticsBooted = true;
  const key = 'mep-analytics-consent-v1';
  const measurementId = 'G-D02CJ4WE8W';
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  let allowed = false, loaded = false, usedCalculator = false;
  let banner, settings;

  function readChoice() {
    try {
      const choice = JSON.parse(localStorage.getItem(key));
      if (!choice || !['accepted', 'rejected'].includes(choice.value) ||
          !Number.isFinite(choice.at) || choice.at > Date.now() || Date.now() - choice.at >= maxAge) return null;
      return choice.value;
    } catch { return null; }
  }
  function saveChoice(value) {
    try { localStorage.setItem(key, JSON.stringify({value, at: Date.now()})); } catch { /* Current-page choice still applies. */ }
  }
  function gtag() { window.dataLayer.push(arguments); }
  function safeLocation() {
    const url = new URL(location.origin + location.pathname);
    const source = new URLSearchParams(location.search);
    for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const value = source.get(name);
      // Keep campaign attribution, never arbitrary search, email or auth parameters.
      if (value && /^[a-z0-9_-]{1,80}$/i.test(value)) url.searchParams.set(name, value);
    }
    return url.href;
  }
  function safeReferrer() {
    try { return document.referrer ? new URL(document.referrer).origin + '/' : ''; } catch { return ''; }
  }
  function loadTag() {
    if (loaded || !allowed) return;
    loaded = true;
    window['ga-disable-' + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = gtag;
    gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    gtag('consent', 'update', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    gtag('set', {
      page_location: safeLocation(), page_referrer: safeReferrer(),
      allow_google_signals: false, allow_ad_personalization_signals: false,
      ads_data_redaction: true, user_data: {}, cookie_expires: maxAge / 1000
    });
    gtag('js', new Date());
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-WZXW5M6L';
    script.id = 'mep-google-tag';
    document.head.append(script);
  }
  function clearAnalyticsCookies() {
    const names = document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(n => /^_ga(?:_|$)/.test(n));
    const parts = location.hostname.split('.');
    const domains = ['', location.hostname, '.' + location.hostname];
    for (let i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));
    for (const name of names) for (const domain of domains) {
      document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '') + (domain ? '; Domain=' + domain : '');
    }
  }
  function choose(value) {
    allowed = value === 'accepted';
    saveChoice(value);
    banner.hidden = true;
    settings.setAttribute('aria-expanded', 'false');
    if (allowed) loadTag();
    else {
      window['ga-disable-' + measurementId] = true;
      clearAnalyticsCookies();
      // Unload the already running library rather than continuing cookieless pings.
      if (loaded) location.reload();
    }
  }
  function event(name, details = {}) {
    if (allowed && loaded) gtag('event', name, {...details, user_data: {}});
  }
  function init() {
    banner = document.createElement('aside');
    banner.className = 'mep-cookie-banner';
    banner.id = 'mep-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Analytics cookies');
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = 'Help us improve Mise en Price';
    const text = document.createElement('p');
    text.textContent = 'Allow Google Analytics cookies to help us understand visits and calculator use? The calculator works either way. ';
    const privacy = document.createElement('a');
    privacy.href = '/website-privacy';
    privacy.textContent = 'Privacy and cookies';
    text.append(privacy); copy.append(title, text);
    const actions = document.createElement('div');
    actions.className = 'mep-cookie-actions';
    for (const [value, label] of [['accepted', 'Accept analytics'], ['rejected', 'Reject analytics']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => choose(value)); actions.append(button);
    }
    banner.append(copy, actions);
    const controls = document.createElement('div');
    controls.className = 'mep-cookie-controls';
    settings = document.createElement('button');
    settings.type = 'button'; settings.textContent = 'Cookie settings';
    settings.setAttribute('aria-controls', banner.id);
    settings.setAttribute('aria-expanded', 'false');
    settings.addEventListener('click', () => {
      banner.hidden = false; settings.setAttribute('aria-expanded', 'true');
      actions.querySelector('button').focus();
    });
    controls.append(settings); document.body.append(controls, banner);
    const choice = readChoice();
    banner.hidden = !!choice;
    allowed = choice === 'accepted';
    if (allowed) loadTag();
    else { window['ga-disable-' + measurementId] = true; clearAnalyticsCookies(); }
    window.addEventListener('storage', e => {
      if (e.key !== key) return;
      const choice = readChoice();
      if (loaded && choice !== 'accepted') {
        allowed = false; window['ga-disable-' + measurementId] = true; clearAnalyticsCookies(); location.reload();
      } else if (choice === 'accepted') { allowed = true; banner.hidden = true; loadTag(); }
    });
    document.addEventListener('input', e => {
      if (allowed && !usedCalculator && e.target instanceof Element && e.target.closest('#demoForm')) {
        usedCalculator = true; event('calculator_interaction', {calculator: 'one_recipe'});
      }
    });
    document.addEventListener('click', e => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.hostname === 'menu-margin.pages.dev' && url.pathname === '/') {
        event('app_link_click', {link_purpose: /trial|try mise|try.*app/i.test(a.textContent) ? 'start_trial' : 'open_app'});
      }
      if (url.origin === location.origin && url.pathname === '/recipe-costing-template.csv') event('costing_template_download');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
