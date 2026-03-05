import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, ScoreResult, RateLimitError } from '../api/client'

interface Props {
  resumeContent: string
  onClose: () => void
  /** Called with the full revised resume markdown when streaming completes. */
  onRevision: (revised: string) => void
  /** Pre-fill the job description textarea (e.g. when launched from Find Jobs). */
  initialJobDescription?: string
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5">
        <div
          className={`${color} h-1.5 rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-300 w-8 text-right">{score}%</span>
    </div>
  )
}

function ScoreCard({ score }: { score: ScoreResult }) {
  const overallColor =
    score.overall >= 75 ? 'text-green-400' : score.overall >= 50 ? 'text-yellow-400' : 'text-red-400'
  const categories = [
    { key: 'keywords', label: 'Keywords' },
    { key: 'skills', label: 'Skills' },
    { key: 'experience', label: 'Experience' },
    { key: 'seniority', label: 'Seniority' },
  ] as const

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-bold ${overallColor}`}>{score.overall}%</span>
        <div>
          <p className="text-sm font-medium text-gray-200">ATS Match Score</p>
          <p className="text-xs text-gray-400">Overall resume-to-job fit</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {categories.map(({ key, label }) => (
          <div key={key}>
            <div className="flex justify-between mb-0.5">
              <span className="text-xs text-gray-400">{label}</span>
            </div>
            <ScoreBar score={score.categories[key].score} />
            <p className="text-xs text-gray-500 mt-0.5">{score.categories[key].notes}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 border-t border-gray-700 pt-3">{score.summary}</p>
    </div>
  )
}

export default function OptimizeModal({ resumeContent, onClose, onRevision, initialJobDescription }: Props) {
  const [jobDescription, setJobDescription] = useState(initialJobDescription ?? '')
  const [pageLimit, setPageLimit] = useState(1)
  const [loading, setLoading] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [charCount, setCharCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const revisedRef = useRef('')

  const handleScore = async () => {
    if (!jobDescription.trim() || scoring || loading) return
    setScoring(true)
    setError(null)
    try {
      const result = await api.scoreResume(resumeContent, jobDescription)
      setScoreResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed')
    } finally {
      setScoring(false)
    }
  }

  const handleOptimize = async () => {
    if (!jobDescription.trim() || loading) return
    setLoading(true)
    setCharCount(0)
    setError(null)
    cancelledRef.current = false
    revisedRef.current = ''

    try {
      await api.optimizeStream(resumeContent, jobDescription, (text) => {
        if (!cancelledRef.current) {
          revisedRef.current += text
          setCharCount(revisedRef.current.length)
        }
      }, pageLimit)
      if (!cancelledRef.current) {
        onRevision(revisedRef.current)
        onClose()
      }
    } catch (e) {
      if (!cancelledRef.current) {
        if (e instanceof RateLimitError) {
          toast.error(e.message)
        } else {
          setError(e instanceof Error ? e.message : 'Optimization failed')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    cancelledRef.current = true
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-semibold">✦ AI Resume Optimizer</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Job Description
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={8}
              disabled={loading}
              className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none hover:border-gray-500 focus:border-indigo-500 transition-colors disabled:opacity-60"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleScore}
              disabled={scoring || loading || !jobDescription.trim()}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors border border-gray-600"
            >
              {scoring ? 'Scoring…' : 'Score Match'}
            </button>
            {scoring && (
              <span className="text-gray-500 text-xs">Analyzing resume fit…</span>
            )}
          </div>

          {scoreResult && <ScoreCard score={scoreResult} />}

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400 shrink-0">Page limit</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageLimit(n)}
                    disabled={loading}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                      pageLimit === n
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleOptimize}
              disabled={loading || !jobDescription.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Optimizing…' : 'Optimize Resume'}
            </button>
            {loading && (
              <span className="text-gray-500 text-xs">
                Generating… ({charCount.toLocaleString()} chars)
              </span>
            )}
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-xl p-3">
              {error}
            </div>
          )}

          <p className="text-gray-500 text-xs">
            Claude will rewrite your resume to match the job description. Review changes
            inline before applying them.
          </p>
        </div>
      </div>
    </div>
  )
}
