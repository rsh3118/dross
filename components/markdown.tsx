import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { renderWikiLinks } from '@/lib/wiki-text'
import { cn } from '@/lib/utils'

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose-dross', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith('/') ? undefined : '_blank'}
              rel={href?.startsWith('/') ? undefined : 'noopener noreferrer'}
            >
              {children}
            </a>
          ),
        }}
      >
        {renderWikiLinks(content)}
      </ReactMarkdown>
    </div>
  )
}
