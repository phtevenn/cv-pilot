import { DiffHunk } from '../utils/diff'

// Split a raw diff text block into display lines.
// Keeps trailing empty strings so blank lines render correctly,
// but removes the very last empty element that comes from a final \n.
function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

// ─── Equal segment ───────────────────────────────────────────────────────────

function EqualSegment({ text }: { text: string }) {
  const lines = splitLines(text)
  return (
    <div className="py-0.5">
      {lines.map((line, i) => (
        <div
          key={i}
          className="px-3 py-px text-[13px] text-gray-500 leading-snug whitespace-pre-wrap break-words min-h-[1.4em]"
        >
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  )
}

// ─── Changed hunk ─────────────────────────────────────────────────────────────

interface ChangedHunkProps {
  hunk: DiffHunk
  onAccept: () => void
  onDecline: () => void
}

function ChangedHunkBlock({ hunk, onAccept, onDecline }: ChangedHunkProps) {
  const removedLines = splitLines(hunk.originalText)
  const addedLines = splitLines(hunk.revisedText)

  if (hunk.status === 'accepted') {
    return (
      <div className="my-1 border-l-4 border-green-400 bg-green-50 rounded-r">
        <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5">
          <span className="text-[11px] font-medium text-green-600 uppercase tracking-wide">Accepted</span>
        </div>
        {addedLines.map((line, i) => (
          <div
            key={i}
            className="px-3 py-px text-[13px] text-green-800 leading-snug whitespace-pre-wrap break-words min-h-[1.4em]"
          >
            {line || '\u00A0'}
          </div>
        ))}
        <div className="pb-1" />
      </div>
    )
  }

  if (hunk.status === 'declined') {
    return (
      <div className="my-1 border-l-4 border-gray-300 bg-gray-50 rounded-r">
        <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Declined</span>
        </div>
        {removedLines.map((line, i) => (
          <div
            key={i}
            className="px-3 py-px text-[13px] text-gray-500 leading-snug whitespace-pre-wrap break-words min-h-[1.4em]"
          >
            {line || '\u00A0'}
          </div>
        ))}
        <div className="pb-1" />
      </div>
    )
  }

  // pending
  return (
    <div className="my-1 border border-indigo-200 rounded-lg overflow-hidden shadow-sm">
      {/* Hunk header with action buttons */}
      <div className="flex items-center justify-between bg-indigo-50 px-3 py-1.5 border-b border-indigo-200">
        <span className="text-[11px] font-medium text-indigo-500 uppercase tracking-wide">Change</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onAccept}
            className="flex items-center gap-1 px-2.5 py-1 bg-green-500 hover:bg-green-400 text-white text-[11px] font-semibold rounded transition-colors"
          >
            <span>✓</span> Accept
          </button>
          <button
            onClick={onDecline}
            className="flex items-center gap-1 px-2.5 py-1 bg-red-500 hover:bg-red-400 text-white text-[11px] font-semibold rounded transition-colors"
          >
            <span>✗</span> Decline
          </button>
        </div>
      </div>

      {/* Removed lines */}
      {removedLines.length > 0 && (
        <div className="bg-red-50">
          {removedLines.map((line, i) => (
            <div
              key={i}
              className="flex items-start px-3 py-px gap-2 min-h-[1.4em]"
            >
              <span className="text-red-400 font-mono text-[12px] select-none shrink-0 mt-px">−</span>
              <span className="text-[13px] text-red-800 line-through leading-snug whitespace-pre-wrap break-words flex-1">
                {line || '\u00A0'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Added lines */}
      {addedLines.length > 0 && (
        <div className="bg-green-50">
          {addedLines.map((line, i) => (
            <div
              key={i}
              className="flex items-start px-3 py-px gap-2 min-h-[1.4em]"
            >
              <span className="text-green-500 font-mono text-[12px] select-none shrink-0 mt-px">+</span>
              <span className="text-[13px] text-green-800 leading-snug whitespace-pre-wrap break-words flex-1">
                {line || '\u00A0'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  hunks: DiffHunk[]
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}

export default function InlineDiffView({ hunks, onAccept, onDecline }: Props) {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-md px-8 py-6 font-sans">
      {hunks.map((hunk) =>
        hunk.type === 'equal' ? (
          <EqualSegment key={hunk.id} text={hunk.text} />
        ) : (
          <ChangedHunkBlock
            key={hunk.id}
            hunk={hunk}
            onAccept={() => onAccept(hunk.id)}
            onDecline={() => onDecline(hunk.id)}
          />
        ),
      )}
    </div>
  )
}
