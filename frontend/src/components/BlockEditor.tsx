import { useState, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ResumeBlock, BlockType } from '../types/blocks'
import { DEFAULT_TITLES } from '../types/blocks'

// ---------------------------------------------------------------------------
// Unique ID counter
// ---------------------------------------------------------------------------

let _uid = 0
function uid(): string {
  return `block-${++_uid}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Type badge colors
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<BlockType, string> = {
  header: 'bg-purple-900 text-purple-300',
  summary: 'bg-blue-900 text-blue-300',
  experience: 'bg-indigo-900 text-indigo-300',
  education: 'bg-teal-900 text-teal-300',
  skills: 'bg-green-900 text-green-300',
  projects: 'bg-orange-900 text-orange-300',
  publications: 'bg-amber-900 text-amber-300',
  custom: 'bg-gray-700 text-gray-300',
}

const ALL_BLOCK_TYPES: BlockType[] = [
  'header',
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'publications',
  'custom',
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockEditorProps {
  blocks: ResumeBlock[]
  onChange: (blocks: ResumeBlock[]) => void
}

// ---------------------------------------------------------------------------
// SortableBlockCard
// ---------------------------------------------------------------------------

interface SortableBlockCardProps {
  block: ResumeBlock
  collapsed: boolean
  totalBlocks: number
  onToggleCollapse: (id: string) => void
  onChangeTitle: (id: string, title: string) => void
  onChangeContent: (id: string, content: string) => void
  onDelete: (id: string) => void
}

function SortableBlockCard({
  block,
  collapsed,
  totalBlocks,
  onToggleCollapse,
  onChangeTitle,
  onChangeContent,
  onDelete,
}: SortableBlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isOnlyBlock = totalBlocks <= 1
  const badgeColor = TYPE_COLORS[block.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-800 border border-gray-700 rounded-lg mb-2"
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 select-none flex-shrink-0"
          title="Drag to reorder"
        >
          <svg
            width="12"
            height="16"
            viewBox="0 0 12 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" />
            <circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" />
            <circle cx="9" cy="13" r="1.5" />
          </svg>
        </div>

        {/* Type badge */}
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${badgeColor}`}
        >
          {block.type}
        </span>

        {/* Title input — hidden for header blocks */}
        <input
          type="text"
          value={block.title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChangeTitle(block.id, e.target.value)
          }
          className={`flex-1 bg-transparent text-gray-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-500 rounded px-1 ${
            block.type === 'header' ? 'opacity-0 pointer-events-none' : ''
          }`}
          placeholder="Section title"
          aria-label="Section title"
        />

        {/* Collapse toggle */}
        <button
          onClick={() => onToggleCollapse(block.id)}
          className="text-gray-400 hover:text-gray-200 text-xs flex-shrink-0 px-1"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? '▸' : '▾'}
        </button>

        {/* Delete button */}
        <button
          onClick={() => !isOnlyBlock && onDelete(block.id)}
          className={`text-gray-500 hover:text-red-400 text-sm flex-shrink-0 px-1 ${
            isOnlyBlock ? 'opacity-30 pointer-events-none' : ''
          }`}
          title="Delete section"
          aria-label="Delete section"
          disabled={isOnlyBlock}
        >
          ×
        </button>
      </div>

      {/* CodeMirror editor
          Each SortableBlockCard mounts its own CodeMirror instance (keyed by block.id),
          so every block gets an independent EditorState with isolated undo/redo history.
          Ctrl+Z / Ctrl+Shift+Z work within each block and do not affect other blocks.
          The history() extension and historyKeymap are included automatically by
          @uiw/codemirror-extensions-basic-setup (history and historyKeymap are enabled
          unless explicitly set to false in the basicSetup prop). */}
      <div className={collapsed ? 'hidden' : ''}>
        <CodeMirror
          value={block.content}
          extensions={[markdown({ base: markdownLanguage, codeLanguages: languages })]}
          theme={oneDark}
          height="auto"
          minHeight="80px"
          maxHeight="400px"
          onChange={(value: string) => onChangeContent(block.id, value)}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: true,
            // history and historyKeymap are left at their default (true) so that
            // Ctrl+Z / Ctrl+Shift+Z undo/redo work inside each block editor.
          }}
          style={{ fontSize: '12px', borderTop: '1px solid rgb(55 65 81)' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddSectionDropdown
// ---------------------------------------------------------------------------

interface AddSectionDropdownProps {
  onAdd: (type: BlockType) => void
  onClose: () => void
}

function AddSectionDropdown({ onAdd, onClose }: AddSectionDropdownProps) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-xl z-20 shadow-xl py-1">
      {ALL_BLOCK_TYPES.map((type) => {
        const badgeColor = TYPE_COLORS[type]
        return (
          <button
            key={type}
            onClick={() => {
              onAdd(type)
              onClose()
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-700 transition-colors"
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeColor}`}
            >
              {type}
            </span>
            <span className="text-gray-300 text-sm">
              {DEFAULT_TITLES[type] || 'Header'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BlockEditor (main component)
// ---------------------------------------------------------------------------

export default function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [showAddDropdown, setShowAddDropdown] = useState(false)
  const addButtonRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(useSensor(PointerSensor))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = blocks.findIndex((b) => b.id === active.id)
    const newIndex = blocks.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(blocks, oldIndex, newIndex)
    onChange(reordered)
  }

  function handleToggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleChangeTitle(id: string, title: string) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, title } : b)))
  }

  function handleChangeContent(id: string, content: string) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)))
  }

  function handleDelete(id: string) {
    onChange(blocks.filter((b) => b.id !== id))
  }

  function handleAddBlock(type: BlockType) {
    const newBlock: ResumeBlock = {
      id: uid(),
      type,
      title: DEFAULT_TITLES[type],
      content: '',
    }
    onChange([...blocks, newBlock])
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-y-auto">
      <div className="flex-1 p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <SortableBlockCard
                key={block.id}
                block={block}
                collapsed={collapsedIds.has(block.id)}
                totalBlocks={blocks.length}
                onToggleCollapse={handleToggleCollapse}
                onChangeTitle={handleChangeTitle}
                onChangeContent={handleChangeContent}
                onDelete={handleDelete}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Add section button */}
        <div ref={addButtonRef} className="relative mt-2">
          {showAddDropdown && (
            <AddSectionDropdown
              onAdd={handleAddBlock}
              onClose={() => setShowAddDropdown(false)}
            />
          )}
          <button
            onClick={() => setShowAddDropdown((v) => !v)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-gray-100 rounded-lg py-2 text-sm font-medium transition-colors"
          >
            + Add Section
          </button>
        </div>
      </div>
    </div>
  )
}
