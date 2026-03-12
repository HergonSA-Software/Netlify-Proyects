// Firebase Auth client — REST API only, no SDK dependency
const FIREBASE_API_KEY = window._env_?.FIREBASE_API_KEY || '';

const Auth = {
  _session: null,

  // Restore session from localStorage on page load
  init() {
    const raw = localStorage.getItem('hg_admin_session');
    if (raw) {
      try {
        const session = JSON.parse(raw);
        // Invalidate legacy Supabase sessions — they lack the 'uid' field
        if (!session.uid) {
          localStorage.removeItem('hg_admin_session');
        } else {
          this._session = session;
        }
      } catch {
        localStorage.removeItem('hg_admin_session');
      }
    }
    return this.isLoggedIn() ? this._session : null;
  },

  async signIn(email, password) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      const code = err.error?.message || '';
      if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD' || code === 'INVALID_LOGIN_CREDENTIALS') {
        throw new Error('Correo o contraseña incorrectos');
      }
      if (code === 'CONFIGURATION_NOT_FOUND') {
        throw new Error('Auth no configurada en Firebase Console — activa Email/Password en Authentication > Providers');
      }
      throw new Error(code || 'Login failed');
    }
    const data = await res.json();
    this._session = {
      access_token:  data.idToken,
      refresh_token: data.refreshToken,
      expires_at:    Math.floor(Date.now() / 1000) + parseInt(data.expiresIn, 10),
      email:         data.email,
      uid:           data.localId,
    };
    localStorage.setItem('hg_admin_session', JSON.stringify(this._session));
    return this._session;
  },

  async signOut() {
    // Firebase Web tokens expire automatically; just clear the local session.
    this._session = null;
    localStorage.removeItem('hg_admin_session');
  },

  getToken() {
    return this._session?.access_token || null;
  },

  isLoggedIn() {
    if (!this._session?.access_token) return false;
    const expiresAt = this._session.expires_at;
    if (expiresAt && Math.floor(Date.now() / 1000) > expiresAt) {
      this._session = null;
      localStorage.removeItem('hg_admin_session');
      return false;
    }
    return true;
  },
};
