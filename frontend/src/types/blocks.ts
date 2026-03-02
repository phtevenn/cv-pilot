export type BlockType =
  | 'header'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'publications'
  | 'custom'

export interface ResumeBlock {
  id: string
  type: BlockType
  title: string        // display title shown as section heading in preview
  content: string      // markdown content inside this block
}

// Default display titles per type (used when adding a new block)
export const DEFAULT_TITLES: Record<BlockType, string> = {
  header: '',          // no section heading for header — it IS the header
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  publications: 'Publications',
  custom: 'Section',
}
