import { useState } from 'react'
import { api } from '../api/client'
import type { JobResult } from '../api/client'
import { navigate } from '../utils/navigate'

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
  const [jobTitles, setJobTitles] = useState('')
  const [location, setLocation] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [jobs, setJobs] = useState<JobResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!jobTitles.trim() || loading) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const results = await api.searchJobs({
        job_titles: jobTitles,
        location,
        remote_only: remoteOnly,
      })
      setJobs(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
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
            <input
              type="text"
              value={jobTitles}
              onChange={(e) => setJobTitles(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Job title (e.g. Computational Biologist)"
              className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none hover:border-gray-500 focus:border-indigo-500 transition-colors"
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Location (e.g. San Francisco, CA)"
              className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none hover:border-gray-500 focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="accent-indigo-500 w-4 h-4"
              />
              <span className="text-gray-400 text-sm">Remote only</span>
            </label>
            <button
              onClick={handleSearch}
              disabled={!jobTitles.trim() || loading}
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
            <p className="text-gray-500 text-xs">
              {jobs.length} jobs ranked by AI relevance to your resume
            </p>
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
