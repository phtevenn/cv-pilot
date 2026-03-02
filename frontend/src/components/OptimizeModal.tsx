import { useRef, useState } from 'react'
import { api } from '../api/client'

interface Props {
  resumeContent: string
  onClose: () => void
  /** Called with the full revised resume markdown when streaming completes. */
  onRevision: (revised: string) => void
  /** Pre-fill the job description textarea (e.g. when launched from Find Jobs). */
  initialJobDescription?: string
}

export default function OptimizeModal({ resumeContent, onClose, onRevision, initialJobDescription }: Props) {
  const [jobDescription, setJobDescription] = useState(initialJobDescription ?? '')
  const [pageLimit, setPageLimit] = useState(1)
  const [loading, setLoading] = useState(false)
  const [charCount, setCharCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const revisedRef = useRef('')

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
        setError(e instanceof Error ? e.message : 'Optimization failed')
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
              className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
            />
          </div>

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
