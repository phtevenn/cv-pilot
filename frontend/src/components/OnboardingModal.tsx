import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api/client'
import type { VersionMeta } from '../api/client'

interface Props {
  onComplete: (content?: string, version?: VersionMeta) => void
}

export default function OnboardingModal({ onComplete }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTemplateChoice = () => {
    localStorage.setItem('cv_pilot_onboarded', '1')
    onComplete()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const result = await api.importPdf(file)
      localStorage.setItem('cv_pilot_onboarded', '1')
      onComplete(result.content, result.version)
      toast.success(`Imported "${result.version.name}" — you're all set!`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PDF import failed'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to CV Pilot</h2>
          <p className="text-gray-400 text-sm">
            Get started in seconds — bring your existing resume or use our sample to explore.
          </p>
        </div>

        {/* Cards */}
        <div className="px-8 pb-8 pt-4 flex flex-col gap-4">
          {/* Import PDF */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="group w-full flex items-start gap-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500 rounded-xl p-5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg">
              {uploading ? (
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-white font-semibold text-sm group-hover:text-indigo-300 transition-colors">
                {uploading ? 'Importing your PDF…' : 'Import your PDF'}
              </p>
              <p className="text-gray-400 text-xs mt-0.5">
                Upload your existing resume and we'll convert it to an editable format.
              </p>
            </div>
          </button>

          {/* Start from template */}
          <button
            onClick={handleTemplateChoice}
            disabled={uploading}
            className="group w-full flex items-start gap-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500 rounded-xl p-5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm group-hover:text-indigo-300 transition-colors">
                Start from template
              </p>
              <p className="text-gray-400 text-xs mt-0.5">
                Explore the editor with a sample resume — swap in your own details anytime.
              </p>
            </div>
          </button>

          <p className="text-gray-600 text-xs text-center">
            You can always import or export your resume later from the toolbar.
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
