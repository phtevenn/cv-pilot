import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNodeText(node: any): string {
  if (node.type === 'text') return (node.value as string) ?? ''
  if (Array.isArray(node.children)) {
    return (node.children as any[]).map(getNodeText).join('')
  }
  return ''
}

// ---------------------------------------------------------------------------
// Remark plugin — annotates top-level paragraphs with data-resume-type
// so custom renderers can style them correctly without needing counters in
// React render (which breaks in Strict Mode).
// ---------------------------------------------------------------------------

function remarkResumeAnnotate() {
  return (tree: any) => {
    let idx = 0
    for (const node of tree.children as any[]) {
      if (node.type !== 'paragraph') continue
      const currentIdx = idx++
      let type = 'text'

      if (currentIdx === 0) {
        type = 'name'
      } else if (currentIdx === 1) {
        type = 'contact'
      } else {
        const children: any[] = node.children
        const isBoldOnly = children.length === 1 && children[0].type === 'strong'

        if (isBoldOnly) {
          const text = getNodeText(children[0]).trim()
          if (/^[A-Z][A-Z\s&/]+$/.test(text)) {
            type = 'section'
          } else if (text.length < 80) {
            // Short bold line → job title / degree / project name
            type = 'jobtitle'
          }
          // Long bold lines (e.g. publication citations) stay as 'text'
        } else {
          const hasStrong = children.some((c: any) => c.type === 'strong')
          const hasBullet = children.some(
            (c: any) => c.type === 'text' && (c.value as string)?.includes('•'),
          )
          if (hasStrong && hasBullet) {
            type = 'company'
          } else if (currentIdx === 2) {
            // Third paragraph is typically the professional summary
            type = 'summary'
          }
        }
      }

      node.data = node.data ?? {}
      node.data.hProperties = {
        ...(node.data.hProperties ?? {}),
        'data-resume-type': type,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CompanyLine — company name left, date range right
// ---------------------------------------------------------------------------

function CompanyLine({ children }: { children: React.ReactNode }) {
  const parts = React.Children.toArray(children)
  const bulletIdx = parts.findIndex(
    (p) => typeof p === 'string' && (p as string).includes('•'),
  )

  if (bulletIdx > 0) {
    return (
      <div className="flex justify-between items-baseline mt-4 mb-0.5">
        <span className="text-sm font-semibold text-gray-900">
          {parts.slice(0, bulletIdx)}
        </span>
        <span className="text-xs text-gray-500 font-normal tabular-nums">
          {parts.slice(bulletIdx + 1)}
        </span>
      </div>
    )
  }

  // Fallback — no bullet found
  return <p className="text-sm font-semibold mt-4 mb-0.5">{children}</p>
}

// ---------------------------------------------------------------------------
// ResumePreview
// ---------------------------------------------------------------------------

interface Props {
  content: string
}

export default function ResumePreview({ content }: Props) {
  const remarkPlugins = useMemo(
    () => [remarkGfm, remarkResumeAnnotate] as any[],
    [],
  )

  const components = useMemo(
    () => ({
      p({ children, node: _node, ...props }: any) {
        const type = (props['data-resume-type'] as string) ?? 'text'

        switch (type) {
          case 'name':
            return (
              <h1 className="text-[22px] font-bold text-center tracking-[0.18em] uppercase mb-1 text-gray-900">
                {children}
              </h1>
            )

          case 'contact':
            return (
              <p className="text-[11px] text-center text-gray-500 mb-4 leading-relaxed tracking-wide">
                {children}
              </p>
            )

          case 'summary':
            return (
              <p className="text-[13px] text-gray-600 text-center italic mb-5 leading-relaxed border-b border-gray-200 pb-4">
                {children}
              </p>
            )

          case 'section':
            return (
              <div className="mt-5 mb-2 border-b border-gray-400 pb-px">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-700">
                  {children}
                </span>
              </div>
            )

          case 'jobtitle':
            return (
              <p className="text-[13px] font-medium italic text-gray-600 mt-0.5 mb-1.5">
                {children}
              </p>
            )

          case 'company':
            return <CompanyLine>{children}</CompanyLine>

          default:
            return (
              <p className="text-[13px] text-gray-700 mb-2 leading-relaxed">
                {children}
              </p>
            )
        }
      },

      ul({ children }: any) {
        return (
          <ul className="list-disc ml-5 mb-3 mt-1.5 space-y-0.5">{children}</ul>
        )
      },

      li({ children }: any) {
        return (
          <li className="text-[13px] text-gray-700 leading-snug pl-0.5">
            {children}
          </li>
        )
      },

      strong({ children }: any) {
        return <strong className="font-semibold text-gray-900">{children}</strong>
      },

      a({ href, children }: any) {
        return (
          <a
            href={href}
            className="text-blue-600 hover:underline break-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        )
      },
    }),
    [],
  )

  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-md px-12 py-10 font-sans min-h-full">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
