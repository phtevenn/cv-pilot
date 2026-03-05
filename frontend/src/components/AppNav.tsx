import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../utils/navigate'

const PAGES = [
  { path: '/', label: 'Resume Editor' },
  { path: '/jobs', label: 'Find Jobs' },
  { path: '/applications', label: 'Applications' },
]

interface AppNavProps {
  currentPath: string
}

export function AppNav({ currentPath }: AppNavProps) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen])

  return (
    <header
      ref={headerRef}
      className="relative flex items-center px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0 z-20"
    >
      {/* Logo */}
      <span className="text-white font-semibold text-sm tracking-tight shrink-0">CV Pilot</span>

      {/* Desktop nav tabs */}
      <nav className="hidden sm:flex items-center gap-0.5 ml-4 flex-1">
        {PAGES.map((page) => (
          <button
            key={page.path}
            onClick={() => navigate(page.path)}
            className={`relative px-3 py-1.5 text-sm rounded-lg transition-colors ${
              page.path === currentPath
                ? 'text-white font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {page.label}
            {page.path === currentPath && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        ))}
      </nav>

      {/* Mobile: hamburger button */}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="sm:hidden ml-3 p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
      >
        {menuOpen ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-gray-900 border-b border-gray-700 z-50 shadow-xl">
          {PAGES.map((page) => (
            <button
              key={page.path}
              onClick={() => {
                setMenuOpen(false)
                navigate(page.path)
              }}
              className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-gray-800 last:border-b-0 ${
                page.path === currentPath
                  ? 'text-indigo-400 font-medium bg-gray-800/50'
                  : 'text-gray-200 hover:bg-gray-800'
              }`}
            >
              {page.label}
            </button>
          ))}
        </div>
      )}

      {/* User section */}
      {user && (
        <div className="flex items-center gap-2 ml-auto pl-3 border-l border-gray-700 shrink-0">
          {user.picture && (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full"
            />
          )}
          <span className="text-gray-400 text-xs hidden md:block">{user.name}</span>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
