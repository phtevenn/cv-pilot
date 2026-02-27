import { useAuth } from '../context/AuthContext'

interface ToolbarProps {
  saving: boolean
  saveError: string | null
  onOptimize: () => void
  onExportPdf: () => void
  exporting: boolean
}

export default function Toolbar({
  saving,
  saveError,
  onOptimize,
  onExportPdf,
  exporting,
}: ToolbarProps) {
  const { user, logout } = useAuth()

  const saveStatus = saveError ? (
    <span className="text-red-400">{saveError}</span>
  ) : saving ? (
    <span className="text-gray-500">Saving…</span>
  ) : (
    <span className="text-gray-600">Saved</span>
  )

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-white font-semibold text-sm tracking-tight">CV Pilot</span>
        <span className="text-xs">{saveStatus}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOptimize}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          ✦ Optimize with AI
        </button>

        <button
          onClick={onExportPdf}
          disabled={exporting}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>

        {user && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-700">
            {user.picture && (
              <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full"
              />
            )}
            <span className="text-gray-400 text-xs hidden sm:block">{user.name}</span>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
