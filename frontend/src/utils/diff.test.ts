import { describe, it, expect } from 'vitest'
import {
  computeLineDiff,
  resolveHunks,
  countChangedHunks,
  countPendingHunks,
} from './diff'

describe('computeLineDiff', () => {
  it('returns only equal hunks for identical strings', () => {
    const hunks = computeLineDiff('hello\nworld\n', 'hello\nworld\n')
    expect(hunks.every((h) => h.type === 'equal')).toBe(true)
  })

  it('returns a changed hunk for completely different content', () => {
    const hunks = computeLineDiff('foo\n', 'bar\n')
    const changed = hunks.filter((h) => h.type === 'changed')
    expect(changed.length).toBeGreaterThan(0)
    expect(changed[0].originalText).toContain('foo')
    expect(changed[0].revisedText).toContain('bar')
  })

  it('detects an added line', () => {
    const hunks = computeLineDiff('line1\n', 'line1\nnew line\n')
    expect(hunks.some((h) => h.type === 'changed')).toBe(true)
  })

  it('detects a removed line', () => {
    const hunks = computeLineDiff('line1\nline2\n', 'line1\n')
    expect(hunks.some((h) => h.type === 'changed')).toBe(true)
  })

  it('all hunks start with pending status', () => {
    const hunks = computeLineDiff('a\n', 'b\n')
    expect(hunks.every((h) => h.status === 'pending')).toBe(true)
  })

  it('equal hunks carry the shared text', () => {
    const hunks = computeLineDiff('keep\nchange\n', 'keep\nmodified\n')
    const equal = hunks.filter((h) => h.type === 'equal')
    expect(equal.some((h) => h.text.includes('keep'))).toBe(true)
  })
})

describe('resolveHunks', () => {
  it('returns original text when no changes', () => {
    const hunks = computeLineDiff('same\n', 'same\n')
    expect(resolveHunks(hunks)).toBe('same\n')
  })

  it('applies revised text when change is pending', () => {
    const hunks = computeLineDiff('old\n', 'new\n')
    expect(resolveHunks(hunks)).toContain('new')
  })

  it('applies revised text when change is accepted', () => {
    const hunks = computeLineDiff('old\n', 'new\n').map((h) =>
      h.type === 'changed' ? { ...h, status: 'accepted' as const } : h,
    )
    expect(resolveHunks(hunks)).toContain('new')
  })

  it('restores original text when change is declined', () => {
    const hunks = computeLineDiff('old\n', 'new\n').map((h) =>
      h.type === 'changed' ? { ...h, status: 'declined' as const } : h,
    )
    expect(resolveHunks(hunks)).toContain('old')
    expect(resolveHunks(hunks)).not.toContain('new')
  })
})

describe('countChangedHunks / countPendingHunks', () => {
  it('counts one changed hunk for a single-line edit', () => {
    const hunks = computeLineDiff('a\nb\n', 'x\nb\n')
    expect(countChangedHunks(hunks)).toBe(1)
    expect(countPendingHunks(hunks)).toBe(1)
  })

  it('pending count drops to zero after all changes are accepted', () => {
    const hunks = computeLineDiff('a\n', 'b\n').map((h) =>
      h.type === 'changed' ? { ...h, status: 'accepted' as const } : h,
    )
    expect(countPendingHunks(hunks)).toBe(0)
    expect(countChangedHunks(hunks)).toBe(1)
  })

  it('returns zero changed hunks for identical strings', () => {
    const hunks = computeLineDiff('same\n', 'same\n')
    expect(countChangedHunks(hunks)).toBe(0)
    expect(countPendingHunks(hunks)).toBe(0)
  })
})
