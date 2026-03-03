import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import EditorPage from './pages/EditorPage'
import JobsPage from './pages/JobsPage'
import ApplicationsPage from './pages/ApplicationsPage'

function AppInner() {
  const { user, login, isLoading } = useAuth()
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const handler = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  useEffect(() => {
    if (window.location.pathname !== '/auth/callback') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      login(token)
      window.history.replaceState({}, '', '/')
      setPath('/')
    }
  }, [login])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    )
  }

  if (!user) return <LoginPage />
  if (path === '/jobs') return <JobsPage />
  if (path === '/applications') return <ApplicationsPage />
  return <EditorPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
