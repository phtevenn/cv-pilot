import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const isDev = import.meta.env.DEV
      const error = this.state.error

      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#9888;</div>
            <h1 className="text-white text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6">
              An unexpected error occurred. Try reloading the page — if the problem persists,
              please contact support.
            </p>

            {isDev && error && (
              <div className="mb-6 text-left bg-gray-800 border border-gray-700 rounded-lg p-4 overflow-auto max-h-48">
                <p className="text-red-400 text-xs font-mono font-semibold mb-1">{error.name}</p>
                <p className="text-red-300 text-xs font-mono whitespace-pre-wrap">{error.message}</p>
                {error.stack && (
                  <p className="text-gray-500 text-xs font-mono whitespace-pre-wrap mt-2">
                    {error.stack}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
