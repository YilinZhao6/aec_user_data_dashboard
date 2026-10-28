import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { useRoute } from './router'
import { ROUTES, isAdminRoute, isPublicRoute, prefetchAllRoutes } from './routes'
import './App.css'

const LoginPage = lazy(() => import('./auth/LoginPage'))
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const AdminOnlyNotice = lazy(() => import('./components/AdminOnlyNotice'))

function AppInner() {
  const { auth, isAdmin } = useAuth()
  const path = useRoute()

  // Warm the standalone chunks once signed in, so switching between them has
  // nothing left to download and never falls back to the loading screen.
  useEffect(() => {
    if (!auth) return
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300))
    idle(() => prefetchAllRoutes({ isAdmin }))
  }, [auth, isAdmin])

  if (!auth && !isPublicRoute(path)) return <LoginPage />
  if (isAdminRoute(path) && !isAdmin) return <AdminOnlyNotice path={path} />

  const Page = ROUTES[path] ?? Dashboard
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
      {/* First paint only. Route switches go through startTransition (see
          SiteNav), which keeps the current page on screen rather than
          falling back to this. */}
      <Suspense fallback={<AppLoading />}>
        <AppInner />
      </Suspense>
    </AuthProvider>
  )
}

export default App
