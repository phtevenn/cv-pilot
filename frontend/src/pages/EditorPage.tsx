import { useCallback, useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import Toolbar from '../components/Toolbar'
import OptimizeModal from '../components/OptimizeModal'
import ResumePreview from '../components/ResumePreview'
import { api } from '../api/client'

const AUTOSAVE_DELAY_MS = 800

export default function EditorPage() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showOptimize, setShowOptimize] = useState(false)
  const [exporting, setExporting] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    api
      .getResume()
      .then((r) => setContent(r.content))
      .catch((e: unknown) => console.error('Failed to load resume:', e))
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

  const handleExportPdf = async () => {
    setExporting(true)
    try {
      const blob = await api.exportPdf(content)
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

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Toolbar
        saving={saving}
        saveError={saveError}
        onOptimize={() => setShowOptimize(true)}
        onExportPdf={handleExportPdf}
        exporting={exporting}
      />

      <div className="flex flex-1 min-h-0">
        {/* Editor pane */}
        <div className="flex-1 min-w-0 overflow-hidden border-r border-gray-700">
          <CodeMirror
            value={content}
            height="100%"
            extensions={[markdown({ base: markdownLanguage, codeLanguages: languages })]}
            theme={oneDark}
            onChange={handleChange}
            style={{ height: '100%', fontSize: '13px' }}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
            }}
          />
        </div>

        {/* Preview pane */}
        <div className="flex-1 min-w-0 overflow-auto bg-gray-100 p-6">
          <ResumePreview content={content} />
        </div>
      </div>

      {showOptimize && (
        <OptimizeModal
          resumeContent={content}
          onClose={() => setShowOptimize(false)}
        />
      )}
    </div>
  )
}
