import { useEffect, useRef, useState } from 'react'
import { navigate } from '../utils/navigate'

const PAGES = [
  { path: '/', label: 'Resume Editor' },
  { path: '/jobs', label: 'Find Jobs' },
  { path: '/applications', label: 'Applications' },
]

interface NavBarProps {
  currentPath: string
}

export function NavBar({ currentPath }: NavBarProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const currentPage = PAGES.find((p) => p.path === currentPath)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
      <span className="text-white font-semibold text-sm tracking-tight">CV Pilot</span>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-gray-200 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          {currentPage?.label ?? 'Navigate'}
          <span className="text-gray-400 text-xs">▾</span>
        </button>

        {open && (
          <div className="absolute top-full mt-1 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-40">
            {PAGES.map((page) => (
              <button
                key={page.path}
                onClick={() => {
                  setOpen(false)
                  navigate(page.path)
                }}
                className={`w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 rounded-md transition-colors ${
                  page.path === currentPath ? 'text-indigo-400 font-medium' : ''
                }`}
              >
                {page.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
