import type { BlockDiffEntry } from '../utils/blockDiff'
import type { DiffHunk } from '../utils/diff'

// ---------------------------------------------------------------------------
// Type badge colours (mirrors BlockEditor.tsx)
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  header: 'bg-purple-900 text-purple-300',
  summary: 'bg-blue-900 text-blue-300',
  experience: 'bg-indigo-900 text-indigo-300',
  education: 'bg-teal-900 text-teal-300',
  skills: 'bg-green-900 text-green-300',
  projects: 'bg-orange-900 text-orange-300',
  publications: 'bg-amber-900 text-amber-300',
  custom: 'bg-gray-700 text-gray-300',
}

// ---------------------------------------------------------------------------
// Line diff renderer (for 'changed' blocks)
// ---------------------------------------------------------------------------

function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function DiffLines({ hunks }: { hunks: DiffHunk[] }) {
  return (
    <div className="font-mono text-xs leading-relaxed overflow-auto max-h-72">
      {hunks.map((hunk) => {
        if (hunk.type === 'equal') {
          const lines = splitLines(hunk.text)
          // Collapse long equal sections to context lines only
          const MAX_CTX = 3
          const visible =
            lines.length > MAX_CTX * 2
              ? [
                  ...lines.slice(0, MAX_CTX),
                  null, // separator
                  ...lines.slice(-MAX_CTX),
                ]
              : lines
          return visible.map((line, i) =>
            line === null ? (
              <div key={`${hunk.id}-sep-${i}`} className="px-3 py-0.5 text-gray-600 select-none">
                ···
              </div>
            ) : (
              <div key={`${hunk.id}-eq-${i}`} className="px-3 py-px text-gray-500 whitespace-pre-wrap break-words">
                {' '}
                {line || '\u00A0'}
              </div>
            ),
          )
        }

        const removedLines = splitLines(hunk.originalText)
        const addedLines = splitLines(hunk.revisedText)
        return (
          <div key={hunk.id}>
            {removedLines.map((line, i) => (
              <div
                key={`${hunk.id}-rm-${i}`}
                className="px-3 py-px bg-red-950 text-red-300 whitespace-pre-wrap break-words"
              >
                <span className="select-none text-red-500 mr-1">−</span>
                {line || '\u00A0'}
              </div>
            ))}
            {addedLines.map((line, i) => (
              <div
                key={`${hunk.id}-add-${i}`}
                className="px-3 py-px bg-green-950 text-green-300 whitespace-pre-wrap break-words"
              >
                <span className="select-none text-green-500 mr-1">+</span>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block entry card
// ---------------------------------------------------------------------------

interface EntryCardProps {
  entry: BlockDiffEntry
  onAccept: () => void
  onDecline: () => void
}

function EntryCard({ entry, onAccept, onDecline }: EntryCardProps) {
  const badgeColor = TYPE_COLORS[entry.blockType] ?? TYPE_COLORS.custom
  const label = entry.blockTitle || entry.blockType

  // Unchanged — render as a quiet collapsed row
  if (entry.changeType === 'unchanged') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/40 text-gray-600">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor} opacity-40`}>
          {entry.blockType}
        </span>
        <span className="text-xs truncate">{label}</span>
        <span className="ml-auto text-[10px] italic">unchanged</span>
      </div>
    )
  }

  // Accepted / declined states
  if (entry.status !== 'pending') {
    const isAccepted = entry.status === 'accepted'
    const borderColor = isAccepted ? 'border-green-700' : 'border-gray-600'
    const statusLabel = isAccepted ? 'Accepted' : 'Declined'
    const statusColor = isAccepted ? 'text-green-400' : 'text-gray-500'

    return (
      <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
            {entry.blockType}
          </span>
          <span className="text-xs text-gray-300 truncate">{label}</span>
          <span className={`ml-auto text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
        </div>
      </div>
    )
  }

  // Pending state — show diff + actions

  // Colour scheme per change type
  const borderColor =
    entry.changeType === 'new'
      ? 'border-green-700'
      : entry.changeType === 'deleted'
        ? 'border-red-700'
        : 'border-indigo-700'

  const headerBg =
    entry.changeType === 'new'
      ? 'bg-green-900/30'
      : entry.changeType === 'deleted'
        ? 'bg-red-900/30'
        : 'bg-indigo-900/30'

  const changeLabel =
    entry.changeType === 'new'
      ? 'New block'
      : entry.changeType === 'deleted'
        ? 'Deleted block'
        : 'Changed'

  // Accept button label differs for deleted blocks
  const acceptLabel = entry.changeType === 'deleted' ? '✓ Accept (remove)' : '✓ Accept'
  const declineLabel = entry.changeType === 'deleted' ? '✗ Keep' : '✗ Decline'

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
      {/* Card header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
          {entry.blockType}
        </span>
        <span className="text-xs text-gray-200 truncate font-medium">{label}</span>
        <span className="ml-auto text-[10px] text-gray-400 italic shrink-0">{changeLabel}</span>
      </div>

      {/* Diff content */}
      <div className="bg-gray-950">
        {entry.changeType === 'changed' && entry.hunks.length > 0 && (
          <DiffLines hunks={entry.hunks} />
        )}

        {entry.changeType === 'new' && (
          <div className="font-mono text-xs leading-relaxed overflow-auto max-h-48">
            {splitLines(entry.newBlock?.content ?? '').map((line, i) => (
              <div
                key={i}
                className="px-3 py-px bg-green-950 text-green-300 whitespace-pre-wrap break-words"
              >
                <span className="select-none text-green-500 mr-1">+</span>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )}

        {entry.changeType === 'deleted' && (
          <div className="font-mono text-xs leading-relaxed overflow-auto max-h-48">
            {splitLines(entry.oldBlock?.content ?? '').map((line, i) => (
              <div
                key={i}
                className="px-3 py-px bg-red-950 text-red-300 whitespace-pre-wrap break-words"
              >
                <span className="select-none text-red-500 mr-1">−</span>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-3 py-2 bg-gray-800 border-t border-gray-700">
        <button
          onClick={onAccept}
          className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors"
        >
          {acceptLabel}
        </button>
        <button
          onClick={onDecline}
          className="flex-1 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded transition-colors"
        >
          {declineLabel}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main BlockDiffView
// ---------------------------------------------------------------------------

interface Props {
  entries: BlockDiffEntry[]
  onAccept: (id: string) => void
  onDecline: (id: string) => void
  onAcceptAll: () => void
  onDeclineAll: () => void
}

export default function BlockDiffView({
  entries,
  onAccept,
  onDecline,
  onAcceptAll,
  onDeclineAll,
}: Props) {
  const pending = entries.filter((e) => e.changeType !== 'unchanged' && e.status === 'pending')
  const total = entries.filter((e) => e.changeType !== 'unchanged')
  const unchanged = entries.filter((e) => e.changeType === 'unchanged')
  const changed = entries.filter((e) => e.changeType !== 'unchanged')

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-xs text-gray-300 font-medium">
          {pending.length > 0
            ? `${pending.length} of ${total.length} block changes pending`
            : `All ${total.length} block changes reviewed`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onAcceptAll}
            className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors"
          >
            Accept All
          </button>
          <button
            onClick={onDeclineAll}
            className="px-2.5 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded transition-colors"
          >
            Decline All
          </button>
        </div>
      </div>

      {/* Entry list — only changed blocks; unchanged collapsed to a summary line */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {changed.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onAccept={() => onAccept(entry.id)}
            onDecline={() => onDecline(entry.id)}
          />
        ))}
        {unchanged.length > 0 && (
          <p className="text-center text-gray-600 text-xs py-1">
            {unchanged.length} section{unchanged.length !== 1 ? 's' : ''} unchanged
          </p>
        )}
      </div>
    </div>
  )
}
