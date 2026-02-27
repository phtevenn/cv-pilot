import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'

interface Props {
  resumeContent: string
  onClose: () => void
}

export default function OptimizeModal({ resumeContent, onClose }: Props) {
  const [jobDescription, setJobDescription] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const handleOptimize = async () => {
    if (!jobDescription.trim() || loading) return
    setLoading(true)
    setSuggestions('')
    setError(null)
    cancelledRef.current = false

    try {
      await api.optimizeStream(resumeContent, jobDescription, (text) => {
        if (!cancelledRef.current) {
          setSuggestions((prev) => prev + text)
        }
      })
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
      <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col">
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
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-4 min-h-0">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Job Description
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={7}
              className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOptimize}
              disabled={loading || !jobDescription.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Analyzing…' : 'Get Suggestions'}
            </button>
            {loading && (
              <span className="text-gray-500 text-xs">Streaming response from Claude…</span>
            )}
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-xl p-3">
              {error}
            </div>
          )}

          {suggestions && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 overflow-auto">
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{suggestions}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
