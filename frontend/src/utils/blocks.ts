import type { BlockType, ResumeBlock } from '../types/blocks'
import { DEFAULT_TITLES } from '../types/blocks'

// ---------------------------------------------------------------------------
// Unique ID counter (avoids crypto.randomUUID issues in some test envs)
// ---------------------------------------------------------------------------

let _uid = 0
function uid(): string {
  return `block-${++_uid}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Delimiter regex
// Format: <!-- block:{type}|{title} -->
// ---------------------------------------------------------------------------

const DELIMITER_RE = /^<!-- block:([a-z]+)\|([^>]*) -->$/

// ---------------------------------------------------------------------------
// serializeBlocks
// ---------------------------------------------------------------------------

export function serializeBlocks(blocks: ResumeBlock[]): string {
  return blocks
    .map((b) => {
      const delimiter = `<!-- block:${b.type}|${b.title} -->`
      return `${delimiter}\n${b.content}`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// deserializeBlocks
// Returns [] for legacy markdown that has no block delimiters.
// ---------------------------------------------------------------------------

export function deserializeBlocks(markdown: string): ResumeBlock[] {
  const lines = markdown.split('\n')

  // Quick check: does it have any block delimiters?
  const hasDelimiters = lines.some((l) => DELIMITER_RE.test(l.trim()))
  if (!hasDelimiters) return []

  const blocks: ResumeBlock[] = []
  let currentType: BlockType | null = null
  let currentTitle = ''
  let currentLines: string[] = []

  const flush = () => {
    if (currentType !== null) {
      blocks.push({
        id: uid(),
        type: currentType,
        title: currentTitle,
        content: currentLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, ''),
      })
    }
  }

  for (const line of lines) {
    const match = DELIMITER_RE.exec(line.trim())
    if (match) {
      flush()
      currentType = match[1] as BlockType
      currentTitle = match[2]
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  flush()
  return blocks
}

// ---------------------------------------------------------------------------
// migrateMarkdownToBlocks
// Converts legacy plain markdown into blocks by scanning for section headings.
// ---------------------------------------------------------------------------

export function migrateMarkdownToBlocks(markdown: string): ResumeBlock[] {
  if (!markdown.trim()) {
    return [
      {
        id: uid(),
        type: 'header',
        title: DEFAULT_TITLES.header,
        content: '',
      },
    ]
  }

  const lines = markdown.split('\n')

  // A section heading is a paragraph that is ONLY a bold all-caps word/phrase.
  // E.g. "**EXPERIENCE**" or "**WORK EXPERIENCE**"
  // We also handle lines like "## EXPERIENCE" (ATX headings).
  const SECTION_RE = /^\*\*([A-Z][A-Z0-9\s&/(),-]+)\*\*$|^#{1,3}\s+([A-Z][A-Z0-9\s&/(),-]+)$/

  // Find all section boundaries
  interface Section {
    lineIndex: number
    heading: string
  }
  const sections: Section[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const m = SECTION_RE.exec(trimmed)
    // Skip line 0 — the very first line is almost always the name, not a section
    if (m && i > 0) {
      sections.push({ lineIndex: i, heading: (m[1] ?? m[2]).trim() })
    }
  }

  const guessType = (heading: string): BlockType => {
    const h = heading.toUpperCase()
    if (/EXPERIENCE|WORK|EMPLOYMENT|CAREER|PROFESSIONAL/.test(h)) return 'experience'
    if (/EDUCATION|ACADEMIC|DEGREE/.test(h)) return 'education'
    if (/SKILL|TECHNICAL|TECHNOLOGY|TOOL|COMPETENC/.test(h)) return 'skills'
    if (/PROJECT/.test(h)) return 'projects'
    if (/PUBLICATION|PAPER|RESEARCH|JOURNAL/.test(h)) return 'publications'
    if (/SUMMARY|OBJECTIVE|PROFILE|ABOUT/.test(h)) return 'summary'
    return 'custom'
  }

  const blocks: ResumeBlock[] = []

  if (sections.length === 0) {
    // No headings — treat entire thing as header
    blocks.push({
      id: uid(),
      type: 'header',
      title: DEFAULT_TITLES.header,
      content: markdown.trim(),
    })
    return blocks
  }

  // Everything before the first section heading is header + possibly summary
  const headerLines = lines.slice(0, sections[0].lineIndex)

  // Detect summary: look for a non-empty, non-bullet paragraph that appears
  // after what looks like name/contact lines (typically after a blank line).
  let headerContent = headerLines.join('\n').trim()
  let summaryContent = ''

  // Heuristic: if there are 3+ "paragraphs" in the header section, the last
  // paragraph(s) that lack bold/bullets might be a summary.
  const headerParas = headerContent.split(/\n{2,}/)
  if (headerParas.length >= 3) {
    const lastPara = headerParas[headerParas.length - 1].trim()
    const isSummaryLike =
      lastPara.length > 0 &&
      lastPara.length < 600 &&
      !lastPara.startsWith('-') &&
      !lastPara.startsWith('*') &&
      !/^\*\*/.test(lastPara)
    if (isSummaryLike) {
      summaryContent = lastPara
      headerContent = headerParas.slice(0, -1).join('\n\n').trim()
    }
  }

  blocks.push({
    id: uid(),
    type: 'header',
    title: DEFAULT_TITLES.header,
    content: headerContent,
  })

  if (summaryContent) {
    blocks.push({
      id: uid(),
      type: 'summary',
      title: DEFAULT_TITLES.summary,
      content: summaryContent,
    })
  }

  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const { lineIndex, heading } = sections[i]
    const nextLineIndex = i + 1 < sections.length ? sections[i + 1].lineIndex : lines.length
    // Content is everything after the heading line up to the next heading
    const contentLines = lines.slice(lineIndex + 1, nextLineIndex)
    const content = contentLines.join('\n').trim()
    const type = guessType(heading)
    // Use heading text as title, title-cased
    const title = heading.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

    blocks.push({
      id: uid(),
      type,
      title,
      content,
    })
  }

  return blocks
}

// ---------------------------------------------------------------------------
// blocksToMarkdown
// Produces clean markdown for AI (no delimiter comments).
// ---------------------------------------------------------------------------

export function blocksToMarkdown(blocks: ResumeBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'header') {
        return b.content
      }
      const heading = `**${b.title.toUpperCase()}**`
      return `${heading}\n\n${b.content}`
    })
    .filter(Boolean)
    .join('\n\n')
}
