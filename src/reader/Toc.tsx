import { useEffect, useRef } from 'react'
import type { TocEntry } from '../book/types.ts'
import type { Bookmark } from './storage.ts'

type Tab = 'contents' | 'bookmarks'

interface Props {
  tab: Tab
  onTab: (tab: Tab) => void
  toc: TocEntry[]
  current?: number
  bookmarks: Bookmark[]
  onPick: (section: number) => void
  onPickBookmark: (bookmark: Bookmark) => void
  onDeleteBookmark: (id: string) => void
  onClose: () => void
}

/** Books often title chapters with a bare number; spell that out so it isn't mistaken for a page. */
export const chapterLabel = (title?: string) => (title && /^\d+$/.test(title) ? `Chapter ${title}` : title)

const formatDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Side drawer with the book's contents and the user's bookmarks. */
export function Toc(props: Props) {
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => activeRef.current?.scrollIntoView({ block: 'center' }), [props.tab])

  return (
    <div className="toc-backdrop" onClick={props.onClose}>
      <nav className="toc" onClick={(e) => e.stopPropagation()}>
        <div className="tabs" role="tablist">
          {(['contents', 'bookmarks'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={props.tab === t} onClick={() => props.onTab(t)}>
              {t === 'contents' ? 'Contents' : `Bookmarks${props.bookmarks.length ? ` (${props.bookmarks.length})` : ''}`}
            </button>
          ))}
        </div>

        {props.tab === 'contents' ? (
          <ul>
            {props.toc.map((t, i) => (
              <li key={i}>
                <button
                  ref={t.section === props.current ? activeRef : undefined}
                  className={t.section === props.current ? 'active' : undefined}
                  onClick={() => props.onPick(t.section)}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        ) : props.bookmarks.length ? (
          <ul>
            {props.bookmarks.map((b) => (
              <li key={b.id} className="bm">
                <button onClick={() => props.onPickBookmark(b)}>
                  <span className="bm-meta">
                    {[chapterLabel(b.chapter), b.page && `Page ${b.page}`, `Aa ${b.fontSize}`, formatDate(b.createdAt)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="bm-text">{b.snippet}</span>
                </button>
                <button className="bm-delete" aria-label="Delete bookmark" onClick={() => props.onDeleteBookmark(b.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            No bookmarks yet. Tap the middle of a page, then the bookmark icon at the top, or press <kbd>B</kbd>.
          </p>
        )}
      </nav>
    </div>
  )
}
