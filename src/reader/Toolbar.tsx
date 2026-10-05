import { useState } from 'react'
import type { Theme } from './storage.ts'
import { chapterLabel } from './Toc.tsx'

interface Props {
  title: string
  chapter?: string
  section: number
  sectionCount: number
  theme: Theme
  onToc: () => void
  marked: boolean
  onBookmark: () => void
  onSmaller: () => void
  onBigger: () => void
  onTheme: () => void
  onSeek: (section: number) => void
  onOpenFile: (file: File) => void
  onClose: () => void
}

const THEME_LABEL: Record<Theme, string> = { light: 'Light', sepia: 'Sepia', dark: 'Dark' }

/** Overlay shown when the middle of the page is tapped. */
export function Toolbar(props: Props) {
  // While scrubbing, show where the slider points without jumping on every tick.
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? props.section

  return (
    <>
      <header className="bar top">
        <button onClick={props.onToc} aria-label="Contents">☰</button>
        <div className="titles">
          <strong>{props.title}</strong>
          {props.chapter && <span>{chapterLabel(props.chapter)}</span>}
        </div>
        <button
          onClick={props.onBookmark}
          className={props.marked ? 'bookmark on' : 'bookmark'}
          aria-label={props.marked ? 'Remove bookmark' : 'Bookmark this page'}
          aria-pressed={props.marked}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 3h12v18l-6-4.5L6 21z" />
          </svg>
        </button>
        <label className="open-file">
          Open
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) props.onOpenFile(file)
            }}
          />
        </label>
      </header>

      <footer className="bar bottom">
        <div className="row">
          <button onClick={props.onSmaller} aria-label="Smaller text">A−</button>
          <button onClick={props.onBigger} aria-label="Bigger text" className="big-a">A+</button>
          <button onClick={props.onTheme}>{THEME_LABEL[props.theme]}</button>
          <button onClick={props.onClose}>Done</button>
        </div>
        <input
          type="range"
          className="seek"
          min={0}
          max={props.sectionCount - 1}
          value={shown}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => {
            if (scrub !== null) props.onSeek(scrub)
            setScrub(null)
          }}
          onKeyUp={() => {
            if (scrub !== null) props.onSeek(scrub)
            setScrub(null)
          }}
          aria-label="Jump through the book"
        />
        <div className="seek-label">
          Section {shown + 1} of {props.sectionCount}
        </div>
      </footer>
    </>
  )
}
