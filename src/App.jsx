import { lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import './App.css'

const LoginPage = lazy(() => import('./auth/LoginPage'))
const Dashboard = lazy(() => import('./pages/sample/SampleDashboard4'))

function AppInner() {
  const { auth } = useAuth()
  if (!auth) return <LoginPage />
  return <Dashboard />
}

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <AppInner />
      </Suspense>
    </AuthProvider>
  )
}

export default App
