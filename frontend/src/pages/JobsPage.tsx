import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import type { JobResult } from '../api/client'
import { navigate } from '../utils/navigate'

const CACHE_KEY = 'cv_pilot_jobs_cache'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface JobsCache {
  titles: string[]
  location: string
  remote_only: boolean
  limit: number
  results: JobResult[]
  cached_at: string
}

function scoreColor(score: number): string {
  if (score >= 75) return 'bg-green-600 text-white'
  if (score >= 50) return 'bg-yellow-500 text-gray-900'
  return 'bg-orange-600 text-white'
}

function formatPostedAt(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 30) return `${diff}d ago`
    return d.toLocaleDateString()
  } catch {
    return ''
  }
}

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    return `${Math.floor(diffH / 24)}d ago`
  } catch {
    return ''
  }
}

function JobCard({ job }: { job: JobResult }) {
  const [expanded, setExpanded] = useState(false)

  const handleOptimize = () => {
    sessionStorage.setItem('cv_pilot_prefill_job', job.description)
    navigate('/')
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-500 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm leading-snug">{job.title}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{job.company}</p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${scoreColor(job.match_score)}`}
          title="AI match score"
        >
          {job.match_score}%
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-500 text-xs">
        {job.location && <span>{job.location}</span>}
        {job.salary && <span className="text-gray-400">{job.salary}</span>}
        {job.source && (
          <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{job.source}</span>
        )}
        {job.posted_at && <span>{formatPostedAt(job.posted_at)}</span>}
      </div>

      {/* Match reason */}
      {job.match_reason && (
        <p className="text-indigo-300 text-xs italic">{job.match_reason}</p>
      )}

      {/* Expandable description */}
      {expanded && (
        <p className="text-gray-400 text-xs leading-relaxed whitespace-pre-line line-clamp-[12]">
          {job.description}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {expanded ? 'Hide details' : 'View details'}
        </button>
        {job.apply_url && (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Apply ↗
          </a>
        )}
        <button
          onClick={handleOptimize}
          className="ml-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          ✦ Optimize Resume
        </button>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex justify-between">
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-4 bg-gray-700 rounded w-2/3" />
          <div className="h-3 bg-gray-800 rounded w-1/3" />
        </div>
        <div className="h-6 w-10 bg-gray-700 rounded-full" />
      </div>
      <div className="flex gap-2">
        <div className="h-3 bg-gray-800 rounded w-24" />
        <div className="h-3 bg-gray-800 rounded w-16" />
      </div>
      <div className="h-3 bg-gray-800 rounded w-3/4" />
    </div>
  )
}

export default function JobsPage() {
  const [jobTitles, setJobTitles] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [location, setLocation] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [limit, setLimit] = useState(10)
  const [jobs, setJobs] = useState<JobResult[]>([])
  const [loading, setLoading] = useState(false)
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [cachedAt, setCachedAt] = useState<string>('')

  // Use a ref so handleSearch can always read the latest state values without
  // being re-created on every render (avoids stale-closure issues in the
  // mount-time background-refresh path).
  const searchStateRef = useRef({ jobTitles, location, remoteOnly, limit })
  useEffect(() => {
    searchStateRef.current = { jobTitles, location, remoteOnly, limit }
  }, [jobTitles, location, remoteOnly, limit])

  const saveCache = useCallback(
    (titles: string[], loc: string, remote: boolean, lim: number, results: JobResult[]) => {
      const cache: JobsCache = {
        titles,
        location: loc,
        remote_only: remote,
        limit: lim,
        results,
        cached_at: new Date().toISOString(),
      }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
      } catch {
        // ignore quota errors
      }
    },
    [],
  )

  const handleSearch = useCallback(
    async (opts?: { background?: boolean }) => {
      const { jobTitles: titles, location: loc, remoteOnly: remote, limit: lim } =
        searchStateRef.current
      if (titles.length === 0 || loading) return

      if (opts?.background) {
        setBackgroundRefreshing(true)
      } else {
        setLoading(true)
        setError(null)
        setSearched(true)
      }

      try {
        const results = await api.searchJobs({
          job_titles: titles,
          location: loc,
          remote_only: remote,
          limit: lim,
        })
        setJobs(results)
        setIsCached(false)
        setCachedAt(new Date().toISOString())
        saveCache(titles, loc, remote, lim, results)
      } catch (e) {
        if (!opts?.background) {
          setError(e instanceof Error ? e.message : 'Search failed')
          setJobs([])
        }
      } finally {
        if (opts?.background) {
          setBackgroundRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [loading, saveCache],
  )

  // On mount: restore cache
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return
      const cache: JobsCache = JSON.parse(raw)
      const age = Date.now() - new Date(cache.cached_at).getTime()

      // Always restore the UI state
      setJobTitles(cache.titles)
      setLocation(cache.location)
      setRemoteOnly(cache.remote_only)
      setLimit(cache.limit)
      setJobs(cache.results)
      setSearched(true)
      setIsCached(true)
      setCachedAt(cache.cached_at)

      // Sync the ref so background refresh picks up the right values
      searchStateRef.current = {
        jobTitles: cache.titles,
        location: cache.location,
        remoteOnly: cache.remote_only,
        limit: cache.limit,
      }

      if (age > CACHE_TTL_MS) {
        // Stale: show cached data and kick off a background refresh
        handleSearch({ background: true })
      }
    } catch {
      // ignore malformed cache
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tag input helpers
  const addTag = (value: string) => {
    const trimmed = value.trim().replace(/,+$/, '').trim()
    if (!trimmed) return
    if (!jobTitles.includes(trimmed)) {
      setJobTitles((prev) => [...prev, trimmed])
    }
    setTagInput('')
  }

  const removeTag = (index: number) => {
    setJobTitles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && tagInput === '' && jobTitles.length > 0) {
      removeTag(jobTitles.length - 1)
    }
  }

  const handleTagBlur = () => {
    if (tagInput.trim()) addTag(tagInput)
  }

  const handleSearchClick = () => {
    // Commit any pending tag input before searching
    if (tagInput.trim()) {
      addTag(tagInput)
    }
    // Use the ref directly so we don't depend on the state update being synchronous
    const pending = tagInput.trim() ? [...jobTitles, tagInput.trim()] : jobTitles
    if (pending.length === 0 || loading) return
    searchStateRef.current = { ...searchStateRef.current, jobTitles: pending }
    handleSearch()
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm tracking-tight">CV Pilot</span>
          <span className="text-gray-600 text-xs">/ Find Jobs</span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-gray-200 text-xs transition-colors"
        >
          ← Back to Editor
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
        {/* Search form */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-4">
          <h1 className="text-white font-semibold text-base">Find Jobs Matched to Your Resume</h1>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Multi-tag job title input */}
            <div className="flex-1 bg-gray-800 border border-gray-600 hover:border-gray-500 focus-within:border-indigo-500 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 transition-colors min-h-[38px]">
              {jobTitles.map((title, i) => (
                <span
                  key={i}
                  className="bg-indigo-900/60 text-indigo-200 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                >
                  {title}
                  <button
                    type="button"
                    onClick={() => removeTag(i)}
                    className="text-indigo-400 hover:text-indigo-200 leading-none"
                    aria-label={`Remove ${title}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={handleTagBlur}
                placeholder={jobTitles.length === 0 ? 'e.g. Bioinformatics Scientist — press Enter to add' : ''}
                className="flex-1 min-w-[180px] bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none"
              />
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchClick() }}
              placeholder="Location (e.g. San Francisco, CA)"
              className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none hover:border-gray-500 focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={(e) => setRemoteOnly(e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span className="text-gray-400 text-sm">Remote only</span>
              </label>
              <label className="flex items-center gap-2 select-none">
                <span className="text-gray-400 text-sm">Results</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="bg-gray-800 text-gray-100 border border-gray-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  {[5, 10, 15, 20, 25].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              onClick={handleSearchClick}
              disabled={(jobTitles.length === 0 && !tagInput.trim()) || loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-xl p-4">
            {error === 'JSEARCH_API_KEY not configured'
              ? 'Job search API key is not configured. Add JSEARCH_API_KEY to your .env file.'
              : error}
          </div>
        )}

        {!loading && searched && !error && jobs.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-12">
            No jobs found. Try different keywords or a broader location.
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-gray-500 text-xs">
                {jobs.length} jobs ranked by AI relevance to your resume
              </p>
              {isCached && cachedAt && (
                <p className="text-gray-600 text-xs flex items-center gap-1.5">
                  {backgroundRefreshing ? (
                    <span className="text-indigo-400">Auto-refreshing…</span>
                  ) : (
                    <>
                      Last updated: {formatTimeAgo(cachedAt)}
                      <span className="text-gray-700">·</span>
                      <button
                        onClick={() => handleSearch()}
                        className="text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Refresh
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
