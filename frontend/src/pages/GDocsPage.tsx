import { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { AppNav } from '../components/AppNav'
import { api, API_BASE, type GDocCategory, type GDocResumeMeta, type GDocGenerateEvent } from '../api/client'

// ---------------------------------------------------------------------------
// Color mapping for category pills
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  green: 'bg-green-500/20 text-green-300 border-green-500/30',
  red: 'bg-red-500/20 text-red-300 border-red-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
}

const COLOR_OPTIONS = ['blue', 'green', 'red', 'purple', 'yellow', 'orange'] as const

const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  red: 'bg-red-400',
  purple: 'bg-purple-400',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelativeTime(iso: string): string {
  if (!iso) return ''
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 30) return `${diffD} day${diffD !== 1 ? 's' : ''} ago`
    return new Date(iso).toLocaleDateString()
  } catch {
    return ''
  }
}

function extractDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CategoryBadgeProps {
  category: GDocCategory | undefined
  small?: boolean
}

function CategoryBadge({ category, small }: CategoryBadgeProps) {
  if (!category) return null
  const colorClass = CATEGORY_COLORS[category.color] ?? CATEGORY_COLORS.blue
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full font-medium ${
        small ? 'text-xs px-1.5 py-0' : 'text-xs px-2 py-0.5'
      } ${colorClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${COLOR_DOT[category.color] ?? 'bg-blue-400'}`} />
      {category.name}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Resume card 3-dot menu
// ---------------------------------------------------------------------------
interface ResumeCardMenuProps {
  resume: GDocResumeMeta
  categories: GDocCategory[]
  onRename: (resume: GDocResumeMeta) => void
  onMove: (resume: GDocResumeMeta, categoryId: string | null) => void
  onDelete: (resume: GDocResumeMeta) => void
}

function ResumeCardMenu({ resume, categories, onRename, onMove, onDelete }: ResumeCardMenuProps) {
  const [open, setOpen] = useState(false)
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowMoveSubmenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="p-1 text-gray-500 hover:text-gray-300 transition-colors rounded"
        aria-label="Resume options"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[160px] py-1">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(resume) }}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
          >
            Rename
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMoveSubmenu((v) => !v) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors flex items-center justify-between"
            >
              Move to Category
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {showMoveSubmenu && (
              <div className="absolute right-full top-0 mr-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[150px] py-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setShowMoveSubmenu(false); onMove(resume, null) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
                >
                  No Category
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={(e) => { e.stopPropagation(); setOpen(false); setShowMoveSubmenu(false); onMove(resume, cat.id) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${COLOR_DOT[cat.color] ?? 'bg-blue-400'}`} />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(resume) }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New Resume Modal
// ---------------------------------------------------------------------------
interface NewResumeModalProps {
  categories: GDocCategory[]
  onClose: () => void
  onSuccess: (resume: GDocResumeMeta) => void
}

function NewResumeModal({ categories, onClose, onSuccess }: NewResumeModalProps) {
  const [title, setTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [sourceDocUrl, setSourceDocUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!title.trim()) { setError('Please enter a resume title.'); return }
    if (!jobDescription.trim()) { setError('Please paste a job description.'); return }
    const sourceDocId = sourceDocUrl.trim() ? extractDocId(sourceDocUrl.trim()) : null
    if (sourceDocUrl.trim() && !sourceDocId) {
      setError('Invalid Google Docs URL. Please paste the full URL from your browser.')
      return
    }
    setError(null)
    setGenerating(true)
    setStatusMessage('Starting generation…')

    let resultResume: GDocResumeMeta | null = null

    try {
      await api.gdocsGenerateResume(
        {
          title: title.trim(),
          job_description: jobDescription.trim(),
          category_id: categoryId || null,
          source_doc_id: sourceDocId,
          custom_instructions: customInstructions.trim() || null,
        },
        (event: GDocGenerateEvent) => {
          if (event.status === 'exporting') {
            setStatusMessage(event.message ?? 'Exporting source document…')
          } else if (event.status === 'analyzing') {
            setStatusMessage(event.message ?? 'Analyzing resume and job description…')
          } else if (event.status === 'generating') {
            setStatusMessage(event.message ?? 'Generating tailored resume with AI…')
          } else if (event.status === 'creating_doc') {
            setStatusMessage(event.message ?? 'Creating Google Doc…')
          } else if (event.status === 'error') {
            setError(event.message ?? 'An error occurred during generation.')
            setGenerating(false)
          } else if (event.status === 'done') {
            resultResume = {
              id: event.id!,
              google_doc_id: event.google_doc_id!,
              title: event.title!,
              category_id: event.category_id ?? null,
              google_doc_url: event.google_doc_url!,
              preview_url: event.preview_url!,
              created_at: event.created_at!,
              updated_at: event.updated_at!,
            }
          }
        },
      )
      if (resultResume) {
        toast.success('Resume generated and saved to Google Docs!')
        onSuccess(resultResume)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">Generate New Resume</h2>
          <button
            onClick={onClose}
            disabled={generating}
            className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">Source Resume (Google Doc URL)</label>
            <input
              type="url"
              value={sourceDocUrl}
              onChange={(e) => setSourceDocUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/…"
              disabled={generating}
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors disabled:opacity-50"
            />
            <p className="text-gray-500 text-xs">Paste the URL of the Google Doc resume to base this on. If blank, your saved resume in the editor will be used.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">Resume Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Google SWE - March 2026"
              disabled={generating}
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={8}
              disabled={generating}
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors resize-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">
              Custom Instructions <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Emphasize leadership experience, keep education section brief, highlight Python skills..."
              rows={3}
              disabled={generating}
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors resize-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={generating}
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors disabled:opacity-50"
            >
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {generating && statusMessage && (
            <div className="flex items-center gap-2 text-indigo-300 text-sm bg-indigo-950/40 border border-indigo-800/40 rounded-lg px-3 py-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
              {statusMessage}
            </div>
          )}
          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? 'Generating…' : 'Generate & Save to Google Docs'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New Category Modal
// ---------------------------------------------------------------------------
interface NewCategoryModalProps {
  onClose: () => void
  onCreated: (category: GDocCategory) => void
}

function NewCategoryModal({ onClose, onCreated }: NewCategoryModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>('blue')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a category name.'); return }
    setSaving(true)
    setError(null)
    try {
      const cat = await api.gdocsCreateCategory(name.trim(), color)
      onCreated(cat)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create category.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">New Category</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="e.g. Big Tech"
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-gray-300 text-sm font-medium">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${COLOR_DOT[c]} transition-transform ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'hover:scale-105'
                  }`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rename Resume Modal
// ---------------------------------------------------------------------------
interface RenameResumeModalProps {
  resume: GDocResumeMeta
  onClose: () => void
  onRenamed: (updated: GDocResumeMeta) => void
}

function RenameResumeModal({ resume, onClose, onRenamed }: RenameResumeModalProps) {
  const [title, setTitle] = useState(resume.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSave = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return }
    setSaving(true)
    setError(null)
    try {
      const updated = await api.gdocsUpdateResume(resume.id, { title: title.trim() })
      onRenamed(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename resume.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">Rename Resume</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-300 text-sm font-medium">Title</label>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className="bg-gray-800 border border-gray-600 hover:border-gray-500 focus:border-indigo-500 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
            />
          </div>
          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete Resume Confirm Modal
// ---------------------------------------------------------------------------
interface DeleteResumeModalProps {
  resume: GDocResumeMeta
  onClose: () => void
  onDeleted: (id: string) => void
}

function DeleteResumeModal({ resume, onClose, onDeleted }: DeleteResumeModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await api.gdocsDeleteResume(resume.id)
      onDeleted(resume.id)
      toast.success('Resume deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete resume.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">Delete Resume?</h2>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Are you sure you want to delete <span className="text-white font-medium">"{resume.title}"</span>?
            This will remove it from CV Pilot but will not delete the Google Doc.
          </p>
          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function GDocsPage() {
  const [hasDriveAccess, setHasDriveAccess] = useState<boolean | null>(null)
  const [categories, setCategories] = useState<GDocCategory[]>([])
  const [resumes, setResumes] = useState<GDocResumeMeta[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedResume, setSelectedResume] = useState<GDocResumeMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [showNewModal, setShowNewModal] = useState(false)
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false)
  const [renameTarget, setRenameTarget] = useState<GDocResumeMeta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GDocResumeMeta | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [authStatus, categoriesData, resumesData] = await Promise.all([
        api.gdocsAuthStatus(),
        api.gdocsListCategories(),
        api.gdocsListResumes(),
      ])
      setHasDriveAccess(authStatus.has_drive_access)
      setCategories(categoriesData.categories)
      setResumes(resumesData.resumes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Filtered resumes for the sidebar list
  const filteredResumes = selectedCategory
    ? resumes.filter((r) => r.category_id === selectedCategory)
    : resumes

  // Category map for quick lookup
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  // Handlers
  const handleNewResumeSuccess = (resume: GDocResumeMeta) => {
    setShowNewModal(false)
    setResumes((prev) => [resume, ...prev])
    setSelectedResume(resume)
  }

  const handleCategoryCreated = (cat: GDocCategory) => {
    setShowNewCategoryModal(false)
    setCategories((prev) => [...prev, cat])
    toast.success(`Category "${cat.name}" created.`)
  }

  const handleRenamed = (updated: GDocResumeMeta) => {
    setRenameTarget(null)
    setResumes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    if (selectedResume?.id === updated.id) setSelectedResume(updated)
    toast.success('Resume renamed.')
  }

  const handleDeleted = (id: string) => {
    setDeleteTarget(null)
    setResumes((prev) => prev.filter((r) => r.id !== id))
    if (selectedResume?.id === id) setSelectedResume(null)
  }

  const handleMove = async (resume: GDocResumeMeta, categoryId: string | null) => {
    try {
      const updated = await api.gdocsUpdateResume(resume.id, { category_id: categoryId })
      setResumes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      if (selectedResume?.id === updated.id) setSelectedResume(updated)
      toast.success('Resume moved.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move resume.')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <AppNav currentPath="/docs" />

      {/* Drive connect banner */}
      {hasDriveAccess === false && (
        <div className="bg-yellow-900/30 border-b border-yellow-700/50 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
          <p className="text-yellow-200 text-sm">
            Connect your Google Drive to create and manage resume docs in Google Docs.
          </p>
          <button
            onClick={() => {
              window.location.href = `${API_BASE}/api/auth/connect-drive?token=${localStorage.getItem('cv_pilot_token')}`
            }}
            className="shrink-0 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Connect Google Drive
          </button>
        </div>
      )}

      {/* Main split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-72 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
            <h2 className="text-white font-semibold text-sm">Resume Docs</h2>
            <button
              onClick={() => setShowNewModal(true)}
              disabled={hasDriveAccess === false}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              + New Resume
            </button>
          </div>

          {/* Category filter */}
          <div className="px-3 py-2.5 border-b border-gray-700 shrink-0 flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {categories.map((cat) => {
              const colorClass = CATEGORY_COLORS[cat.color] ?? CATEGORY_COLORS.blue
              const isActive = selectedCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? colorClass + ' opacity-100'
                      : colorClass + ' opacity-70 hover:opacity-100'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${COLOR_DOT[cat.color] ?? 'bg-blue-400'}`} />
                  {cat.name}
                </button>
              )
            })}
            <button
              onClick={() => setShowNewCategoryModal(true)}
              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded-full transition-colors text-base leading-none"
              aria-label="Add category"
            >
              +
            </button>
          </div>

          {/* Resume list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col gap-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3 animate-pulse flex flex-col gap-2">
                    <div className="h-3.5 bg-gray-700 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-700/60 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="p-4 text-red-400 text-xs">{error}</div>
            )}

            {!loading && !error && filteredResumes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-12 text-center">
                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 text-xs">
                  {selectedCategory ? 'No resumes in this category.' : 'No resumes yet. Create your first one!'}
                </p>
              </div>
            )}

            {!loading && !error && filteredResumes.map((resume) => {
              const cat = resume.category_id ? categoryMap.get(resume.category_id) : undefined
              const isSelected = selectedResume?.id === resume.id
              return (
                <button
                  key={resume.id}
                  onClick={() => setSelectedResume(resume)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-800 last:border-b-0 transition-colors ${
                    isSelected ? 'bg-gray-800' : 'hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {resume.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatRelativeTime(resume.updated_at)}</p>
                      {cat && (
                        <div className="mt-1.5">
                          <CategoryBadge category={cat} small />
                        </div>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ResumeCardMenu
                        resume={resume}
                        categories={categories}
                        onRename={setRenameTarget}
                        onMove={handleMove}
                        onDelete={setDeleteTarget}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-gray-950 flex flex-col overflow-hidden">
          {selectedResume ? (
            <>
              {/* Top bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0 bg-gray-900 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <h3 className="text-white font-semibold text-sm truncate">{selectedResume.title}</h3>
                  {selectedResume.category_id && (
                    <CategoryBadge category={categoryMap.get(selectedResume.category_id)} />
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-gray-500 text-xs hidden md:block">
                    Make sure you're logged in to Google in your browser.
                  </p>
                  <a
                    href={selectedResume.google_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Google Docs
                  </a>
                </div>
              </div>

              {/* iframe preview */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  key={selectedResume.id}
                  src={selectedResume.preview_url}
                  title={`Preview of ${selectedResume.title}`}
                  allow="autoplay"
                  className="w-full h-full border-0"
                />
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <svg className="w-16 h-16 text-blue-400/40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                <path d="M14 2v6h6" opacity="0.4" />
                <path d="M8 13h8M8 17h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>
              <div>
                <p className="text-gray-400 font-medium text-base">Select a resume to preview</p>
                <p className="text-gray-600 text-sm mt-1">
                  Choose a resume from the left panel, or create a new one.
                </p>
              </div>
              {!loading && resumes.length === 0 && hasDriveAccess !== false && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Generate Your First Resume
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewModal && (
        <NewResumeModal
          categories={categories}
          onClose={() => setShowNewModal(false)}
          onSuccess={handleNewResumeSuccess}
        />
      )}
      {showNewCategoryModal && (
        <NewCategoryModal
          onClose={() => setShowNewCategoryModal(false)}
          onCreated={handleCategoryCreated}
        />
      )}
      {renameTarget && (
        <RenameResumeModal
          resume={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={handleRenamed}
        />
      )}
      {deleteTarget && (
        <DeleteResumeModal
          resume={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
