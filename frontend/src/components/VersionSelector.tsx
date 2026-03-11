import { useEffect, useRef, useState } from 'react'
import type { VersionMeta } from '../api/client'

interface VersionSelectorProps {
  versions: VersionMeta[]
  activeVersionId: string | null
  onSelect: (id: string) => void
  onNew: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  } catch {
    return ''
  }
}

type InlineAction =
  | { type: 'none' }
  | { type: 'creating' }
  | { type: 'renaming'; id: string }
  | { type: 'deleting'; id: string }

export default function VersionSelector({
  versions,
  activeVersionId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onDuplicate,
}: VersionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<InlineAction>({ type: 'none' })
  const [inputValue, setInputValue] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const active = versions.find((v) => v.id === activeVersionId)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAction({ type: 'none' })
        setInputValue('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (action.type !== 'none') {
          setAction({ type: 'none' })
          setInputValue('')
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, action])

  // Focus input when entering an edit mode
  useEffect(() => {
    if (action.type === 'creating' || action.type === 'renaming') {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [action])

  const cancel = () => {
    setAction({ type: 'none' })
    setInputValue('')
  }

  const commitCreate = () => {
    const name = inputValue.trim()
    if (!name) return
    onNew(name)
    setAction({ type: 'none' })
    setInputValue('')
    setOpen(false)
  }

  const commitRename = (id: string) => {
    const name = inputValue.trim()
    if (!name) return
    onRename(id, name)
    setAction({ type: 'none' })
    setInputValue('')
  }

  const startCreating = (e: React.MouseEvent) => {
    e.stopPropagation()
    setAction({ type: 'creating' })
    setInputValue('')
  }

  const startRenaming = (e: React.MouseEvent, v: VersionMeta) => {
    e.stopPropagation()
    setAction({ type: 'renaming', id: v.id })
    setInputValue(v.name)
  }

  const startDeleting = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setAction({ type: 'deleting', id })
  }

  const confirmDelete = (id: string) => {
    onDelete(id)
    setAction({ type: 'none' })
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors border border-gray-600"
      >
        <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4h12M2 8h8M2 12h5" />
        </svg>
        <span className="max-w-[140px] truncate">{active?.name ?? 'No version'}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Versions</span>
            <button
              onClick={startCreating}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              + New
            </button>
          </div>

          {/* Version list */}
          <div className="max-h-56 overflow-y-auto">
            {versions.map((v) => {
              if (action.type === 'renaming' && action.id === v.id) {
                return (
                  <div key={v.id} className="flex items-center gap-1.5 px-3 py-2 bg-gray-750 border-b border-gray-700/50">
                    <input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(v.id)
                        if (e.key === 'Escape') cancel()
                      }}
                      className="flex-1 min-w-0 bg-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button onClick={() => commitRename(v.id)} className="text-green-400 hover:text-green-300 px-0.5 shrink-0" title="Confirm">✓</button>
                    <button onClick={cancel} className="text-gray-500 hover:text-gray-300 px-0.5 shrink-0" title="Cancel">✕</button>
                  </div>
                )
              }

              if (action.type === 'deleting' && action.id === v.id) {
                return (
                  <div key={v.id} className="px-3 py-2.5 bg-red-950/40 border-b border-red-900/30">
                    <p className="text-red-300 text-xs mb-2 truncate">Delete "{v.name}"?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={cancel}
                        className="flex-1 text-xs text-gray-400 hover:text-gray-200 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmDelete(v.id)}
                        className="flex-1 text-xs text-red-300 hover:text-red-200 py-1 rounded bg-red-900/50 hover:bg-red-900/70 transition-colors font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              }

              const isActive = v.id === activeVersionId
              return (
                <div
                  key={v.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-700/60 transition-colors border-b border-gray-700/30 last:border-0 ${
                    isActive ? 'bg-gray-700/40' : ''
                  }`}
                  onClick={() => {
                    if (action.type !== 'none') return
                    onSelect(v.id)
                    setOpen(false)
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="text-indigo-400 shrink-0 text-[10px]">✓</span>
                      )}
                      <span className={`text-xs truncate ${isActive ? 'text-white font-medium' : 'text-gray-200'}`}>
                        {v.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-600 mt-0.5 block">
                      {formatRelativeTime(v.updated_at)}
                    </span>
                  </div>

                  {/* Per-row hover actions */}
                  <div
                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => startRenaming(e, v)}
                      className="p-1 text-gray-500 hover:text-gray-200 rounded transition-colors"
                      title="Rename"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate(v.id); setOpen(false) }}
                      className="p-1 text-gray-500 hover:text-gray-200 rounded transition-colors"
                      title="Duplicate"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="5" width="8" height="8" rx="1" />
                        <path d="M3 11V3h8" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => startDeleting(e, v.id)}
                      disabled={versions.length <= 1}
                      className="p-1 text-gray-500 hover:text-red-400 rounded transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Inline create row */}
          {action.type === 'creating' && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-700">
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCreate()
                  if (e.key === 'Escape') cancel()
                }}
                placeholder="Version name…"
                className="flex-1 min-w-0 bg-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-500"
              />
              <button onClick={commitCreate} className="text-green-400 hover:text-green-300 px-0.5 shrink-0" title="Create">✓</button>
              <button onClick={cancel} className="text-gray-500 hover:text-gray-300 px-0.5 shrink-0" title="Cancel">✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
