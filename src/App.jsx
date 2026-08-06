import { lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import SampleDashboard from './pages/sample/SampleDashboard'
import SampleDashboard2 from './pages/sample/SampleDashboard2'
import SampleDashboard3 from './pages/sample/SampleDashboard3'
import SampleDashboard4 from './pages/sample/SampleDashboard4'
import SampleDashboard5 from './pages/sample/SampleDashboard5'
import './App.css'

const LoginPage = lazy(() => import('./auth/LoginPage'))
const DashboardEntry = lazy(() => import('./pages/dashboardEntry/DashboardEntry'))

function AppInner() {
  const { auth } = useAuth()
  if (!auth) return <LoginPage />
  return <DashboardEntry />
}

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'

  if (pathname === '/play/sample') {
    return <SampleDashboard />
  }

  if (pathname === '/play/sample2') {
    return <SampleDashboard2 />
  }

  if (pathname === '/play/sample3') {
    return <SampleDashboard3 />
  }

  if (pathname === '/play/sample4') {
    return <SampleDashboard4 />
  }

  if (pathname === '/play/sample5') {
    return <SampleDashboard5 />
  }

  return (
    <AuthProvider>
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <AppInner />
      </Suspense>
    </AuthProvider>
  )
}

export default App
