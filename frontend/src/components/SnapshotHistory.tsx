import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../api/client'

interface SnapshotHistoryProps {
  snapshots: Snapshot[]
  onRestore: (id: string) => void
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

export default function SnapshotHistory({ snapshots, onRestore }: SnapshotHistoryProps) {
  const [open, setOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmId) setConfirmId(null)
        else setOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, confirmId])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="AI edit history"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
          open
            ? 'bg-gray-700 border-gray-500 text-white'
            : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
      >
        {/* Clock icon */}
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 2" />
        </svg>
        <span className="hidden sm:inline">History</span>
        {snapshots.length > 0 && (
          <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {snapshots.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">AI Edit History</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Snapshots taken before each AI edit</p>
          </div>

          {snapshots.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-gray-600 text-xs">No history yet.</p>
              <p className="text-gray-700 text-[10px] mt-1">AI edits will appear here.</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {snapshots.map((snap) => (
                <div key={snap.id} className="border-b border-gray-700/40 last:border-0">
                  {confirmId === snap.id ? (
                    <div className="px-3 py-2.5 bg-amber-950/30">
                      <p className="text-amber-300 text-xs mb-2">
                        Restore to "{snap.label}"?<br />
                        <span className="text-amber-500/70 text-[10px]">Current state will be auto-saved first.</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmId(null)}
                          className="flex-1 text-xs text-gray-400 hover:text-gray-200 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            onRestore(snap.id)
                            setConfirmId(null)
                            setOpen(false)
                          }}
                          className="flex-1 text-xs text-amber-300 hover:text-amber-200 py-1 rounded bg-amber-900/50 hover:bg-amber-900/70 transition-colors font-medium"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700/40 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200 truncate">{snap.label}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">{formatRelativeTime(snap.created_at)}</p>
                      </div>
                      <button
                        onClick={() => setConfirmId(snap.id)}
                        className="shrink-0 text-[10px] text-gray-500 hover:text-amber-400 px-2 py-1 rounded hover:bg-amber-900/20 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Restore
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
