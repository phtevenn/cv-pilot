import { diff_match_patch } from 'diff-match-patch'

let _idCounter = 0
function uid(): string {
  return `hunk-${++_idCounter}`
}

export type HunkStatus = 'pending' | 'accepted' | 'declined'

export interface DiffHunk {
  id: string
  type: 'equal' | 'changed'
  /** Raw text for equal segments (may contain \n). */
  text: string
  /** Raw text of removed content for changed segments. */
  originalText: string
  /** Raw text of added content for changed segments. */
  revisedText: string
  status: HunkStatus
}

/**
 * Computes a line-level diff between two strings.
 * Consecutive delete/insert ops are merged into a single 'changed' hunk.
 */
export function computeLineDiff(original: string, revised: string): DiffHunk[] {
  const dmp = new diff_match_patch()

  // diff_linesToChars_ encodes each line (with its trailing \n) as one char.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineData = (dmp as any).diff_linesToChars_(original, revised) as {
    chars1: string
    chars2: string
    lineArray: string[]
  }

  const rawDiffs = dmp.diff_main(lineData.chars1, lineData.chars2, false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(dmp as any).diff_charsToLines_(rawDiffs, lineData.lineArray)

  const hunks: DiffHunk[] = []
  let pendingOriginalText = ''
  let pendingRevisedText = ''

  const flushPending = () => {
    if (pendingOriginalText || pendingRevisedText) {
      hunks.push({
        id: uid(),
        type: 'changed',
        text: '',
        originalText: pendingOriginalText,
        revisedText: pendingRevisedText,
        status: 'pending',
      })
      pendingOriginalText = ''
      pendingRevisedText = ''
    }
  }

  for (const [op, text] of rawDiffs) {
    if (op === 0) {
      // DIFF_EQUAL
      flushPending()
      hunks.push({
        id: uid(),
        type: 'equal',
        text,
        originalText: '',
        revisedText: '',
        status: 'pending',
      })
    } else if (op === -1) {
      // DIFF_DELETE
      pendingOriginalText += text
    } else if (op === 1) {
      // DIFF_INSERT
      pendingRevisedText += text
    }
  }

  flushPending()
  return hunks
}

/**
 * Reconstructs the final document from resolved hunks.
 * Pending hunks are treated as accepted (show revised).
 */
export function resolveHunks(hunks: DiffHunk[]): string {
  return hunks
    .map((h) => {
      if (h.type === 'equal') return h.text
      return h.status === 'declined' ? h.originalText : h.revisedText
    })
    .join('')
}

export function countChangedHunks(hunks: DiffHunk[]): number {
  return hunks.filter((h) => h.type === 'changed').length
}

export function countPendingHunks(hunks: DiffHunk[]): number {
  return hunks.filter((h) => h.type === 'changed' && h.status === 'pending').length
}
