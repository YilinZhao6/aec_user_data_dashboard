import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import DashboardEntry from './pages/dashboardEntry/DashboardEntry'
import './App.css'

function AppInner() {
  const { auth } = useAuth()
  if (!auth) return <LoginPage />
  return <DashboardEntry />
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

export default App
