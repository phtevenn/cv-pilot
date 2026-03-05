import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, RateLimitError } from '../api/client'

interface Props {
  resumeContent: string
  onClose: () => void
  /** Pre-fill the job description textarea if provided. */
  initialJobDescription?: string
}

export default function CoverLetterModal({ resumeContent, onClose, initialJobDescription }: Props) {
  const [jobDescription, setJobDescription] = useState(initialJobDescription ?? '')
  const [loading, setLoading] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const coverLetterRef = useRef('')

  const handleGenerate = async () => {
    if (!jobDescription.trim() || loading) return
    setLoading(true)
    setDone(false)
    setError(null)
    setCoverLetter('')
    coverLetterRef.current = ''
    cancelledRef.current = false

    try {
      await api.coverLetterStream(resumeContent, jobDescription, (text) => {
        if (!cancelledRef.current) {
          coverLetterRef.current += text
          setCoverLetter(coverLetterRef.current)
        }
      })
      if (!cancelledRef.current) {
        setDone(true)
      }
    } catch (e) {
      if (!cancelledRef.current) {
        if (e instanceof RateLimitError) {
          toast.error(e.message)
        } else {
          setError(e instanceof Error ? e.message : 'Cover letter generation failed')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coverLetterRef.current)
      toast.success('Cover letter copied to clipboard!')
    } catch {
      toast.error('Failed to copy to clipboard.')
    }
  }

  const handleClose = () => {
    cancelledRef.current = true
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-semibold">✦ Cover Letter Generator</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Job Description
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={6}
              disabled={loading}
              className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none hover:border-gray-500 focus:border-indigo-500 transition-colors disabled:opacity-60"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading || !jobDescription.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Generating…' : 'Generate Cover Letter'}
            </button>
            {loading && (
              <span className="text-gray-500 text-xs">
                Writing your cover letter…
              </span>
            )}
            {done && !loading && (
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Copy to Clipboard
              </button>
            )}
          </div>

          {coverLetter && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Generated Cover Letter
              </label>
              <textarea
                value={coverLetter}
                readOnly
                rows={14}
                className="w-full bg-gray-800 text-gray-100 border border-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none font-mono"
              />
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-xl p-3">
              {error}
            </div>
          )}

          <p className="text-gray-500 text-xs">
            Claude will write a tailored cover letter based on your resume and the job description.
            The cover letter is for reference only — it does not modify your resume.
          </p>
        </div>
      </div>
    </div>
  )
}
