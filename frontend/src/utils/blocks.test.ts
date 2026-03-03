import { describe, it, expect } from 'vitest'
import {
  serializeBlocks,
  deserializeBlocks,
  migrateMarkdownToBlocks,
  blocksToMarkdown,
} from './blocks'
import type { ResumeBlock } from '../types/blocks'

function mkBlock(
  type: ResumeBlock['type'],
  title: string,
  content: string,
): ResumeBlock {
  return { id: 'test', type, title, content }
}

describe('serializeBlocks / deserializeBlocks round-trip', () => {
  it('round-trips a single block', () => {
    const blocks = [mkBlock('experience', 'Experience', '* Job 1\n* Job 2')]
    const parsed = deserializeBlocks(serializeBlocks(blocks))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('experience')
    expect(parsed[0].title).toBe('Experience')
    expect(parsed[0].content).toBe('* Job 1\n* Job 2')
  })

  it('round-trips multiple blocks preserving order', () => {
    const blocks = [
      mkBlock('header', '', 'John Doe\njohn@example.com'),
      mkBlock('experience', 'Experience', '* Did things'),
      mkBlock('education', 'Education', 'BS CS'),
    ]
    const parsed = deserializeBlocks(serializeBlocks(blocks))
    expect(parsed).toHaveLength(3)
    expect(parsed[0].type).toBe('header')
    expect(parsed[1].type).toBe('experience')
    expect(parsed[2].type).toBe('education')
  })

  it('returns [] for plain markdown without delimiters', () => {
    expect(deserializeBlocks('# Plain markdown\n\nNo delimiters.')).toEqual([])
  })

  it('trims leading/trailing newlines from block content', () => {
    const blocks = [mkBlock('skills', 'Skills', 'Python')]
    const parsed = deserializeBlocks(serializeBlocks(blocks))
    expect(parsed[0].content).toBe('Python')
  })
})

describe('migrateMarkdownToBlocks', () => {
  it('returns a single header block for plain text with no section headings', () => {
    const blocks = migrateMarkdownToBlocks('Just some text without headings')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('header')
  })

  it('returns a header block with empty content for empty input', () => {
    const blocks = migrateMarkdownToBlocks('')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('header')
    expect(blocks[0].content).toBe('')
  })

  it('detects experience section from bold all-caps heading', () => {
    const md = 'John Doe\n\n**WORK EXPERIENCE**\n\n* Did things at Company'
    const blocks = migrateMarkdownToBlocks(md)
    const exp = blocks.find((b) => b.type === 'experience')
    expect(exp).toBeDefined()
    expect(exp!.content).toContain('Did things')
  })

  it('detects skills section', () => {
    const md = 'Name\n\n**SKILLS**\n\nPython, TypeScript, Go'
    const blocks = migrateMarkdownToBlocks(md)
    expect(blocks.find((b) => b.type === 'skills')).toBeDefined()
  })

  it('detects education section', () => {
    const md = 'Name\n\n**EDUCATION**\n\nUniversity of X'
    const blocks = migrateMarkdownToBlocks(md)
    expect(blocks.find((b) => b.type === 'education')).toBeDefined()
  })

  it('detects projects section', () => {
    const md = 'Name\n\n**PROJECTS**\n\nMy Project'
    const blocks = migrateMarkdownToBlocks(md)
    expect(blocks.find((b) => b.type === 'projects')).toBeDefined()
  })

  it('always produces a header block', () => {
    const md = 'Jane Doe\n\n**EDUCATION**\n\nMIT'
    const blocks = migrateMarkdownToBlocks(md)
    expect(blocks.find((b) => b.type === 'header')).toBeDefined()
  })
})

describe('blocksToMarkdown', () => {
  it('renders header content directly without a heading', () => {
    const blocks = [mkBlock('header', '', 'John Doe')]
    expect(blocksToMarkdown(blocks)).toBe('John Doe')
  })

  it('renders section blocks with bold uppercase title', () => {
    const blocks = [mkBlock('experience', 'Experience', '* Job')]
    const md = blocksToMarkdown(blocks)
    expect(md).toContain('**EXPERIENCE**')
    expect(md).toContain('* Job')
  })

  it('separates blocks with double newlines', () => {
    const blocks = [
      mkBlock('header', '', 'Name'),
      mkBlock('skills', 'Skills', 'Python'),
    ]
    const md = blocksToMarkdown(blocks)
    expect(md).toMatch(/Name\n\n/)
    expect(md).toContain('**SKILLS**')
  })

  it('skips empty blocks', () => {
    const blocks = [mkBlock('header', '', ''), mkBlock('skills', 'Skills', 'Go')]
    const md = blocksToMarkdown(blocks)
    expect(md).not.toMatch(/^\n/)
  })
})
