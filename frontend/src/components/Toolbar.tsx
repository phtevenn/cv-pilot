import { useEffect, useRef, useState } from 'react'
import VersionSelector from './VersionSelector'
import type { Margins, ResumeMeta, VersionMeta } from '../api/client'

// ── Resume selector ──────────────────────────────────────────────────────────

interface ResumeSelectorProps {
  resumes: ResumeMeta[]
  activeResumeId: string | null
  onSwitch: (id: string) => void
  onNew: () => void
  onClone: () => void
}

function ResumeSelector({ resumes, activeResumeId, onSwitch, onNew, onClone }: ResumeSelectorProps) {
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

  const label = resumes.find((r) => r.id === activeResumeId)?.name ?? 'Resume'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors border border-gray-600"
        title="Switch resume"
      >
        <span className="max-w-[100px] truncate">{label}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-48">
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => { setOpen(false); onSwitch(r.id) }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 rounded-t-lg transition-colors ${
                r.id === activeResumeId ? 'text-indigo-400 font-medium' : 'text-gray-200'
              }`}
            >
              {r.name}
            </button>
          ))}
          <div className="border-t border-gray-700 pt-1 pb-1">
            <button
              onClick={() => { setOpen(false); onNew() }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
            >
              + New Resume
            </button>
            <button
              onClick={() => { setOpen(false); onClone() }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-b-lg transition-colors"
            >
              Clone Current
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Margins popover ───────────────────────────────────────────────────────────

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
        className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-gray-700 rounded-md ${open ? 'text-white' : 'text-gray-200'}`}
      >
        PDF Margins
      </button>
      {open && (
        <div className="absolute right-0 top-0 -translate-y-full -mt-1 bg-gray-800 border border-gray-700 rounded-xl p-4 z-50 shadow-xl">
          <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-3">Margins (inches)</p>
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

// ── Overflow "···" menu ───────────────────────────────────────────────────────

interface OverflowMenuProps {
  margins: Margins
  onMarginsChange: (m: Margins) => void
  onExportPdf: () => void
  exporting: boolean
  onExportMd: () => void
  onImportMd: React.ChangeEventHandler<HTMLInputElement>
  onImportPdf: React.ChangeEventHandler<HTMLInputElement>
  importingPdf: boolean
  // mobile-only extras
  showMobileAiActions?: boolean
  onOptimize?: () => void
  onCoverLetter?: () => void
  showChat?: boolean
  onToggleChat?: () => void
}

function OverflowMenu({
  margins,
  onMarginsChange,
  onExportPdf,
  exporting,
  onExportMd,
  onImportMd,
  onImportPdf,
  importingPdf,
  showMobileAiActions,
  onOptimize,
  onCoverLetter,
  showChat,
  onToggleChat,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const mdImportRef = useRef<HTMLInputElement>(null)
  const pdfImportRef = useRef<HTMLInputElement>(null)

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
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          open ? 'bg-gray-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
        title="More options"
      >
        ···
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-44 py-1">
          {showMobileAiActions && (
            <>
              <button
                onClick={() => { setOpen(false); onOptimize?.() }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
              >
                ✦ Optimize with AI
              </button>
              <button
                onClick={() => { setOpen(false); onCoverLetter?.() }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
              >
                ✦ Cover Letter
              </button>
              <button
                onClick={() => { setOpen(false); onToggleChat?.() }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors ${
                  showChat ? 'text-indigo-400' : 'text-gray-200'
                }`}
              >
                ✦ Chat {showChat ? '(on)' : ''}
              </button>
              <div className="border-t border-gray-700 my-1" />
            </>
          )}

          <button
            onClick={() => { setOpen(false); onExportPdf() }}
            disabled={exporting}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>

          <MarginPopover margins={margins} onChange={onMarginsChange} />

          <div className="border-t border-gray-700 my-1" />

          <button
            onClick={() => { setOpen(false); onExportMd() }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
          >
            Export .md
          </button>

          {/* Hidden file inputs */}
          <input
            ref={mdImportRef}
            type="file"
            accept=".md,text/markdown"
            className="sr-only"
            onChange={(e) => { setOpen(false); onImportMd(e) }}
          />
          <input
            ref={pdfImportRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            disabled={importingPdf}
            onChange={(e) => { setOpen(false); onImportPdf(e) }}
          />

          <button
            onClick={() => mdImportRef.current?.click()}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
          >
            Import .md
          </button>
          <button
            onClick={() => pdfImportRef.current?.click()}
            disabled={importingPdf}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {importingPdf ? 'Importing…' : 'Import PDF'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Toolbar (editor-specific secondary bar) ───────────────────────────────────

export interface DiffControls {
  pendingCount: number
  totalCount: number
  onAcceptAll: () => void
  onDeclineAll: () => void
}

interface ToolbarProps {
  saving: boolean
  onOptimize: () => void
  onCoverLetter: () => void
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
  resumes: ResumeMeta[]
  activeResumeId: string | null
  onSwitchResume: (id: string) => void
  onNewResume: () => void
  onCloneResume: () => void
}

export default function Toolbar({
  saving,
  onOptimize,
  onCoverLetter,
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
  resumes,
  activeResumeId,
  onSwitchResume,
  onNewResume,
  onCloneResume,
}: ToolbarProps) {
  const saveStatus = saving ? (
    <span className="text-gray-500 text-xs">Saving…</span>
  ) : (
    <span className="text-gray-500 text-xs">Saved</span>
  )

  const overflowProps = {
    margins,
    onMarginsChange,
    onExportPdf,
    exporting,
    onExportMd,
    onImportMd,
    onImportPdf,
    importingPdf,
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
      {/* Left: context selectors */}
      <div className="flex items-center gap-1.5 min-w-0">
        <ResumeSelector
          resumes={resumes}
          activeResumeId={activeResumeId}
          onSwitch={onSwitchResume}
          onNew={onNewResume}
          onClone={onCloneResume}
        />
        <VersionSelector
          versions={versions}
          activeVersionId={activeVersionId}
          onSelect={onSelectVersion}
          onNew={onNewVersion}
          onRename={onRenameVersion}
          onDelete={onDeleteVersion}
        />
        <span className="hidden sm:inline">{saveStatus}</span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {diffControls ? (
          /* Diff review mode */
          <>
            <span className="text-gray-400 text-xs hidden sm:inline">
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
          <>
            {/* Desktop: show primary AI actions inline */}
            <button
              onClick={onOptimize}
              className="hidden sm:inline-flex px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              ✦ Optimize
            </button>
            <button
              onClick={onCoverLetter}
              className="hidden sm:inline-flex px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              ✦ Cover Letter
            </button>
            <button
              onClick={onToggleChat}
              className={`hidden sm:inline-flex px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showChat
                  ? 'bg-indigo-700 text-white ring-1 ring-indigo-400'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              ✦ Chat
            </button>

            {/* Desktop overflow: export/import/margins */}
            <div className="hidden sm:block">
              <OverflowMenu {...overflowProps} />
            </div>

            {/* Mobile: single overflow with everything */}
            <div className="sm:hidden">
              <OverflowMenu
                {...overflowProps}
                showMobileAiActions
                onOptimize={onOptimize}
                onCoverLetter={onCoverLetter}
                showChat={showChat}
                onToggleChat={onToggleChat}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
