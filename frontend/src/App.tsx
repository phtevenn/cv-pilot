import { useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import EditorPage from './pages/EditorPage'

function AppInner() {
  const { user, login, isLoading } = useAuth()

  useEffect(() => {
    if (window.location.pathname !== '/auth/callback') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      login(token)
      window.history.replaceState({}, '', '/')
    }
  }, [login])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    )
  }

  return user ? <EditorPage /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
