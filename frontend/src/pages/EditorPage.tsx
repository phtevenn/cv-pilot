import { useCallback, useEffect, useRef, useState } from 'react'
import Toolbar from '../components/Toolbar'
import type { DiffControls } from '../components/Toolbar'
import OptimizeModal from '../components/OptimizeModal'
import ChatPanel from '../components/ChatPanel'
import BlockEditor from '../components/BlockEditor'
import BlockResumePreview from '../components/BlockResumePreview'
import BlockDiffView from '../components/BlockDiffView'
import { api, DEFAULT_MARGINS } from '../api/client'
import type { ChatMessage, Margins, VersionMeta } from '../api/client'
import {
  computeBlockDiff,
  resolveBlockDiff,
  countBlockDiffPending,
  countBlockDiffTotal,
} from '../utils/blockDiff'
import type { BlockDiffEntry, BlockDiffStatus } from '../utils/blockDiff'
import {
  blocksToMarkdown,
  deserializeBlocks,
  migrateMarkdownToBlocks,
  serializeBlocks,
} from '../utils/blocks'
import type { ResumeBlock } from '../types/blocks'

const AUTOSAVE_DELAY_MS = 800
const MARGINS_STORAGE_KEY = 'cv_pilot_margins'

export default function EditorPage() {
  const [content, setContent] = useState('')
  const [blocks, setBlocks] = useState<ResumeBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showOptimize, setShowOptimize] = useState(() => {
    return !!sessionStorage.getItem('cv_pilot_prefill_job')
  })
  const [blocksLoaded, setBlocksLoaded] = useState(false)
  const [prefillJob] = useState<string>(() => {
    const prefill = sessionStorage.getItem('cv_pilot_prefill_job') ?? ''
    if (prefill) sessionStorage.removeItem('cv_pilot_prefill_job')
    return prefill
  })
  const [exporting, setExporting] = useState(false)
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [blockDiff, setBlockDiff] = useState<BlockDiffEntry[] | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [editorWidthPct, setEditorWidthPct] = useState(50)
  const [chatHeight, setChatHeight] = useState(320)
  const panesRef = useRef<HTMLDivElement>(null)
  const [margins, setMargins] = useState<Margins>(() => {
    try {
      const stored = localStorage.getItem(MARGINS_STORAGE_KEY)
      return stored ? (JSON.parse(stored) as Margins) : DEFAULT_MARGINS
    } catch {
      return DEFAULT_MARGINS
    }
  })
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const printRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef(content)
  const blocksRef = useRef(blocks)

  // Keep refs in sync so async handlers always see the latest values
  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  // Auto-apply when all block diff entries have been accepted or declined
  useEffect(() => {
    if (!blockDiff) return
    if (countBlockDiffPending(blockDiff) === 0) {
      const finalBlocks = resolveBlockDiff(blockDiff)
      setBlocks(finalBlocks)
      handleChange(serializeBlocks(finalBlocks))
      setBlockDiff(null)
    }
    // handleChange is stable; blockDiff identity changes only when we update it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockDiff])

  const initBlocks = (markdown: string) => {
    const loaded = deserializeBlocks(markdown)
    setBlocks(loaded.length > 0 ? loaded : migrateMarkdownToBlocks(markdown))
  }

  useEffect(() => {
    Promise.all([api.getResume(), api.listVersions()])
      .then(([resume, vers]) => {
        setContent(resume.content)
        initBlocks(resume.content)
        setVersions(vers)
        const active = vers.find((v) => v.is_active)
        if (active) setActiveVersionId(active.id)
        setBlocksLoaded(true)
      })
      .catch((e: unknown) => console.error('Failed to load resume:', e))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    await api.saveResume(contentRef.current)
  }, [])

  const handleChange = useCallback((value: string) => {
    setContent(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      setSaveError(null)
      try {
        await api.saveResume(value)
      } catch {
        setSaveError('Save failed')
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DELAY_MS)
  }, [])

  const handleBlocks = useCallback(
    (newBlocks: ResumeBlock[]) => {
      setBlocks(newBlocks)
      handleChange(serializeBlocks(newBlocks))
    },
    [handleChange],
  )

  const handleExportPdf = async () => {
    setExporting(true)
    try {
      const el = printRef.current
      if (!el) throw new Error('Print target not found')
      const blob = await api.exportPdf(el.innerHTML, margins)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'resume.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const handleSelectVersion = useCallback(
    async (id: string) => {
      if (id === activeVersionId) return
      await flushSave()
      const data = await api.loadVersion(id)
      setContent(data.content)
      initBlocks(data.content)
      setActiveVersionId(id)
      const vers = await api.listVersions()
      setVersions(vers)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeVersionId, flushSave],
  )

  const handleNewVersion = useCallback(async () => {
    const name = window.prompt('Version name:')
    if (!name?.trim()) return
    await flushSave()
    const meta = await api.createVersion(name.trim(), contentRef.current)
    setActiveVersionId(meta.id)
    const vers = await api.listVersions()
    setVersions(vers)
  }, [flushSave])

  const handleRenameVersion = useCallback(async () => {
    const active = versions.find((v) => v.id === activeVersionId)
    if (!active) return
    const newName = window.prompt('New name:', active.name)
    if (!newName?.trim() || newName.trim() === active.name) return
    await api.updateVersion(active.id, { name: newName.trim() })
    const vers = await api.listVersions()
    setVersions(vers)
  }, [versions, activeVersionId])

  const handleDeleteVersion = useCallback(async () => {
    if (versions.length <= 1) return
    const active = versions.find((v) => v.id === activeVersionId)
    if (!window.confirm(`Delete version "${active?.name}"? This cannot be undone.`)) return
    await api.deleteVersion(activeVersionId!)
    const [resume, vers] = await Promise.all([api.getResume(), api.listVersions()])
    setContent(resume.content)
    initBlocks(resume.content)
    setVersions(vers)
    const newActive = vers.find((v) => v.is_active)
    if (newActive) setActiveVersionId(newActive.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, activeVersionId])

  const handleExportMd = useCallback(() => {
    const active = versions.find((v) => v.id === activeVersionId)
    const filename = `${active?.name ?? 'resume'}.md`
    const blob = new Blob([contentRef.current], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [versions, activeVersionId])

  const handleImportMd: React.ChangeEventHandler<HTMLInputElement> = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const defaultName = file.name.replace(/\.md$/i, '')
    const name = window.prompt('Version name:', defaultName)
    if (!name?.trim()) return
    const meta = await api.createVersion(name.trim(), text)
    setContent(text)
    initBlocks(text)
    setActiveVersionId(meta.id)
    const vers = await api.listVersions()
    setVersions(vers)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Block diff handlers ───────────────────────────────────────────────────

  const handleRevision = useCallback((revised: string) => {
    const revisedBlocks = deserializeBlocks(revised)
    const normalised = revisedBlocks.length > 0 ? revisedBlocks : migrateMarkdownToBlocks(revised)
    const entries = computeBlockDiff(blocksRef.current, normalised)
    if (countBlockDiffTotal(entries) === 0) return
    setBlockDiff(entries)
  }, [])

  const handleAcceptBlock = useCallback((id: string) => {
    setBlockDiff((prev) =>
      prev
        ? prev.map((e) => (e.id === id ? { ...e, status: 'accepted' as BlockDiffStatus } : e))
        : null,
    )
  }, [])

  const handleDeclineBlock = useCallback((id: string) => {
    setBlockDiff((prev) =>
      prev
        ? prev.map((e) => (e.id === id ? { ...e, status: 'declined' as BlockDiffStatus } : e))
        : null,
    )
  }, [])

  const handleAcceptAll = useCallback(() => {
    setBlockDiff((prev) =>
      prev
        ? prev.map((e) =>
            e.changeType !== 'unchanged' ? { ...e, status: 'accepted' as BlockDiffStatus } : e,
          )
        : null,
    )
  }, [])

  const handleDeclineAll = useCallback(() => {
    setBlockDiff((prev) =>
      prev
        ? prev.map((e) =>
            e.changeType !== 'unchanged' ? { ...e, status: 'declined' as BlockDiffStatus } : e,
          )
        : null,
    )
  }, [])

  const handleMarginsChange = useCallback((m: Margins) => {
    setMargins(m)
    localStorage.setItem(MARGINS_STORAGE_KEY, JSON.stringify(m))
  }, [])

  const pageBreakHeight = Math.round((11 - margins.top - margins.bottom) * 96)
  const printableWidthPx = Math.round((8.5 - margins.left - margins.right) * 96)

  const handleVerticalDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startPct = editorWidthPct
    const containerWidth = panesRef.current?.getBoundingClientRect().width ?? 1
    const onMove = (ev: MouseEvent) => {
      const deltaPct = ((ev.clientX - startX) / containerWidth) * 100
      setEditorWidthPct(Math.min(80, Math.max(20, startPct + deltaPct)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const diffControls: DiffControls | undefined = blockDiff
    ? {
        pendingCount: countBlockDiffPending(blockDiff),
        totalCount: countBlockDiffTotal(blockDiff),
        onAcceptAll: handleAcceptAll,
        onDeclineAll: handleDeclineAll,
      }
    : undefined

  // Live preview: show the resolved state while reviewing block changes
  const previewBlocks = blockDiff ? resolveBlockDiff(blockDiff) : blocks

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Toolbar
        saving={saving}
        saveError={saveError}
        onOptimize={() => setShowOptimize(true)}
        onExportPdf={handleExportPdf}
        exporting={exporting}
        versions={versions}
        activeVersionId={activeVersionId}
        onSelectVersion={handleSelectVersion}
        onNewVersion={handleNewVersion}
        onRenameVersion={handleRenameVersion}
        onDeleteVersion={handleDeleteVersion}
        onExportMd={handleExportMd}
        onImportMd={handleImportMd}
        margins={margins}
        onMarginsChange={handleMarginsChange}
        diffControls={diffControls}
        showChat={showChat}
        onToggleChat={() => setShowChat((v) => !v)}
      />

      <div className="flex flex-col flex-1 min-h-0">
        <div ref={panesRef} className="flex flex-1 min-h-0">
          {/* Block editor / diff pane */}
          <div className="min-w-0 overflow-hidden bg-gray-900 flex flex-col" style={{ width: `${editorWidthPct}%` }}>
            {blockDiff ? (
              <BlockDiffView
                entries={blockDiff}
                onAccept={handleAcceptBlock}
                onDecline={handleDeclineBlock}
                onAcceptAll={handleAcceptAll}
                onDeclineAll={handleDeclineAll}
              />
            ) : (
              <div className="overflow-auto flex-1">
                <BlockEditor blocks={blocks} onChange={handleBlocks} />
              </div>
            )}
          </div>

          {/* Vertical resize handle */}
          <div
            onMouseDown={handleVerticalDividerMouseDown}
            className="w-1 shrink-0 cursor-col-resize bg-gray-700 hover:bg-indigo-500 active:bg-indigo-400 transition-colors"
          />

          {/* Preview pane — always shows the live resume */}
          <div className="min-w-0 overflow-auto bg-gray-100 p-6 flex-1">
            <div className="relative mx-auto" style={{ width: `${printableWidthPx}px` }}>
              <BlockResumePreview blocks={previewBlocks} />
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="absolute inset-x-0 flex items-center gap-2 z-10 pointer-events-none"
                  style={{ top: `${n * pageBreakHeight}px` }}
                >
                  <div className="flex-1 border-t-2 border-dashed border-blue-300 opacity-60" />
                  <span className="shrink-0 bg-blue-50 text-blue-400 text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-200">
                    Page {n + 1}
                  </span>
                  <div className="flex-1 border-t-2 border-dashed border-blue-300 opacity-60" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {showChat && (
          <ChatPanel
            messages={chatMessages}
            onMessagesChange={setChatMessages}
            resume={blocksToMarkdown(blocks)}
            onRevision={handleRevision}
            onClose={() => setShowChat(false)}
            height={chatHeight}
            onHeightChange={setChatHeight}
          />
        )}
      </div>

      {showOptimize && blocksLoaded && (
        <OptimizeModal
          resumeContent={blocksToMarkdown(blocks)}
          onClose={() => setShowOptimize(false)}
          onRevision={handleRevision}
          initialJobDescription={prefillJob || undefined}
        />
      )}

      {/* Hidden print target */}
      <div
        ref={printRef}
        id="resume-print-target"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', top: 0, width: `${printableWidthPx}px`, pointerEvents: 'none' }}
      >
        <BlockResumePreview blocks={blocks} />
      </div>
    </div>
  )
}
