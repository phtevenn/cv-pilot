import { useCallback, useEffect, useRef, useState } from 'react'
import Toolbar from '../components/Toolbar'
import type { DiffControls } from '../components/Toolbar'
import OptimizeModal from '../components/OptimizeModal'
import BlockEditor from '../components/BlockEditor'
import BlockResumePreview from '../components/BlockResumePreview'
import InlineDiffView from '../components/InlineDiffView'
import { api } from '../api/client'
import type { VersionMeta } from '../api/client'
import {
  computeLineDiff,
  resolveHunks,
  countChangedHunks,
  countPendingHunks,
} from '../utils/diff'
import type { DiffHunk, HunkStatus } from '../utils/diff'
import {
  blocksToMarkdown,
  deserializeBlocks,
  migrateMarkdownToBlocks,
  serializeBlocks,
} from '../utils/blocks'
import type { ResumeBlock } from '../types/blocks'

const AUTOSAVE_DELAY_MS = 800

export default function EditorPage() {
  const [content, setContent] = useState('')
  const [blocks, setBlocks] = useState<ResumeBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showOptimize, setShowOptimize] = useState(() => {
    return !!sessionStorage.getItem('cv_pilot_prefill_job')
  })
  const [prefillJob] = useState<string>(() => {
    const prefill = sessionStorage.getItem('cv_pilot_prefill_job') ?? ''
    if (prefill) sessionStorage.removeItem('cv_pilot_prefill_job')
    return prefill
  })
  const [exporting, setExporting] = useState(false)
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [diffHunks, setDiffHunks] = useState<DiffHunk[] | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const printRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef(content)
  const pendingRevisionBlocksRef = useRef<ResumeBlock[] | null>(null)

  // Keep a ref in sync so async handlers always see the latest content
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Auto-apply when the user has individually resolved every changed hunk
  useEffect(() => {
    if (!diffHunks) return
    if (countPendingHunks(diffHunks) === 0) {
      const resolved = resolveHunks(diffHunks)
      handleChange(resolved)
      setDiffHunks(null)
      if (pendingRevisionBlocksRef.current) {
        setBlocks(pendingRevisionBlocksRef.current)
        pendingRevisionBlocksRef.current = null
      }
    }
    // handleChange is stable, diffHunks identity changes only when we update it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffHunks])

  useEffect(() => {
    Promise.all([api.getResume(), api.listVersions()])
      .then(([resume, vers]) => {
        setContent(resume.content)
        const loaded = deserializeBlocks(resume.content)
        setBlocks(loaded.length > 0 ? loaded : migrateMarkdownToBlocks(resume.content))
        setVersions(vers)
        const active = vers.find((v) => v.is_active)
        if (active) setActiveVersionId(active.id)
      })
      .catch((e: unknown) => console.error('Failed to load resume:', e))
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
      const blob = await api.exportPdf(el.innerHTML)
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
      const loaded = deserializeBlocks(data.content)
      setBlocks(loaded.length > 0 ? loaded : migrateMarkdownToBlocks(data.content))
      setActiveVersionId(id)
      const vers = await api.listVersions()
      setVersions(vers)
    },
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
    const loaded = deserializeBlocks(resume.content)
    setBlocks(loaded.length > 0 ? loaded : migrateMarkdownToBlocks(resume.content))
    setVersions(vers)
    const newActive = vers.find((v) => v.is_active)
    if (newActive) setActiveVersionId(newActive.id)
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
    // Reset input so the same file can be re-imported if needed
    e.target.value = ''
    const text = await file.text()
    const defaultName = file.name.replace(/\.md$/i, '')
    const name = window.prompt('Version name:', defaultName)
    if (!name?.trim()) return
    const meta = await api.createVersion(name.trim(), text)
    setContent(text)
    const loaded = deserializeBlocks(text)
    setBlocks(loaded.length > 0 ? loaded : migrateMarkdownToBlocks(text))
    setActiveVersionId(meta.id)
    const vers = await api.listVersions()
    setVersions(vers)
  }, [])

  // ── Inline diff handlers ─────────────────────────────────────────────────

  const handleRevision = useCallback((revised: string) => {
    const hunks = computeLineDiff(contentRef.current, revised)
    if (countChangedHunks(hunks) === 0) return // identical — nothing to show
    setDiffHunks(hunks)
    // Store the revised blocks for when user accepts
    const revisedBlocks = deserializeBlocks(revised)
    pendingRevisionBlocksRef.current =
      revisedBlocks.length > 0 ? revisedBlocks : migrateMarkdownToBlocks(revised)
  }, [])

  const handleAcceptHunk = useCallback((id: string) => {
    setDiffHunks((prev) =>
      prev
        ? prev.map((h) => (h.id === id ? { ...h, status: 'accepted' as HunkStatus } : h))
        : null,
    )
  }, [])

  const handleDeclineHunk = useCallback((id: string) => {
    setDiffHunks((prev) =>
      prev
        ? prev.map((h) => (h.id === id ? { ...h, status: 'declined' as HunkStatus } : h))
        : null,
    )
  }, [])

  const handleAcceptAll = useCallback(() => {
    setDiffHunks((prev) => {
      if (!prev) return null
      return prev.map((h) =>
        h.type === 'changed' ? { ...h, status: 'accepted' as HunkStatus } : h,
      )
    })
    // useEffect will detect pendingCount === 0 and apply+exit
  }, [])

  const handleDeclineAll = useCallback(() => {
    setDiffHunks((prev) => {
      if (!prev) return null
      return prev.map((h) =>
        h.type === 'changed' ? { ...h, status: 'declined' as HunkStatus } : h,
      )
    })
  }, [])

  const diffControls: DiffControls | undefined = diffHunks
    ? {
        pendingCount: countPendingHunks(diffHunks),
        totalCount: countChangedHunks(diffHunks),
        onAcceptAll: handleAcceptAll,
        onDeclineAll: handleDeclineAll,
      }
    : undefined

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
        diffControls={diffControls}
      />

      <div className="flex flex-1 min-h-0">
        {/* Editor pane */}
        <div className="flex-1 min-w-0 overflow-hidden border-r border-gray-700">
          <BlockEditor blocks={blocks} onChange={handleBlocks} />
        </div>

        {/* Preview pane — shows inline diff when reviewing AI changes */}
        <div className="flex-1 min-w-0 overflow-auto bg-gray-100 p-6">
          {diffHunks ? (
            <InlineDiffView
              hunks={diffHunks}
              onAccept={handleAcceptHunk}
              onDecline={handleDeclineHunk}
            />
          ) : (
            <BlockResumePreview blocks={blocks} />
          )}
        </div>
      </div>

      {showOptimize && (
        <OptimizeModal
          resumeContent={blocksToMarkdown(blocks)}
          onClose={() => setShowOptimize(false)}
          onRevision={handleRevision}
          initialJobDescription={prefillJob || undefined}
        />
      )}

      {/* Hidden print target — rendered off-screen so Playwright can capture exact preview HTML */}
      <div
        ref={printRef}
        id="resume-print-target"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', top: 0, width: '750px', pointerEvents: 'none' }}
      >
        <BlockResumePreview blocks={blocks} />
      </div>
    </div>
  )
}
