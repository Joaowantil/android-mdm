import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import DeviceDetail from './pages/DeviceDetail'
import Policies from './pages/Policies'
import Layout from './components/Layout'

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

  return (
    <Layout onLogout={() => setToken(null)}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default App
