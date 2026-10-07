import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import DeviceDetail from './pages/DeviceDetail'
import Policies from './pages/Policies'
import Groups from './pages/Groups'
import Users from './pages/Users'
import AuditLogPage from './pages/AuditLog'
import SessionsPage from './pages/Sessions'
import CompliancePage from './pages/Compliance'
import Layout from './components/Layout'
import api from './services/api'

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('mdm_token')
  )

  useEffect(() => {
    if (token) {
      localStorage.setItem('mdm_token', token)
    } else {
      localStorage.removeItem('mdm_token')
    }
  }, [token])

  if (!token) {
    return <Login onLogin={setToken} />
  }

  const handleLogout = () => {
    // Fire-and-forget: revokes the session server-side too, not just locally. If
    // this fails (e.g. already offline), the local logout still proceeds - a user
    // should never get stuck unable to log out just because the revoke call failed.
    api.post('/auth/logout').catch(() => {})
    localStorage.removeItem('mdm_role')
    localStorage.removeItem('mdm_email')
    setToken(null)
  }

  return (
    <Layout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default App
