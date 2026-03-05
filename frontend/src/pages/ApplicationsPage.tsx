import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api/client'
import type { Application, ApplicationCreate, ApplicationStatus, ApplicationUpdate, VersionMeta } from '../api/client'
import { AppNav } from '../components/AppNav'

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: 'bg-blue-600 text-white',
  interview: 'bg-yellow-500 text-gray-900',
  offer: 'bg-green-600 text-white',
  rejected: 'bg-red-700 text-white',
  withdrawn: 'bg-gray-600 text-white',
}

const ALL_STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'withdrawn']

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

interface ApplicationFormProps {
  initial?: Application | null
  versions: VersionMeta[]
  onSave: (data: ApplicationCreate | ApplicationUpdate) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function ApplicationForm({ initial, versions, onSave, onCancel, saving }: ApplicationFormProps) {
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [status, setStatus] = useState<ApplicationStatus>(initial?.status ?? 'applied')
  const [versionId, setVersionId] = useState<string>(initial?.version_id ?? '')
  const [jobUrl, setJobUrl] = useState(initial?.job_url ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jobTitle.trim() || !company.trim()) return
    const selectedVersion = versions.find((v) => v.id === versionId)
    await onSave({
      job_title: jobTitle.trim(),
      company: company.trim(),
      location: location.trim(),
      status,
      version_id: versionId || null,
      version_name: selectedVersion?.name ?? null,
      job_url: jobUrl.trim(),
      notes: notes.trim(),
    })
  }

  const inputClass =
    'w-full bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Job Title *</label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Software Engineer"
            className={inputClass}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Company *</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Corp"
            className={inputClass}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. San Francisco, CA"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            className={inputClass}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Resume Version Used</label>
          <select
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{v.is_active ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Job URL</label>
          <input
            type="url"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-xs">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Interview notes, contacts, deadlines..."
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !jobTitle.trim() || !company.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Application'}
        </button>
      </div>
    </form>
  )
}

interface ApplicationModalProps {
  application?: Application | null
  versions: VersionMeta[]
  onClose: () => void
  onSaved: (app: Application) => void
}

function ApplicationModal({ application, versions, onClose, onSaved }: ApplicationModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (data: ApplicationCreate | ApplicationUpdate) => {
    setSaving(true)
    setError(null)
    try {
      let result: Application
      if (application) {
        result = await api.updateApplication(application.id, data as ApplicationUpdate)
      } else {
        result = await api.createApplication(data as ApplicationCreate)
      }
      onSaved(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">
            {application ? 'Edit Application' : 'Add Application'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>
        {error && (
          <div className="text-red-400 text-xs bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <ApplicationForm
          initial={application}
          versions={versions}
          onSave={handleSave}
          onCancel={onClose}
          saving={saving}
        />
      </div>
    </div>
  )
}

interface ApplicationCardProps {
  application: Application
  onEdit: () => void
  onDelete: () => void
}

function ApplicationCard({ application, onEdit, onDelete }: ApplicationCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-2 hover:border-gray-500 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm leading-snug truncate">
            {application.job_title}
          </h3>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{application.company}</p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[application.status]}`}
        >
          {STATUS_LABELS[application.status]}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500 text-xs">
        {application.location && <span>{application.location}</span>}
        {application.version_name && (
          <span className="text-indigo-400">Resume: {application.version_name}</span>
        )}
        <span>Applied {formatDate(application.applied_at)}</span>
      </div>

      {application.notes && (
        <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">{application.notes}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        {application.job_url && (
          <a
            href={application.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            View posting ↗
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-gray-400">Delete?</span>
              <button
                onClick={() => onDelete()}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                No
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type FilterTab = 'all' | ApplicationStatus

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Application | null>(null)

  useEffect(() => {
    Promise.all([api.listApplications(), api.listVersions()])
      .then(([apps, vers]) => {
        setApplications(apps)
        setVersions(vers)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleSaved = (app: Application) => {
    const isNew = !applications.find((a) => a.id === app.id)
    setApplications((prev) => {
      const idx = prev.findIndex((a) => a.id === app.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = app
        return next
      }
      return [app, ...prev]
    })
    setModalOpen(false)
    setEditTarget(null)
    toast.success(isNew ? 'Application added.' : 'Application updated.')
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteApplication(id)
      setApplications((prev) => prev.filter((a) => a.id !== id))
      toast.success('Application deleted.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete application.')
    }
  }

  const openAdd = () => {
    setEditTarget(null)
    setModalOpen(true)
  }

  const openEdit = (app: Application) => {
    setEditTarget(app)
    setModalOpen(true)
  }

  const filtered =
    filter === 'all' ? applications : applications.filter((a) => a.status === filter)

  const countByStatus = (s: ApplicationStatus) => applications.filter((a) => a.status === s).length

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `All (${applications.length})` },
    ...ALL_STATUSES.map((s) => ({ key: s as FilterTab, label: `${STATUS_LABELS[s]} (${countByStatus(s)})` })),
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <AppNav currentPath="/applications" />

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h1 className="text-white font-semibold text-base">Job Applications</h1>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Application
          </button>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-xl p-4">
            {error}
          </div>
        )}

        {/* Filter tabs */}
        {!loading && applications.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-2 animate-pulse"
              >
                <div className="flex justify-between">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-4 bg-gray-700 rounded w-2/3" />
                    <div className="h-3 bg-gray-800 rounded w-1/3" />
                  </div>
                  <div className="h-6 w-16 bg-gray-700 rounded-full" />
                </div>
                <div className="h-3 bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && applications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p className="text-gray-400 text-sm">No applications tracked yet.</p>
            <p className="text-gray-600 text-xs">
              Click "Add Application" to start tracking your job search.
            </p>
          </div>
        )}

        {!loading && filtered.length === 0 && applications.length > 0 && (
          <p className="text-gray-500 text-sm text-center py-8">
            No applications with status "{STATUS_LABELS[filter as ApplicationStatus]}".
          </p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                onEdit={() => openEdit(app)}
                onDelete={() => handleDelete(app.id)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ApplicationModal
          application={editTarget}
          versions={versions}
          onClose={() => {
            setModalOpen(false)
            setEditTarget(null)
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
