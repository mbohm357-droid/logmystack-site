/* LogMyStack — shared auth + user-data module.
 * Used by /app/feed/, /app/create/, /app/saved/, /app/my/ to gate access
 * to the new card surfaces with the same Supabase magic-link flow that
 * /app/ (the tracker) uses.
 *
 * Public API on window.lms:
 *   sb                     — Supabase client
 *   requireAuth(callback)  — show gate until signed in, then call callback(user, userData)
 *   signOut()              — sign out (with confirm)
 *   handleSendMagicLink()  — bound to the gate's Send button
 *   resetAuthForm()        — bound to the "Use different email" link
 *   get currentUser()      — currently authenticated user, or null
 *   get currentUserData()  — currently loaded user_data.data, or null
 *   displayName()          — best-effort handle (displayName → email prefix → 'user')
 */
(function () {
  const SUPABASE_URL = 'https://axnlmmxkydsrqrshlenz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_XS1xdqyGTMq8uf5GrrEYaQ_YRnD6_XE';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let currentUserData = null;
  let onAuthedCallback = null;
  let alreadyAuthed = false;

  // ---------------- CSS injection ----------------
  function injectStyles() {
    if (document.getElementById('lms-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'lms-auth-styles';
    style.textContent = `
      #lms-auth-gate {
        position: fixed; inset: 0; background: var(--bg, #0a0a0a);
        z-index: 9999; display: none;
        align-items: center; justify-content: center; padding: 24px;
      }
      #lms-auth-gate .gate-panel {
        background: var(--panel, #111); border: 1px solid var(--border, #262626);
        border-radius: 14px; padding: 32px; max-width: 420px; width: 100%;
      }
      #lms-auth-gate .gate-brand {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 24px; justify-content: center;
      }
      #lms-auth-gate .gate-brand-name {
        font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
      }
      #lms-auth-gate .gate-beta-tag {
        font-family: 'JetBrains Mono', monospace; font-size: 10px;
        text-transform: uppercase; letter-spacing: 0.12em;
        background: var(--panel-2, #161616); color: var(--accent, #34d399);
        border: 1px solid rgba(52,211,153,0.25);
        padding: 2px 8px; border-radius: 4px;
      }
      #lms-auth-gate h2 {
        font-size: 20px; font-weight: 700; letter-spacing: -0.015em;
        margin: 0 0 4px;
      }
      #lms-auth-gate .gate-sub {
        font-size: 13.5px; color: var(--muted, #a3a3a3); margin: 0 0 22px;
      }
      #lms-auth-gate .gate-label {
        display: block; font-family: 'JetBrains Mono', monospace;
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--muted, #a3a3a3); margin-bottom: 7px;
      }
      #lms-auth-gate .gate-input {
        background: var(--panel-2, #161616); border: 1px solid var(--border, #262626);
        color: var(--text, #fafafa); padding: 11px 14px; border-radius: 9px;
        font-size: 14px; width: 100%; transition: border-color 0.15s;
        font-family: 'Inter', sans-serif; margin-bottom: 14px;
        outline: none;
      }
      #lms-auth-gate .gate-input:focus { border-color: rgba(52,211,153,0.5); }
      #lms-auth-gate .gate-btn {
        background: var(--accent, #34d399); color: #052e1a; font-weight: 600;
        padding: 11px 22px; border-radius: 10px; font-size: 14px;
        cursor: pointer; border: none; transition: opacity 0.15s;
        width: 100%; font-family: 'Inter', sans-serif;
      }
      #lms-auth-gate .gate-btn:hover { opacity: 0.92; }
      #lms-auth-gate .gate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      #lms-auth-gate .gate-foot {
        margin-top: 16px; text-align: center;
        font-size: 11px; color: var(--muted-2, #737373);
        font-family: 'JetBrains Mono', monospace;
      }
      #lms-auth-gate .gate-foot a { color: var(--accent, #34d399); text-decoration: none; }
      #lms-auth-gate .gate-sent {
        text-align: center;
      }
      #lms-auth-gate .gate-sent-icon {
        width: 48px; height: 48px; border-radius: 50%;
        background: rgba(52,211,153,0.1);
        border: 1px solid rgba(52,211,153,0.3);
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 16px;
      }
      #lms-auth-gate .gate-sent-email {
        font-family: 'JetBrains Mono', monospace; font-size: 13.5px;
        color: var(--accent, #34d399); margin: 6px 0 18px;
      }
      #lms-auth-gate .gate-link-btn {
        background: var(--panel-2, #161616); color: var(--text, #fafafa);
        border: 1px solid var(--border, #262626); font-weight: 500;
        padding: 7px 14px; border-radius: 8px; font-size: 12px;
        cursor: pointer; transition: all 0.15s;
        font-family: 'Inter', sans-serif;
      }
      #lms-auth-gate .gate-link-btn:hover { border-color: #333; background: #1f1f1f; }
      .hidden { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // ---------------- HTML injection ----------------
  function injectGate() {
    if (document.getElementById('lms-auth-gate')) return;
    const gate = document.createElement('div');
    gate.id = 'lms-auth-gate';
    gate.innerHTML = `
      <div class="gate-panel">
        <div class="gate-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L22 8 L22 16 L12 22 L2 16 L2 8 Z" stroke="#34d399" stroke-width="1.5"/>
            <path d="M12 8 L17 11 L17 13 L12 16 L7 13 L7 11 Z" fill="#34d399"/>
          </svg>
          <span class="gate-brand-name">LogMyStack</span>
          <span class="gate-beta-tag">Beta</span>
        </div>

        <div id="lms-auth-form-view">
          <h2>Sign in</h2>
          <p class="gate-sub">Enter the email you signed up with — we'll send a one-time link.</p>
          <label class="gate-label">Email</label>
          <input id="lms-auth-email" class="gate-input" type="email" autocomplete="email" placeholder="you@email.com">
          <button id="lms-auth-send-btn" class="gate-btn" onclick="window.lms.handleSendMagicLink()">Send magic link</button>
          <p class="gate-foot">Beta access required. <a href="https://logmystack.com#waitlist">Join the waitlist →</a></p>
        </div>

        <div id="lms-auth-sent-view" class="hidden gate-sent">
          <div class="gate-sent-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 8L10.89 13.26C11.2187 13.4793 11.6049 13.5963 12 13.5963C12.3951 13.5963 12.7813 13.4793 13.11 13.26L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z" stroke="#34d399" stroke-width="1.6"/></svg>
          </div>
          <h2>Check your email</h2>
          <p class="gate-sub" style="margin-bottom: 0;">We sent a magic link to</p>
          <p class="gate-sent-email" id="lms-auth-sent-email">your@email.com</p>
          <button class="gate-link-btn" onclick="window.lms.resetAuthForm()">Use different email</button>
        </div>

        <div id="lms-auth-loading-view" class="hidden" style="text-align: center; padding: 16px 0;">
          <p class="gate-sub" style="margin: 0;">Loading...</p>
        </div>
      </div>
    `;
    document.body.insertBefore(gate, document.body.firstChild);
  }

  function showGate() {
    injectGate();
    document.getElementById('lms-auth-gate').style.display = 'flex';
  }
  function hideGate() {
    const g = document.getElementById('lms-auth-gate');
    if (g) g.style.display = 'none';
  }

  // ---------------- Helpers ----------------
  function authToast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
    else console.warn('[lms-auth]', msg);
  }

  async function loadUserData() {
    if (!currentUser) return null;
    try {
      const { data, error } = await sb
        .from('user_data')
        .select('data')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (error) { console.error('Load user_data failed:', error); return {}; }
      return data?.data || {};
    } catch (e) {
      console.error('Load user_data exception:', e);
      return {};
    }
  }

  // ---------------- Magic link flow ----------------
  async function handleSendMagicLink() {
    const email = document.getElementById('lms-auth-email').value.trim();
    if (!email) { authToast('Enter an email'); return; }
    const btn = document.getElementById('lms-auth-send-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    try {
      const { data: allowed, error: checkErr } = await sb.rpc('is_email_allowed', { check_email: email });
      if (checkErr) {
        btn.disabled = false; btn.textContent = 'Send magic link';
        authToast('Error: ' + checkErr.message);
        return;
      }
      if (!allowed) {
        btn.disabled = false; btn.textContent = 'Send magic link';
        document.getElementById('lms-auth-email').style.borderColor = 'rgba(248,113,113,0.5)';
        authToast("This email isn't on the beta allowlist. Join the waitlist at logmystack.com.");
        if (window.posthog) posthog.capture('beta_signin_denied', { email });
        return;
      }
      document.getElementById('lms-auth-email').style.borderColor = '';
      btn.textContent = 'Sending...';
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href },
      });
      btn.disabled = false;
      btn.textContent = 'Send magic link';
      if (error) {
        authToast('Error: ' + error.message);
        return;
      }
      if (window.posthog) posthog.capture('beta_signin_sent', { email });
      document.getElementById('lms-auth-sent-email').textContent = email;
      document.getElementById('lms-auth-form-view').classList.add('hidden');
      document.getElementById('lms-auth-sent-view').classList.remove('hidden');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Send magic link';
      authToast('Error: ' + (e?.message || e));
    }
  }

  function resetAuthForm() {
    document.getElementById('lms-auth-sent-view').classList.add('hidden');
    document.getElementById('lms-auth-form-view').classList.remove('hidden');
    document.getElementById('lms-auth-email').value = '';
  }

  async function signOut() {
    if (!confirm('Sign out? Your data stays in the cloud.')) return;
    await sb.auth.signOut();
  }

  // ---------------- requireAuth ----------------
  async function requireAuth(callback) {
    onAuthedCallback = callback;
    injectStyles();
    injectGate();
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      currentUserData = await loadUserData();
      hideGate();
      alreadyAuthed = true;
      try { callback(currentUser, currentUserData); } catch (e) { console.error('initPage error:', e); }
    } else {
      showGate();
    }
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (alreadyAuthed && currentUser?.id === session.user.id) return;
        currentUser = session.user;
        currentUserData = await loadUserData();
        hideGate();
        alreadyAuthed = true;
        try { callback(currentUser, currentUserData); } catch (e) { console.error('initPage error:', e); }
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentUserData = null;
        alreadyAuthed = false;
        showGate();
      }
    });
  }

  // ---------------- Display name ----------------
  function displayName() {
    if (currentUserData?.displayName?.trim()) return currentUserData.displayName.trim();
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return 'user';
  }

  window.lms = {
    sb,
    requireAuth,
    handleSendMagicLink,
    resetAuthForm,
    signOut,
    displayName,
    get currentUser() { return currentUser; },
    get currentUserData() { return currentUserData; },
  };
})();
