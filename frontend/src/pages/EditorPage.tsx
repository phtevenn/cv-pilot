import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AppNav } from '../components/AppNav'
import Toolbar from '../components/Toolbar'
import type { DiffControls } from '../components/Toolbar'
import OptimizeModal from '../components/OptimizeModal'
import OnboardingModal from '../components/OnboardingModal'
import CoverLetterModal from '../components/CoverLetterModal'
import ChatPanel from '../components/ChatPanel'
import BlockEditor from '../components/BlockEditor'
import BlockResumePreview from '../components/BlockResumePreview'
import BlockDiffView from '../components/BlockDiffView'
import { api, DEFAULT_MARGINS } from '../api/client'
import type { ChatMessage, Margins, ResumeMeta, Snapshot, VersionMeta } from '../api/client'
import {
  computeBlockDiff,
  resolveBlockDiff,
  countBlockDiffPending,
  countBlockDiffTotal,
} from '../utils/blockDiff'
import type { BlockDiffEntry, BlockDiffStatus } from '../utils/blockDiff'
import {
  applyPatch,
  blocksToMarkdown,
  deserializeBlocks,
  migrateMarkdownToBlocks,
  parsePatchBlocks,
  serializeBlocks,
} from '../utils/blocks'
import type { ResumeBlock } from '../types/blocks'

const AUTOSAVE_DELAY_MS = 800
const MARGINS_STORAGE_KEY = 'cv_pilot_margins'

export default function EditorPage() {
  const [content, setContent] = useState('')
  const [blocks, setBlocks] = useState<ResumeBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [showCoverLetter, setShowCoverLetter] = useState(false)
  const [showOptimize, setShowOptimize] = useState(() => {
    return !!sessionStorage.getItem('cv_pilot_prefill_job')
  })
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('cv_pilot_onboarded')
  })
  const [blocksLoaded, setBlocksLoaded] = useState(false)
  const [prefillJob] = useState<string>(() => {
    const prefill = sessionStorage.getItem('cv_pilot_prefill_job') ?? ''
    if (prefill) sessionStorage.removeItem('cv_pilot_prefill_job')
    return prefill
  })
  const [jobContext, setJobContext] = useState<{
    title: string
    company: string
    location: string
    apply_url: string
  } | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)
  const [applying, setApplying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importingPdf, setImportingPdf] = useState(false)
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [resumes, setResumes] = useState<ResumeMeta[]>([])
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [blockDiff, setBlockDiff] = useState<BlockDiffEntry[] | null>(null)
  const [diffApplied, setDiffApplied] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor')
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
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

  // When all block diff entries are accepted or declined: apply changes and show summary
  useEffect(() => {
    if (!blockDiff || diffApplied) return
    if (countBlockDiffPending(blockDiff) === 0) {
      const finalBlocks = resolveBlockDiff(blockDiff)
      setBlocks(finalBlocks)
      handleChange(serializeBlocks(finalBlocks))
      setDiffApplied(true)
    }
    // handleChange is stable; blockDiff identity changes only when we update it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockDiff, diffApplied])

  const initBlocks = (markdown: string) => {
    const loaded = deserializeBlocks(markdown)
    setBlocks(loaded.length > 0 ? loaded : migrateMarkdownToBlocks(markdown))
  }

  useEffect(() => {
    Promise.all([api.getResume(), api.listVersions(), api.listResumes(), api.listSnapshots()])
      .then(([resume, vers, resumeList, snaps]) => {
        setContent(resume.content)
        initBlocks(resume.content)
        setVersions(vers)
        const active = vers.find((v) => v.is_active)
        if (active) setActiveVersionId(active.id)
        setResumes(resumeList)
        const activeResume = resumeList.find((r) => r.is_active)
        if (activeResume) setActiveResumeId(activeResume.id)
        setSnapshots(snaps)
        setBlocksLoaded(true)
      })
      .catch((e: unknown) => console.error('Failed to load resume:', e))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const raw = sessionStorage.getItem('cv_pilot_job_context')
    if (raw) {
      try {
        setJobContext(JSON.parse(raw))
      } catch {
        // ignore
      }
    }
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
      try {
        await api.saveResume(value)
      } catch {
        toast.error('Save failed. Your changes may not be saved.')
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
      toast.success('PDF exported successfully.')
    } catch (e) {
      console.error('PDF export failed:', e)
      toast.error('PDF export failed. Please try again.')
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
      const snaps = await api.listSnapshots()
      setSnapshots(snaps)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeVersionId, flushSave],
  )

  const handleNewVersion = useCallback(async (name: string) => {
    await flushSave()
    const meta = await api.createVersion(name, contentRef.current)
    setActiveVersionId(meta.id)
    const vers = await api.listVersions()
    setVersions(vers)
  }, [flushSave])

  const handleRenameVersion = useCallback(async (id: string, name: string) => {
    await api.updateVersion(id, { name })
    const vers = await api.listVersions()
    setVersions(vers)
  }, [])

  const handleDeleteVersion = useCallback(async (id: string) => {
    if (versions.length <= 1) return
    await api.deleteVersion(id)
    const [resume, vers] = await Promise.all([api.getResume(), api.listVersions()])
    setContent(resume.content)
    initBlocks(resume.content)
    setVersions(vers)
    const newActive = vers.find((v) => v.is_active)
    if (newActive) setActiveVersionId(newActive.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions])

  const handleDuplicateVersion = useCallback(async (id: string) => {
    const source = versions.find((v) => v.id === id)
    let sourceContent: string
    if (id === activeVersionId) {
      await flushSave()
      sourceContent = contentRef.current
    } else {
      const data = await api.loadVersion(id)
      sourceContent = data.content
    }
    const name = `${source?.name ?? 'Version'} (copy)`
    const meta = await api.createVersion(name, sourceContent)
    setActiveVersionId(meta.id)
    setContent(sourceContent)
    initBlocks(sourceContent)
    const vers = await api.listVersions()
    setVersions(vers)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, activeVersionId, flushSave])

  const handleSwitchResume = useCallback(
    async (resumeId: string) => {
      if (resumeId === activeResumeId) return
      await flushSave()
      await api.setActiveResume(resumeId)
      const [resumeData, vers, resumeList] = await Promise.all([
        api.getResume(),
        api.listVersions(),
        api.listResumes(),
      ])
      setContent(resumeData.content)
      initBlocks(resumeData.content)
      setVersions(vers)
      const active = vers.find((v) => v.is_active)
      if (active) setActiveVersionId(active.id)
      setResumes(resumeList)
      setActiveResumeId(resumeId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeResumeId, flushSave],
  )

  const handleNewResume = useCallback(async (name: string) => {
    const newResume = await api.createResume(name)
    await handleSwitchResume(newResume.id)
  }, [handleSwitchResume])

  const handleCloneResume = useCallback(async (name: string) => {
    if (!activeResumeId) return
    await flushSave()
    const cloned = await api.cloneResume(activeResumeId, name)
    await handleSwitchResume(cloned.id)
  }, [activeResumeId, flushSave, handleSwitchResume])

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
    toast.success(`Exported ${filename}`)
  }, [versions, activeVersionId])

  const handleImportMd: React.ChangeEventHandler<HTMLInputElement> = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const name = file.name.replace(/\.md$/i, '')
    const meta = await api.createVersion(name, text)
    setContent(text)
    initBlocks(text)
    setActiveVersionId(meta.id)
    const vers = await api.listVersions()
    setVersions(vers)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleImportPdf: React.ChangeEventHandler<HTMLInputElement> = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportingPdf(true)
    try {
      const result = await api.importPdf(file)
      setContent(result.content)
      initBlocks(result.content)
      setActiveVersionId(result.version.id)
      const vers = await api.listVersions()
      setVersions(vers)
      toast.success(`Imported "${result.version.name}" as a new version`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PDF import failed'
      toast.error(msg)
    } finally {
      setImportingPdf(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Block diff handlers ───────────────────────────────────────────────────

  const openDiff = useCallback((entries: BlockDiffEntry[], label = 'Before AI Edit') => {
    setDiffApplied(false)
    setBlockDiff(entries)
    api.createSnapshot({ label })
      .then(() => api.listSnapshots())
      .then(setSnapshots)
      .catch(() => {})
  }, [])

  const closeDiff = useCallback(() => {
    setBlockDiff(null)
    setDiffApplied(false)
  }, [])

  const handleRevision = useCallback((revised: string, label = 'Before Chat Edit') => {
    const revisedBlocks = deserializeBlocks(revised)
    const normalised = revisedBlocks.length > 0 ? revisedBlocks : migrateMarkdownToBlocks(revised)
    const entries = computeBlockDiff(blocksRef.current, normalised)
    if (countBlockDiffTotal(entries) === 0) return
    openDiff(entries, label)
  }, [openDiff])

  const handlePatch = useCallback((patchMarkdown: string, label = 'Before Chat Edit') => {
    const patchBlocks = parsePatchBlocks(patchMarkdown)
    const revisedBlocks = applyPatch(blocksRef.current, patchBlocks)
    const entries = computeBlockDiff(blocksRef.current, revisedBlocks)
    if (countBlockDiffTotal(entries) === 0) return
    openDiff(entries, label)
  }, [openDiff])

  const handleOptimizeRevision = useCallback((revised: string) => {
    handleRevision(revised, 'Before Optimize')
  }, [handleRevision])

  const handleRestoreSnapshot = useCallback(async (id: string) => {
    try {
      const result = await api.restoreSnapshot(id)
      setContent(result.content)
      initBlocks(result.content)
      const snaps = await api.listSnapshots()
      setSnapshots(snaps)
    } catch (e) {
      console.error('Failed to restore snapshot', e)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleOnboardingComplete = useCallback(
    (importedContent?: string, importedVersion?: VersionMeta) => {
      if (importedContent && importedVersion) {
        setContent(importedContent)
        initBlocks(importedContent)
        setActiveVersionId(importedVersion.id)
        api.listVersions().then(setVersions).catch(() => {})
      }
      setShowOnboarding(false)
    },
    // initBlocks is stable (defined at module scope effectively via inline fn, but not memoized)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleMarginsChange = useCallback((m: Margins) => {
    setMargins(m)
    localStorage.setItem(MARGINS_STORAGE_KEY, JSON.stringify(m))
  }, [])

  const handleMarkApplied = async () => {
    if (!jobContext || applying) return
    setApplying(true)
    try {
      const activeVersion = versions.find((v) => v.is_active) ?? null
      await api.createApplication({
        job_title: jobContext.title,
        company: jobContext.company,
        location: jobContext.location || '',
        status: 'applied',
        version_id: activeVersion?.id ?? null,
        version_name: activeVersion?.name ?? null,
        job_url: jobContext.apply_url || '',
        notes: '',
      })
      setApplySuccess(true)
      sessionStorage.removeItem('cv_pilot_job_context')
      sessionStorage.removeItem('cv_pilot_prefill_job')
      setTimeout(() => {
        setJobContext(null)
        setApplySuccess(false)
      }, 3000)
    } catch (e) {
      console.error('Failed to track application', e)
    } finally {
      setApplying(false)
    }
  }

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const pageBreakHeight = Math.round((11 - margins.top - margins.bottom) * 96)
  const printableWidthPx = Math.round((8.5 - margins.left - margins.right) * 96)
  const isMobile = windowWidth < 640
  const previewScale = isMobile ? Math.max(0.3, (windowWidth - 16) / printableWidthPx) : 1

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

  const diffControls: DiffControls | undefined = blockDiff && !diffApplied
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
      <AppNav currentPath="/" />
      <Toolbar
        saving={saving}
        onOptimize={() => setShowOptimize(true)}
        onCoverLetter={() => setShowCoverLetter(true)}
        onExportPdf={handleExportPdf}
        exporting={exporting}
        versions={versions}
        activeVersionId={activeVersionId}
        onSelectVersion={handleSelectVersion}
        onNewVersion={handleNewVersion}
        onRenameVersion={handleRenameVersion}
        onDeleteVersion={handleDeleteVersion}
        onDuplicateVersion={handleDuplicateVersion}
        onExportMd={handleExportMd}
        onImportMd={handleImportMd}
        onImportPdf={handleImportPdf}
        importingPdf={importingPdf}
        margins={margins}
        onMarginsChange={handleMarginsChange}
        diffControls={diffControls}
        showChat={showChat}
        onToggleChat={() => setShowChat((v) => !v)}
        resumes={resumes}
        activeResumeId={activeResumeId}
        onSwitchResume={handleSwitchResume}
        onNewResume={handleNewResume}
        onCloneResume={handleCloneResume}
        snapshots={snapshots}
        onRestoreSnapshot={handleRestoreSnapshot}
      />

      {jobContext && (
        <div className="bg-indigo-950/60 border-b border-indigo-800/50 px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-indigo-300 font-medium">Targeting:</span>
            <span className="text-white">{jobContext.title}</span>
            <span className="text-indigo-400">at {jobContext.company}</span>
            {jobContext.location && (
              <span className="text-gray-400 text-xs">· {jobContext.location}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {applySuccess ? (
              <span className="text-green-400 text-xs font-medium">✓ Application tracked!</span>
            ) : (
              <button
                onClick={handleMarkApplied}
                disabled={applying}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {applying ? 'Tracking…' : 'Mark as Applied'}
              </button>
            )}
            <button
              onClick={() => {
                sessionStorage.removeItem('cv_pilot_job_context')
                sessionStorage.removeItem('cv_pilot_prefill_job')
                setJobContext(null)
              }}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        {/* Mobile tab switcher */}
        <div className="sm:hidden flex border-b border-gray-800 shrink-0 bg-gray-900">
          <button
            onClick={() => setMobilePane('editor')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mobilePane === 'editor'
                ? 'text-white border-b-2 border-indigo-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setMobilePane('preview')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mobilePane === 'preview'
                ? 'text-white border-b-2 border-indigo-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Preview
          </button>
        </div>

        <div ref={panesRef} className="flex flex-1 min-h-0">
          {/* Block editor / diff pane */}
          <div
            className={`min-w-0 overflow-hidden bg-gray-900 flex flex-col ${
              mobilePane === 'preview' ? 'hidden sm:flex' : 'flex'
            }`}
            style={isMobile ? undefined : { width: `${editorWidthPct}%` }}
          >
            {blockDiff ? (
              <BlockDiffView
                entries={blockDiff}
                onAccept={handleAcceptBlock}
                onDecline={handleDeclineBlock}
                onAcceptAll={handleAcceptAll}
                onDeclineAll={handleDeclineAll}
                isApplied={diffApplied}
                onClose={closeDiff}
              />
            ) : (
              <div className="overflow-auto flex-1">
                <BlockEditor blocks={blocks} onChange={handleBlocks} />
              </div>
            )}
          </div>

          {/* Vertical resize handle — desktop only */}
          <div
            onMouseDown={handleVerticalDividerMouseDown}
            className="hidden sm:block w-1 shrink-0 cursor-col-resize bg-gray-700 hover:bg-indigo-500 active:bg-indigo-400 transition-colors"
          />

          {/* Preview pane */}
          <div
            className={`min-w-0 overflow-auto bg-gray-100 p-2 sm:p-6 flex-1 ${
              mobilePane === 'editor' ? 'hidden sm:block' : 'block'
            }`}
          >
            <div
              className="relative mx-auto"
              style={{
                width: `${printableWidthPx}px`,
                ...(isMobile && previewScale < 1 ? { zoom: previewScale } : {}),
              }}
            >
              <BlockResumePreview blocks={previewBlocks} />
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="absolute inset-x-0 flex items-center gap-2 z-10 pointer-events-none"
                  style={{ top: `${n * pageBreakHeight}px` }}
                >
                  <div className="flex-1 border-t border-dashed border-gray-400 opacity-50" />
                  <span className="shrink-0 bg-gray-200 text-gray-500 text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-300">
                    Page {n + 1}
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-400 opacity-50" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {showChat && (
          <div className={isMobile ? 'fixed inset-0 z-40 flex flex-col' : 'contents'}>
            <ChatPanel
              messages={chatMessages}
              onMessagesChange={setChatMessages}
              resume={blocksToMarkdown(blocks)}
              onRevision={handleRevision}
              onPatch={handlePatch}
              onClose={() => setShowChat(false)}
              height={chatHeight}
              onHeightChange={setChatHeight}
              isMobile={isMobile}
            />
          </div>
        )}
      </div>

      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      {showCoverLetter && blocksLoaded && (
        <CoverLetterModal
          resumeContent={blocksToMarkdown(blocks)}
          onClose={() => setShowCoverLetter(false)}
        />
      )}

      {showOptimize && blocksLoaded && (
        <OptimizeModal
          resumeContent={blocksToMarkdown(blocks)}
          onClose={() => setShowOptimize(false)}
          onRevision={handleOptimizeRevision}
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
