import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [key, setKey] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = login(key);
    if (!ok) setError(true);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 12,
        padding: '40px 48px',
        width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#111' }}>
          Hyperknow Dashboard
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: '#888' }}>
          Enter your API key to continue
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="sk-..."
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(false); }}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${error ? '#ea4335' : '#e5e5e5'}`,
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'monospace',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: error ? 6 : 16,
            }}
          />
          {error && (
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#ea4335' }}>
              Invalid API key. Please check and try again.
            </p>
          )}
          <button
            type="submit"
            disabled={!key.trim()}
            style={{
              width: '100%',
              padding: '10px',
              background: key.trim() ? '#1a1a1a' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: key.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
