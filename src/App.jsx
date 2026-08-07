import { lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import './App.css'

const LoginPage = lazy(() => import('./auth/LoginPage'))
const Dashboard = lazy(() => import('./pages/sample/SampleDashboard4'))
const FeedbackPage = lazy(() => import('./pages/feedback/FeedbackPage'))
const QueriesPage = lazy(() => import('./pages/queries/QueriesPage'))

// Static routes, no router dependency. Every page is a separate lazy chunk,
// so opening /feedback never loads the dashboard's code — or fires its
// requests.
const ROUTES = {
  '/feedback': FeedbackPage,
  '/queries': QueriesPage,
}

function resolveRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return ROUTES[path] ?? Dashboard
}

function AppInner() {
  const { auth } = useAuth()
  if (!auth) return <LoginPage />

  const Page = resolveRoute()
  return <Page />
}

function AppLoading() {
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <strong>
        Hyperknow Data Dashboard
        <span className="app-loading-tag">v2.0 smart</span>
      </strong>
      <span>Loading…</span>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<AppLoading />}>
        <AppInner />
      </Suspense>
    </AuthProvider>
  )
}

export default App
