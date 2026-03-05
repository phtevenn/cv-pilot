import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import VersionSelector from './VersionSelector'
import type { Margins, VersionMeta } from '../api/client'
import { navigate } from '../utils/navigate'

const NAV_PAGES = [
  { path: '/', label: 'Resume Editor' },
  { path: '/jobs', label: 'Find Jobs' },
  { path: '/applications', label: 'Applications' },
]

function NavDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-gray-200 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800"
      >
        Resume Editor
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-40">
          {NAV_PAGES.map((page) => (
            <button
              key={page.path}
              onClick={() => {
                setOpen(false)
                navigate(page.path)
              }}
              className={`w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 rounded-md transition-colors ${
                page.path === '/' ? 'text-indigo-400 font-medium' : ''
              }`}
            >
              {page.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface DiffControls {
  pendingCount: number
  totalCount: number
  onAcceptAll: () => void
  onDeclineAll: () => void
}

interface ToolbarProps {
  saving: boolean
  onOptimize: () => void
  onExportPdf: () => void
  exporting: boolean
  versions: VersionMeta[]
  activeVersionId: string | null
  onSelectVersion: (id: string) => void
  onNewVersion: () => void
  onRenameVersion: () => void
  onDeleteVersion: () => void
  onExportMd: () => void
  onImportMd: React.ChangeEventHandler<HTMLInputElement>
  onImportPdf: React.ChangeEventHandler<HTMLInputElement>
  importingPdf: boolean
  margins: Margins
  onMarginsChange: (m: Margins) => void
  diffControls?: DiffControls
  showChat: boolean
  onToggleChat: () => void
}

function MarginPopover({ margins, onChange }: { margins: Margins; onChange: (m: Margins) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const field = (label: string, key: keyof Margins) => (
    <label key={key} className="flex flex-col gap-1">
      <span className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</span>
      <input
        type="number"
        value={margins[key]}
        onChange={(e) => onChange({ ...margins, [key]: parseFloat(e.target.value) || 0 })}
        step={0.05}
        min={0}
        max={2}
        className="w-16 bg-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </label>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          open ? 'bg-gray-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
      >
        Margins
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl p-4 z-20 shadow-xl">
          <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-3">PDF Margins (inches)</p>
          <div className="grid grid-cols-2 gap-3">
            {field('Top', 'top')}
            {field('Bottom', 'bottom')}
            {field('Left', 'left')}
            {field('Right', 'right')}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Toolbar({
  saving,
  onOptimize,
  onExportPdf,
  exporting,
  versions,
  activeVersionId,
  onSelectVersion,
  onNewVersion,
  onRenameVersion,
  onDeleteVersion,
  onExportMd,
  onImportMd,
  onImportPdf,
  importingPdf,
  margins,
  onMarginsChange,
  diffControls,
  showChat,
  onToggleChat,
}: ToolbarProps) {
  const { user, logout } = useAuth()

  const saveStatus = saving ? (
    <span className="text-gray-500">Saving…</span>
  ) : (
    <span className="text-gray-500">Saved</span>
  )

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-white font-semibold text-sm tracking-tight">CV Pilot</span>
        <NavDropdown />
        <VersionSelector
          versions={versions}
          activeVersionId={activeVersionId}
          onSelect={onSelectVersion}
          onNew={onNewVersion}
          onRename={onRenameVersion}
          onDelete={onDeleteVersion}
        />
        <span className="text-xs">{saveStatus}</span>
      </div>

      <div className="flex items-center gap-2">
        {diffControls ? (
          <>
            <span className="text-gray-400 text-xs">
              {diffControls.pendingCount > 0
                ? `${diffControls.pendingCount} of ${diffControls.totalCount} pending`
                : `${diffControls.totalCount} changes reviewed`}
            </span>
            <button
              onClick={diffControls.onAcceptAll}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              ✓ Accept All
            </button>
            <button
              onClick={diffControls.onDeclineAll}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              ✗ Decline All
            </button>
          </>
        ) : (
          <button
            onClick={onOptimize}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            ✦ Optimize with AI
          </button>
        )}

        <button
          onClick={onToggleChat}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showChat
              ? 'bg-indigo-700 text-white ring-1 ring-indigo-400'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          ✦ Chat
        </button>

        <button
          onClick={onExportPdf}
          disabled={exporting}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>

        <MarginPopover margins={margins} onChange={onMarginsChange} />

        <button
          onClick={onExportMd}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Export .md
        </button>

        <label className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer">
          Import .md
          <input
            type="file"
            accept=".md,text/markdown"
            className="sr-only"
            onChange={onImportMd}
          />
        </label>

        <label
          className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors ${
            importingPdf
              ? 'bg-gray-600 opacity-60 cursor-not-allowed'
              : 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
          }`}
        >
          {importingPdf ? 'Importing…' : 'Import PDF'}
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            disabled={importingPdf}
            onChange={onImportPdf}
          />
        </label>

        {user && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-700">
            {user.picture && (
              <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full"
              />
            )}
            <span className="text-gray-400 text-xs hidden sm:block">{user.name}</span>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
