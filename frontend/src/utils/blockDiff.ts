import type { BlockType, ResumeBlock } from '../types/blocks'
import { computeLineDiff } from './diff'
import type { DiffHunk } from './diff'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlockDiffStatus = 'pending' | 'accepted' | 'declined'
export type BlockChangeType = 'unchanged' | 'changed' | 'new' | 'deleted'

export interface BlockDiffEntry {
  id: string
  changeType: BlockChangeType
  blockType: BlockType
  blockTitle: string
  /** Content of the block in the current revision (empty string if new). */
  oldBlock: ResumeBlock | null
  /** Content of the block in the revised revision (empty string if deleted). */
  newBlock: ResumeBlock | null
  /** Line-level diff hunks — populated only for 'changed' entries. */
  hunks: DiffHunk[]
  /** Pending until the user accepts or declines. Unchanged blocks are always 'pending' but ignored. */
  status: BlockDiffStatus
}

// ---------------------------------------------------------------------------
// Block matching
// ---------------------------------------------------------------------------

/**
 * Match blocks from current to revised by type in order.
 * Extra revised blocks become 'new'; leftover current blocks become 'deleted'.
 */
function matchBlocks(
  current: ResumeBlock[],
  revised: ResumeBlock[],
): Array<{ old: ResumeBlock | null; new: ResumeBlock | null }> {
  // Group current blocks by type, preserving order
  const currentByType = new Map<string, ResumeBlock[]>()
  for (const b of current) {
    if (!currentByType.has(b.type)) currentByType.set(b.type, [])
    currentByType.get(b.type)!.push(b)
  }

  const matchedCurrentIds = new Set<string>()
  const pairs: Array<{ old: ResumeBlock | null; new: ResumeBlock | null }> = []

  // For each revised block, find the next unmatched current block of the same type
  const revisedTypeUsage = new Map<string, number>()
  for (const rev of revised) {
    const used = revisedTypeUsage.get(rev.type) ?? 0
    revisedTypeUsage.set(rev.type, used + 1)
    const curr = currentByType.get(rev.type)?.[used] ?? null
    if (curr) matchedCurrentIds.add(curr.id)
    pairs.push({ old: curr, new: rev })
  }

  // Append deleted blocks (current blocks with no match in revised)
  for (const b of current) {
    if (!matchedCurrentIds.has(b.id)) {
      pairs.push({ old: b, new: null })
    }
  }

  return pairs
}

// ---------------------------------------------------------------------------
// computeBlockDiff
// ---------------------------------------------------------------------------

let _counter = 0

export function computeBlockDiff(
  current: ResumeBlock[],
  revised: ResumeBlock[],
): BlockDiffEntry[] {
  const pairs = matchBlocks(current, revised)

  return pairs.map((pair) => {
    const id = `bdiff-${++_counter}`
    const blockType = (pair.new?.type ?? pair.old?.type ?? 'custom') as BlockType
    const blockTitle = pair.new?.title ?? pair.old?.title ?? ''

    if (!pair.old) {
      return {
        id,
        changeType: 'new',
        blockType,
        blockTitle,
        oldBlock: null,
        newBlock: pair.new!,
        hunks: [],
        status: 'pending',
      } satisfies BlockDiffEntry
    }

    if (!pair.new) {
      return {
        id,
        changeType: 'deleted',
        blockType,
        blockTitle,
        oldBlock: pair.old,
        newBlock: null,
        hunks: [],
        status: 'pending',
      } satisfies BlockDiffEntry
    }

    const hunks = computeLineDiff(pair.old.content, pair.new.content)
    const hasChanges = hunks.some((h) => h.type === 'changed')

    return {
      id,
      changeType: hasChanges ? 'changed' : 'unchanged',
      blockType,
      blockTitle,
      oldBlock: pair.old,
      newBlock: pair.new,
      hunks: hasChanges ? hunks : [],
      status: 'pending',
    } satisfies BlockDiffEntry
  })
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export function countBlockDiffPending(entries: BlockDiffEntry[]): number {
  return entries.filter((e) => e.changeType !== 'unchanged' && e.status === 'pending').length
}

export function countBlockDiffTotal(entries: BlockDiffEntry[]): number {
  return entries.filter((e) => e.changeType !== 'unchanged').length
}

// ---------------------------------------------------------------------------
// resolveBlockDiff — build final block list from accepted/declined entries
// ---------------------------------------------------------------------------

export function resolveBlockDiff(entries: BlockDiffEntry[]): ResumeBlock[] {
  const result: ResumeBlock[] = []

  for (const entry of entries) {
    switch (entry.changeType) {
      case 'unchanged':
        result.push(entry.oldBlock!)
        break
      case 'changed':
        // declined → keep old; accepted or pending (live preview) → use new
        result.push(entry.status === 'declined' ? entry.oldBlock! : entry.newBlock!)
        break
      case 'new':
        // declined → skip; accepted or pending → include
        if (entry.status !== 'declined') result.push(entry.newBlock!)
        break
      case 'deleted':
        // accepted → remove (skip); declined or pending → keep
        if (entry.status === 'declined') result.push(entry.oldBlock!)
        // pending defaults to keeping for live preview
        else if (entry.status === 'pending') result.push(entry.oldBlock!)
        break
    }
  }

  return result
}
