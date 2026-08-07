// Page chrome shared by the standalone pages (/feedback, /queries).

import { useAuth } from '../auth/AuthContext'
import { SiteNav } from './SiteNav'
import { API_BASE_URL } from '../api/client'
import '../styles/dashboard.css'

export function PageShell({ active, tabs, activeTab, onTabChange, children }) {
  const { role, logout } = useAuth()

  return (
    <div className="sample4-page">
      <header className="sample4-topbar">
        <div>
          <strong>
            Hyperknow Data Dashboard
            <span className="sample4-version-tag">v2.0 smart</span>
          </strong>
          <span className="sample4-source">{API_BASE_URL}</span>
        </div>
        <div className="sample4-topbar-actions">
          <SiteNav active={active} />
          <div className="sample4-session">
            <span className="sample4-role-tag" title={`Signed in with a ${role} key`}>{role}</span>
            <button type="button" className="sample4-signout" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>

      {tabs && tabs.length > 0 && (
        <nav className="sample4-tabs" aria-label="Sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      <main className="sample4-shell">{children}</main>
    </div>
  )
}
