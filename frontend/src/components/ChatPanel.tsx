import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'
import type { ChatMessage } from '../api/client'

const MD_CODE_BLOCK_RE = /```(?:markdown)?\n([\s\S]*?)\n```/

interface ChatPanelProps {
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  resume: string
  onRevision: (revised: string) => void
  onClose: () => void
  height: number
  onHeightChange: (h: number) => void
}

function AssistantMessage({
  content,
  onRevision,
}: {
  content: string
  onRevision: (revised: string) => void
}) {
  const match = MD_CODE_BLOCK_RE.exec(content)
  return (
    <div className="flex flex-col gap-2">
      <div className="prose prose-invert prose-sm max-w-none text-gray-200 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {match && (
        <button
          onClick={() => onRevision(match[1].trim())}
          className="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Apply Changes ▶
        </button>
      )}
    </div>
  )
}

export default function ChatPanel({
  messages,
  onMessagesChange,
  resume,
  onRevision,
  onClose,
  height,
  onHeightChange,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      onHeightChange(Math.min(600, Math.max(160, startHeight + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamingText])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMessage: ChatMessage = { role: 'user', content: text }
    const nextMessages = [...messages, userMessage]
    onMessagesChange(nextMessages)
    setInput('')
    setStreaming(true)
    setStreamingText('')

    try {
      let accumulated = ''
      await api.chatStream(resume, nextMessages, (chunk) => {
        accumulated += chunk
        setStreamingText(accumulated)
      })
      onMessagesChange([...nextMessages, { role: 'assistant', content: accumulated }])
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Something went wrong'
      onMessagesChange([...nextMessages, { role: 'assistant', content: `Error: ${errMsg}` }])
    } finally {
      setStreaming(false)
      setStreamingText('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex flex-col border-t border-gray-700 bg-gray-900 shrink-0" style={{ height: `${height}px` }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="h-1 shrink-0 cursor-row-resize bg-gray-700 hover:bg-indigo-500 active:bg-indigo-400 transition-colors"
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 shrink-0">
        <span className="text-white text-sm font-medium">✦ Resume AI</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMessagesChange([])}
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-sm leading-none transition-colors"
            aria-label="Close chat"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !streaming && (
          <p className="text-gray-500 text-xs text-center mt-4">
            Ask me anything about your resume, or request targeted edits.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.role === 'assistant' ? (
                <AssistantMessage content={msg.content} onRevision={onRevision} />
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200">
              {streamingText ? (
                <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                </div>
              ) : (
                <span className="text-gray-500 animate-pulse">Thinking…</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 px-4 py-2 border-t border-gray-700 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder="Ask about your resume… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 resize-none bg-gray-800 text-gray-100 text-xs rounded-lg px-3 py-2 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  )
}
