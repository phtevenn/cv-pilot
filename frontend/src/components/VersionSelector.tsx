import { useEffect, useRef, useState } from 'react'
import type { VersionMeta } from '../api/client'

interface VersionSelectorProps {
  versions: VersionMeta[]
  activeVersionId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: () => void
  onDelete: () => void
}

export default function VersionSelector({
  versions,
  activeVersionId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: VersionSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = versions.find((v) => v.id === activeVersionId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors border border-gray-600"
      >
        <svg
          className="w-3 h-3 text-gray-400 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 4h12M2 8h8M2 12h5" />
        </svg>
        <span className="max-w-[140px] truncate">{active?.name ?? 'No version'}</span>
        <svg
          className="w-3 h-3 text-gray-400 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[200px] bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          <div className="py-1 max-h-48 overflow-y-auto">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  onSelect(v.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  v.id === activeVersionId
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-200 hover:bg-gray-700'
                }`}
              >
                <span className="flex-1 truncate">{v.name}</span>
                {v.id === activeVersionId && <span className="text-indigo-300 shrink-0">✓</span>}
              </button>
            ))}
          </div>

          <div className="border-t border-gray-600 py-1">
            <button
              onClick={() => {
                onNew()
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
            >
              + New version
            </button>
            <button
              onClick={() => {
                onRename()
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
            >
              Rename
            </button>
            <button
              onClick={() => {
                onDelete()
                setOpen(false)
              }}
              disabled={versions.length <= 1}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
