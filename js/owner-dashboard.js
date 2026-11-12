'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const url = 'https://phwdyckedcqxbojpbqgz.supabase.co';
  // Public browser key only. All owner permissions are enforced inside the database RPC.
  const client = window.supabase.createClient(url, 'sb_publishable_q711FpfYM17f3d1J_dTJOg_XRgmOufq', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const setStatus = message => { byId('status').textContent = message; };
  const asCount = n => Number.isInteger(n) && n >= 0 ? n.toLocaleString('en-GB') : '–';
  let busy = false;

  function drawTrend(days) {
    const trend = byId('trend');
    trend.replaceChildren();
    if (!Array.isArray(days) || !days.length) {
      trend.textContent = 'No daily figures available.';
      return;
    }
    const max = Math.max(1, ...days.flatMap(day => [day.registrations || 0, day.trials || 0]));
    for (const day of days) {
      const group = document.createElement('div');
      group.className = 'day';
      const bars = document.createElement('div');
      bars.className = 'bars';
      for (const [key, cls] of [['registrations', 'reg'], ['trials', 'trial']]) {
        const bar = document.createElement('div');
        bar.className = 'bar ' + cls;
        const count = Number.isInteger(day[key]) ? day[key] : 0;
        bar.style.height = Math.max(2, Math.round(count / max * 148)) + 'px';
        bar.title = day.date + ': ' + count + ' ' + key;
        bars.append(bar);
      }
      const label = document.createElement('span');
      label.textContent = String(day.date || '').slice(5);
      group.append(bars, label);
      trend.append(group);
    }
    trend.setAttribute('aria-label', days.map(d => d.date + ': ' + d.registrations + ' registrations, ' + d.trials + ' trials').join('; '));
  }

  function show(data) {
    if (!data || !data.registrations || !data.cardless_trials || !data.subscriptions) {
      throw new Error('Unexpected dashboard response');
    }
    const fields = {
      registered: data.registrations.total,
      verified: data.registrations.confirmed,
      trials: data.cardless_trials.active,
      paid: data.subscriptions.active_paid,
      todayReg: data.registrations.today,
      yesterdayReg: data.registrations.yesterday,
      todayTrials: data.cardless_trials.today,
      yesterdayTrials: data.cardless_trials.yesterday,
      allTrials: data.cardless_trials.started,
      stripeTrials: data.subscriptions.stripe_trialing,
      owners: data.owner_grants?.complimentary
    };
    for (const [key, value] of Object.entries(fields)) byId(key).textContent = asCount(value);
    drawTrend(data.daily);
    byId('updated').textContent = 'Updated ' + new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London'
    }).format(new Date(data.as_of));
    byId('login').hidden = true;
    byId('dashboard').hidden = false;
    setStatus('');
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    byId('refresh').disabled = true;
    setStatus('Checking owner permissions and loading latest figures…');
    try {
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || !user) {
        byId('dashboard').hidden = true;
        byId('login').hidden = false;
        setStatus('Sign in with your owner account to see the dashboard.');
        return;
      }
      const { data, error } = await client.rpc('menu_margin_owner_signup_metrics');
      if (error) {
        byId('dashboard').hidden = true;
        byId('login').hidden = true;
        setStatus(error.code === '42501' ? 'Access denied. This account is not authorised to view the owner dashboard.' : 'Dashboard unavailable. Metrics function may not be deployed yet; please try again later.');
        return;
      }
      show(data);
    } catch (error) {
      byId('dashboard').hidden = true;
      setStatus('Could not load the dashboard. Check your connection and retry.');
    } finally {
      busy = false;
      byId('refresh').disabled = false;
    }
  }
  byId('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const email = byId('email').value.trim();
    const password = byId('password').value;
    setStatus('Signing in…');
    const { error } = await client.auth.signInWithPassword({ email, password });
    byId('password').value = '';
    if (error) {
      setStatus('Unable to sign in. Check your credentials and try again.');
      return;
    }
    await refresh();
  });
  byId('refresh').addEventListener('click', refresh);
  refresh();
})();
