(() => {
  'use strict';

  const SUPABASE_URL = 'https://bzpiosxlhdvsnzxpmqfq.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_f6NfJwi1yCcVs_QX7IIR_g_IVnqkwvh';
  const callbackUrl = new URL('./staging-auth.html', window.location.href).href.split(/[?#]/, 1)[0];
  const initialUrl = new URL(window.location.href);
  const initialHash = new URLSearchParams(initialUrl.hash.slice(1));
  const callbackType = initialUrl.searchParams.get('type') || initialHash.get('type') ||
    (initialUrl.searchParams.get('auth') === 'recovery' ? 'recovery' : '');
  const linkError = initialUrl.searchParams.has('error') || initialHash.has('error') || initialHash.has('error_code');
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: true,
      storageKey: 'menumargin-staging-auth-check'
    }
  });

  const callbackPanel = document.getElementById('callbackPanel');
  const callbackStatus = document.getElementById('callbackStatus');
  const setPasswordForm = document.getElementById('setPasswordForm');
  const testForm = document.getElementById('testForm');
  const sessionNote = document.getElementById('sessionNote');
  const testStatus = document.getElementById('testStatus');
  const testResults = document.getElementById('testResults');
  const resetStatus = document.getElementById('resetStatus');
  let callbackSession = null;

  function status(element, message, kind = '') {
    element.textContent = message;
    element.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function setButton(button, disabled, label) {
    button.disabled = disabled;
    if (label) button.textContent = label;
  }

  function cleanCallbackUrl() {
    window.history.replaceState(null, '', window.location.pathname);
  }

  async function start() {
    if (!window.supabase?.createClient) {
      status(testStatus, 'The staging sign-in library did not load. Refresh this page and try again.', 'error');
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      callbackPanel.hidden = false;
      status(callbackStatus, 'Could not validate this link. Request a fresh password recovery link below.', 'error');
      cleanCallbackUrl();
      return;
    }

    callbackSession = data.session;
    if (callbackType || linkError) {
      callbackPanel.hidden = false;
      if (linkError || !callbackSession) {
        status(callbackStatus, 'This link is expired, already used, or invalid. Request a fresh password recovery link below.', 'error');
      } else if (callbackType === 'invite' || callbackType === 'recovery') {
        status(callbackStatus, `Signed in to staging as ${callbackSession.user.email || 'your test account'}. Choose its password to continue.`, 'success');
        setPasswordForm.hidden = false;
        document.getElementById('testPanel').hidden = true;
        document.getElementById('emailA').value = callbackSession.user.email || '';
        document.getElementById('emailA').readOnly = true;
        document.getElementById('passwordAField').hidden = true;
        status(sessionNote, 'Account A is signed in through the staging link. Sign in to Account B below.', 'success');
      } else {
        status(callbackStatus, 'Staging sign-in completed. Continue with the account isolation test below.', 'success');
      }
      cleanCallbackUrl();
    } else if (callbackSession) {
      document.getElementById('emailA').value = callbackSession.user.email || '';
      document.getElementById('emailA').readOnly = true;
      document.getElementById('passwordAField').hidden = true;
      status(sessionNote, 'A staging account is already signed in on this page. Sign in to Account B below.', 'success');
    }
  }

  setPasswordForm.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('newPassword');
    const confirmation = document.getElementById('confirmPassword');
    const button = document.getElementById('setPasswordButton');
    if (!callbackSession) {
      status(callbackStatus, 'The sign-in link is no longer active. Request a fresh recovery link below.', 'error');
      return;
    }
    if (password.value.length < 8 || password.value !== confirmation.value) {
      status(callbackStatus, password.value.length < 8 ? 'Choose a password with at least 8 characters.' : 'The passwords do not match.', 'error');
      return;
    }
    setButton(button, true, 'Setting password…');
    try {
      const { error } = await client.auth.updateUser({ password: password.value });
      password.value = '';
      confirmation.value = '';
      if (error) throw new Error(error.message || 'Password update failed.');
      const refreshed = await client.auth.getSession();
      if (refreshed.error || !refreshed.data.session) throw new Error('The password was updated, but the staging session ended. Request a fresh recovery link to continue.');
      callbackSession = refreshed.data.session;
      setPasswordForm.hidden = true;
      document.getElementById('testPanel').hidden = false;
      status(callbackStatus, 'Password set. This staging session is ready for the isolation test.', 'success');
      status(sessionNote, 'Account A is signed in through the staging link. Sign in to Account B below.', 'success');
    } catch (error) {
      status(callbackStatus, `Could not set the password: ${error.message}`, 'error');
    } finally {
      setButton(button, false, 'Set password');
    }
  });

  document.getElementById('resetForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('sendReset');
    setButton(button, true, 'Sending…');
    try {
      const email = document.getElementById('resetEmail').value.trim();
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl });
      if (error) throw new Error(error.message || 'The email could not be sent.');
      status(resetStatus, 'If the address belongs to a staging account, a recovery link has been sent. Use the newest link.', 'success');
    } catch (error) {
      status(resetStatus, `Could not send a recovery link: ${error.message}`, 'error');
    } finally {
      setButton(button, false, 'Send password recovery link');
    }
  });

  function require(condition, message) {
    if (!condition) throw new Error(message);
  }

  function denied(response) {
    return [401, 403].includes(response.status) ||
      (response.ok && Array.isArray(response.value) && response.value.length === 0);
  }

  async function apiRequest(path, { token, method = 'GET', body } = {}) {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLIC_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
        Prefer: 'return=representation'
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    let value = null;
    try { value = await response.json(); } catch { /* Empty response body. */ }
    return { status: response.status, ok: response.ok, value };
  }

  async function passwordSession(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message || 'Sign-in failed for a staging test account.');
    return data.session;
  }

  async function accountId(token) {
    const result = await apiRequest('/auth/v1/user', { token });
    require(result.ok && result.value?.id, 'A staging sign-in expired or could not be verified. Request a fresh link and try again.');
    return result.value.id;
  }

  async function runIsolation(ownerToken, otherToken, ownerId, otherId) {
    const cleanup = [];
    const checks = [];
    const record = message => checks.push(message);
    try {
      for (const table of ['recipes', 'price_book']) {
        const id = crypto.randomUUID();
        cleanup.push({ table, id });
        const common = { id, user_id: ownerId };
        const itemData = { name: 'MenuMargin isolation test', supplier: 'TEST ONLY', packBase: 1, baseUnit: 'each', price: 1 };
        const body = table === 'recipes'
          ? { ...common, name: 'MenuMargin isolation test', recipe_data: { ingredients: [], name: 'MenuMargin isolation test' } }
          : { ...common, item_data: itemData };
        const own = await apiRequest(`/rest/v1/${table}`, { token: ownerToken, method: 'POST', body });
        require(own.ok, `${table}: owner insert failed (HTTP ${own.status}).`);

        const route = `/rest/v1/${table}?id=eq.${id}`;
        require(denied(await apiRequest(route, { token: otherToken })), `${table}: Account B read Account A's row.`);
        require(denied(await apiRequest(route)), `${table}: anonymous access was not denied.`);
        const updateBody = table === 'recipes' ? { name: 'Unauthorized edit' } : { item_data: { ...itemData, supplier: 'Unauthorized edit' } };
        require(denied(await apiRequest(route, { token: otherToken, method: 'PATCH', body: updateBody })), `${table}: Account B updated Account A's row.`);
        require(denied(await apiRequest(route, { token: otherToken, method: 'DELETE' })), `${table}: Account B deleted Account A's row.`);

        const forgedId = crypto.randomUUID();
        cleanup.push({ table, id: forgedId });
        const forged = await apiRequest(`/rest/v1/${table}`, { token: otherToken, method: 'POST', body: { ...body, id: forgedId } });
        require([401, 403].includes(forged.status), `${table}: Account B inserted a row under Account A's ID.`);

        const anonymousId = crypto.randomUUID();
        cleanup.push({ table, id: anonymousId });
        const anonymous = await apiRequest(`/rest/v1/${table}`, { method: 'POST', body: { ...body, id: anonymousId } });
        require([401, 403].includes(anonymous.status), `${table}: anonymous insert was not denied.`);

        const reassignment = await apiRequest(route, { token: ownerToken, method: 'PATCH', body: { user_id: otherId } });
        require([401, 403].includes(reassignment.status) || (reassignment.ok && Array.isArray(reassignment.value) && reassignment.value.length === 0), `${table}: Account A reassigned row ownership.`);

        const visible = await apiRequest(route, { token: ownerToken });
        require(visible.ok && visible.value?.length === 1 && visible.value[0].user_id === ownerId, `${table}: owner cannot read its own row.`);
        const ownerUpdate = table === 'recipes' ? { name: 'Owner update' } : { item_data: { ...itemData, supplier: 'OWNER UPDATE' } };
        const updated = await apiRequest(route, { token: ownerToken, method: 'PATCH', body: ownerUpdate });
        require(updated.ok && updated.value?.length === 1, `${table}: owner update failed.`);
        const ownerDelete = await apiRequest(route, { token: ownerToken, method: 'DELETE' });
        require(ownerDelete.ok, `${table}: owner delete failed.`);
        const absent = await apiRequest(route, { token: ownerToken });
        require(absent.ok && Array.isArray(absent.value) && absent.value.length === 0, `${table}: owner delete did not remove its row.`);
        record(`${table}: owner CRUD passes; cross-account read, update, delete, insert, and reassignment are blocked; anonymous access is blocked.`);
      }
      return { checks, cleanup };
    } catch (error) {
      return { checks, cleanup, error };
    } finally {
      let cleanupFailures = 0;
      for (const { table, id } of cleanup) {
        try {
          for (const token of [ownerToken, otherToken]) {
            const removed = await apiRequest(`/rest/v1/${table}?id=eq.${id}`, { token, method: 'DELETE' });
            if (!removed.ok) throw new Error('cleanup delete denied');
          }
          for (const token of [ownerToken, otherToken]) {
            const remaining = await apiRequest(`/rest/v1/${table}?id=eq.${id}`, { token });
            if (!remaining.ok || remaining.value?.length) throw new Error('test row remains');
          }
        } catch {
          cleanupFailures += 1;
        }
      }
      if (cleanupFailures) throw new Error(`Cleanup failed for ${cleanupFailures} generated row(s). Review the staging tables before reusing these accounts.`);
    }
  }

  testForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('runTest');
    const ownerEmail = document.getElementById('emailA').value.trim();
    const ownerPassword = document.getElementById('passwordA');
    const otherEmail = document.getElementById('emailB').value.trim();
    const otherPassword = document.getElementById('passwordB');
    setButton(button, true, 'Running…');
    testResults.hidden = true;
    testResults.replaceChildren();
    status(testStatus, 'Signing in to the staging project and checking row policies…');
    let ownerSession = callbackSession;
    try {
      if (!ownerSession || ownerSession.user.email?.toLowerCase() !== ownerEmail.toLowerCase()) {
        if (!ownerPassword.value) throw new Error('Enter Account A’s staging password, or use its current invite/recovery link.');
        ownerSession = await passwordSession(ownerEmail, ownerPassword.value);
      }
      const otherSession = await passwordSession(otherEmail, otherPassword.value);
      ownerPassword.value = '';
      otherPassword.value = '';
      require(ownerSession.user.id !== otherSession.user.id, 'Use two different staging accounts.');
      const ownerId = await accountId(ownerSession.access_token);
      const otherId = await accountId(otherSession.access_token);
      require(ownerId !== otherId, 'Use two different staging accounts.');
      const result = await runIsolation(ownerSession.access_token, otherSession.access_token, ownerId, otherId);
      if (result.error) throw result.error;
      for (const message of result.checks) {
        const item = document.createElement('li');
        item.className = 'pass';
        item.textContent = message;
        testResults.append(item);
      }
      testResults.hidden = false;
      status(testStatus, 'Passed. Generated test rows were removed from staging.', 'success');
      callbackSession = null;
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      status(testStatus, error.message || 'The staging isolation test failed.', 'error');
      if (error.message?.includes('Cleanup failed')) {
        const item = document.createElement('li');
        item.className = 'fail';
        item.textContent = error.message;
        testResults.append(item);
        testResults.hidden = false;
      }
    } finally {
      setButton(button, false, 'Run staging isolation test');
    }
  });

  start().catch(() => status(testStatus, 'Could not initialize the staging sign-in page. Refresh and try again.', 'error'));
})();
