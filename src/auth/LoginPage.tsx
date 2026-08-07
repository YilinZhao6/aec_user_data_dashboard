import { useState } from 'react';
import { useAuth, hasConfiguredKeys } from './AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [key, setKey] = useState('');
  const [invalid, setInvalid] = useState(false);

  const keysConfigured = hasConfiguredKeys();
  const message = invalid
    ? 'That API key was not recognised. Check for stray spaces and try again.'
    : !keysConfigured
      ? 'No API keys are configured. Set VITE_API_KEYS in .env and restart the dev server.'
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(key)) setInvalid(true);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <strong>Hyperknow Data Dashboard</strong>
          <span className="login-version-tag">v2.0 smart</span>
        </div>

        <p className="login-eyebrow">Sign in</p>
        <h1>Access your dashboard.</h1>

        <form onSubmit={handleSubmit} noValidate>
          <label className={`login-field${invalid ? ' invalid' : ''}`}>
            <span>API key</span>
            <input
              type="password"
              placeholder="sk-…"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setInvalid(false);
              }}
              autoFocus
              autoComplete="current-password"
              spellCheck={false}
              aria-invalid={invalid}
            />
          </label>

          {message && <p className="login-error">{message}</p>}

          <button type="submit" className="login-submit" disabled={!key.trim() || !keysConfigured}>
            Sign in
          </button>
        </form>

        <p className="login-footnote">
          This dashboard contains confidential user data, handled under NDA and
          all non-disclosure policies.
        </p>
      </div>
    </div>
  );
}
