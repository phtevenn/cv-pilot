import { describe, it, expect } from 'vitest'
import {
  computeBlockDiff,
  resolveBlockDiff,
  countBlockDiffPending,
  countBlockDiffTotal,
} from './blockDiff'
import type { ResumeBlock } from '../types/blocks'

let _seq = 0
function mkBlock(type: ResumeBlock['type'], content: string): ResumeBlock {
  return { id: `b${++_seq}`, type, title: type, content }
}

describe('computeBlockDiff', () => {
  it('marks identical content as unchanged', () => {
    const b = mkBlock('experience', 'same content')
    const revised = { ...b, id: `b${++_seq}` }
    const entries = computeBlockDiff([b], [revised])
    expect(entries[0].changeType).toBe('unchanged')
    expect(entries[0].hunks).toHaveLength(0)
  })

  it('marks modified content as changed with hunks', () => {
    const old = mkBlock('experience', 'old content\n')
    const rev = { ...old, id: `b${++_seq}`, content: 'new content\n' }
    const entries = computeBlockDiff([old], [rev])
    expect(entries[0].changeType).toBe('changed')
    expect(entries[0].hunks.length).toBeGreaterThan(0)
  })

  it('marks a block present only in revised as new', () => {
    const header = mkBlock('header', 'header')
    const extra = mkBlock('experience', 'new job')
    const entries = computeBlockDiff([header], [header, extra])
    const newEntry = entries.find((e) => e.changeType === 'new')
    expect(newEntry).toBeDefined()
    expect(newEntry!.blockType).toBe('experience')
    expect(newEntry!.oldBlock).toBeNull()
  })

  it('marks a block absent from revised as deleted', () => {
    const header = mkBlock('header', 'header')
    const exp = mkBlock('experience', 'job')
    const entries = computeBlockDiff([header, exp], [header])
    const deleted = entries.find((e) => e.changeType === 'deleted')
    expect(deleted).toBeDefined()
    expect(deleted!.newBlock).toBeNull()
  })

  it('all entries start with pending status', () => {
    const old = mkBlock('skills', 'Python\n')
    const rev = { ...old, id: `b${++_seq}`, content: 'TypeScript\n' }
    const entries = computeBlockDiff([old], [rev])
    expect(entries.every((e) => e.status === 'pending')).toBe(true)
  })
})

describe('resolveBlockDiff', () => {
  it('includes unchanged blocks unchanged', () => {
    const b = mkBlock('header', 'header')
    const rev = { ...b, id: `b${++_seq}` }
    const resolved = resolveBlockDiff(computeBlockDiff([b], [rev]))
    expect(resolved).toHaveLength(1)
  })

  it('uses newBlock for accepted changed entry', () => {
    const old = mkBlock('skills', 'Python\n')
    const rev = { ...old, id: `b${++_seq}`, content: 'TypeScript\n' }
    const entries = computeBlockDiff([old], [rev]).map((e) =>
      e.changeType === 'changed' ? { ...e, status: 'accepted' as const } : e,
    )
    expect(resolveBlockDiff(entries)[0].content).toBe('TypeScript\n')
  })

  it('uses oldBlock for declined changed entry', () => {
    const old = mkBlock('skills', 'Python\n')
    const rev = { ...old, id: `b${++_seq}`, content: 'TypeScript\n' }
    const entries = computeBlockDiff([old], [rev]).map((e) =>
      e.changeType === 'changed' ? { ...e, status: 'declined' as const } : e,
    )
    expect(resolveBlockDiff(entries)[0].content).toBe('Python\n')
  })

  it('excludes declined new block', () => {
    const header = mkBlock('header', 'header')
    const extra = mkBlock('experience', 'new job')
    const entries = computeBlockDiff([header], [header, extra]).map((e) =>
      e.changeType === 'new' ? { ...e, status: 'declined' as const } : e,
    )
    const resolved = resolveBlockDiff(entries)
    expect(resolved.every((b) => b.type !== 'experience')).toBe(true)
  })

  it('includes pending new block (live-preview default)', () => {
    const header = mkBlock('header', 'header')
    const extra = mkBlock('experience', 'new job')
    const entries = computeBlockDiff([header], [header, extra])
    expect(resolveBlockDiff(entries).some((b) => b.type === 'experience')).toBe(true)
  })

  it('removes accepted deleted block', () => {
    const header = mkBlock('header', 'header')
    const exp = mkBlock('experience', 'job')
    const entries = computeBlockDiff([header, exp], [header]).map((e) =>
      e.changeType === 'deleted' ? { ...e, status: 'accepted' as const } : e,
    )
    const resolved = resolveBlockDiff(entries)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].type).toBe('header')
  })

  it('keeps declined deleted block', () => {
    const header = mkBlock('header', 'header')
    const exp = mkBlock('experience', 'job')
    const entries = computeBlockDiff([header, exp], [header]).map((e) =>
      e.changeType === 'deleted' ? { ...e, status: 'declined' as const } : e,
    )
    expect(resolveBlockDiff(entries)).toHaveLength(2)
  })

  it('keeps pending deleted block (live-preview default)', () => {
    const header = mkBlock('header', 'header')
    const exp = mkBlock('experience', 'job')
    const entries = computeBlockDiff([header, exp], [header])
    expect(resolveBlockDiff(entries)).toHaveLength(2)
  })
})

describe('countBlockDiffPending / countBlockDiffTotal', () => {
  it('counts changed entries in total and pending', () => {
    const old = mkBlock('skills', 'Python\n')
    const rev = { ...old, id: `b${++_seq}`, content: 'TypeScript\n' }
    const entries = computeBlockDiff([old], [rev])
    expect(countBlockDiffTotal(entries)).toBe(1)
    expect(countBlockDiffPending(entries)).toBe(1)
  })

  it('pending drops to zero after all entries are accepted', () => {
    const old = mkBlock('skills', 'Python\n')
    const rev = { ...old, id: `b${++_seq}`, content: 'TypeScript\n' }
    const accepted = computeBlockDiff([old], [rev]).map((e) => ({
      ...e,
      status: 'accepted' as const,
    }))
    expect(countBlockDiffPending(accepted)).toBe(0)
    expect(countBlockDiffTotal(accepted)).toBe(1)
  })

  it('unchanged blocks are not counted in total', () => {
    const b = mkBlock('header', 'same')
    const rev = { ...b, id: `b${++_seq}` }
    const entries = computeBlockDiff([b], [rev])
    expect(countBlockDiffTotal(entries)).toBe(0)
    expect(countBlockDiffPending(entries)).toBe(0)
  })
})
