import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Anchor, Book, Section } from '../book/types.ts'
import { captureAnchor, fitImage, measurePageCount, pageForAnchor, trackStyle, type PageBox } from './layout.ts'
import { usePageCounts } from './usePageCounts.ts'
import { useReaderGestures } from './useReaderGestures.ts'
import { loadPosition, MAX_FONT, MIN_FONT, savePosition, useBookmarks, useSettings, type Bookmark, type Theme } from './storage.ts'
import { ImageBlock } from './ImageBlock.tsx'
import { Toolbar } from './Toolbar.tsx'
import { Toc } from './Toc.tsx'

interface Props {
  book: Book
  doc: PDFDocumentProxy
  onOpenFile: (file: File) => void
}

const THEMES: Theme[] = ['light', 'sepia', 'dark']
const TURN = 'transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1)'
/** Readable line length on tablets/desktop; phones use the full width. */
const MAX_STAGE_WIDTH = 720

const clampFont = (n: number) => Math.min(MAX_FONT, Math.max(MIN_FONT, n))

/** A short excerpt starting at an anchor, to recognise a bookmark in the list. */
function snippetAt(book: Book, a: Anchor) {
  const block = book.sections[a.section]?.blocks[a.block]
  if (!block) return ''
  if (block.t === 'img') return 'Image'
  const text = block.text.slice(a.char).replace(/\s+/g, ' ').trim()
  return text.length > 90 ? text.slice(0, 90).replace(/\s\S*$/, '') + '…' : text
}

export function Reader({ book, doc, onOpenFile }: Props) {
  const [settings, setSettings] = useSettings()
  const [section, setSection] = useState(() => loadPosition(book).section)
  const [page, setPage] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [size, setSize] = useState({ W: 0, H: 0 })
  const [uiOpen, setUiOpen] = useState(false)
  const [drawer, setDrawer] = useState<null | 'contents' | 'bookmarks'>(null)
  const [bookmarks, setBookmarks] = useBookmarks(book)
  const [marked, setMarked] = useState(false)
  const [pinching, setPinching] = useState(false)
  const [fontsReady, setFontsReady] = useState(0)

  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // The reading position. Captured only when the user navigates; every relayout
  // (zoom, rotation, resize) restores the page from it, so the position never drifts.
  const anchorRef = useRef<Anchor>(loadPosition(book))
  const toLastPageRef = useRef(false)
  const slideInRef = useRef<-1 | 0 | 1>(0)
  // Latest values for event handlers, which outlive a single render.
  const live = useRef({ section, page, pageCount, W: size.W, fontSize: settings.fontSize })
  live.current = { ...live.current, section, W: size.W, fontSize: settings.fontSize }

  const { W, H } = size
  const pad = W < 600 ? 22 : 40
  const padTop = 28
  const padBottom = 40
  // Justified narrow lines open big word gaps when the browser can't hyphenate, so only justify roomy lines.
  const justify = (W - 2 * pad) / (settings.fontSize * 0.5) >= 45
  const box = useMemo<PageBox>(
    () => ({ W, H, pad, padTop, padBottom, fontSize: settings.fontSize, justify }),
    [W, H, pad, settings.fontSize, justify],
  )
  const pageCounts = usePageCounts(book, box, book.lang)

  const moveTrack = useCallback((p: number, dx: number, animate: boolean) => {
    const track = trackRef.current
    if (!track) return
    track.style.transition = animate ? TURN : 'none'
    track.style.transform = `translate3d(${-p * live.current.W + dx}px, 0, 0)`
  }, [])

  const remember = useCallback(
    (anchor: Anchor) => {
      anchorRef.current = anchor
      savePosition(book, anchor)
    },
    [book],
  )

  // Measure the stage. W is floored so columns land on whole pixels (fractional widths drift).
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(([entry]) => {
      const W = Math.floor(entry.contentRect.width)
      const H = Math.floor(entry.contentRect.height)
      setSize((s) => (s.W === W && s.H === H ? s : { W, H }))
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady((n) => n + 1))
  }, [])

  // Paginate: runs after the section is in the DOM and before the browser paints.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || !W || !H) return
    const count = measurePageCount(track, W)
    let p: number
    if (toLastPageRef.current) {
      toLastPageRef.current = false
      p = count - 1
      remember(captureAnchor(track, W, p, section))
    } else {
      p = Math.min(pageForAnchor(track, W, anchorRef.current), count - 1)
    }
    live.current.page = p
    live.current.pageCount = count
    setPage(p)
    setPageCount(count)

    const slide = slideInRef.current
    slideInRef.current = 0
    if (slide) {
      // New chapter slides in from the side it was swiped from.
      moveTrack(p, slide * W, false)
      track.getBoundingClientRect() // commit the start position before animating
      moveTrack(p, 0, true)
    } else {
      moveTrack(p, 0, false)
    }
  }, [section, W, H, settings.fontSize, fontsReady, moveTrack, remember])

  const goToPage = useCallback(
    (p: number, animate = true) => {
      const track = trackRef.current
      if (!track) return
      live.current.page = p
      setPage(p)
      moveTrack(p, 0, animate)
      remember(captureAnchor(track, live.current.W, p, live.current.section))
    },
    [moveTrack, remember],
  )

  const openSection = useCallback(
    (target: number, where: 'start' | 'end', slide: -1 | 0 | 1) => {
      const anchor = { section: target, block: 0, char: 0 }
      if (target === live.current.section) {
        // Same section: no re-render will happen, so navigate directly.
        const track = trackRef.current
        if (track) goToPage(where === 'end' ? live.current.pageCount - 1 : pageForAnchor(track, live.current.W, anchor), false)
        return
      }
      remember(anchor)
      toLastPageRef.current = where === 'end'
      slideInRef.current = slide
      live.current.section = target
      setSection(target)
    },
    [goToPage, remember],
  )

  /** Jump anywhere (contents, slider, bookmark), optionally restoring the text size saved with it. */
  const goToAnchor = useCallback(
    (anchor: Anchor, fontSize?: number) => {
      const fontChanges = fontSize !== undefined && clampFont(fontSize) !== live.current.fontSize
      if (anchor.section === live.current.section && !fontChanges) {
        // Nothing will re-render, so navigate directly.
        const track = trackRef.current
        if (track) goToPage(Math.min(pageForAnchor(track, live.current.W, anchor), live.current.pageCount - 1), false)
        return
      }
      // The pagination effect re-runs for the new section / font size and lands on this anchor.
      remember(anchor)
      if (fontChanges) setSettings((s) => ({ ...s, fontSize: clampFont(fontSize) }))
      if (anchor.section !== live.current.section) {
        live.current.section = anchor.section
        setSection(anchor.section)
      }
    },
    [goToPage, remember, setSettings],
  )

  const next = useCallback(() => {
    const { page, pageCount, section } = live.current
    if (page < pageCount - 1) goToPage(page + 1)
    else if (section < book.sections.length - 1) openSection(section + 1, 'start', 1)
    else moveTrack(page, 0, true)
  }, [book, goToPage, openSection, moveTrack])

  const prev = useCallback(() => {
    const { page, section } = live.current
    if (page > 0) goToPage(page - 1)
    else if (section > 0) openSection(section - 1, 'end', -1)
    else moveTrack(page, 0, true)
  }, [goToPage, openSection, moveTrack])

  const setFontSize = useCallback(
    (n: number) => setSettings((s) => (clampFont(n) === s.fontSize ? s : { ...s, fontSize: clampFont(n) })),
    [setSettings],
  )

  const bookmarksOnPage = useCallback(
    (list: Bookmark[]) => {
      const track = trackRef.current
      const { section, page, W } = live.current
      if (!track || !W) return []
      return list.filter((b) => b.anchor.section === section && pageForAnchor(track, W, b.anchor) === page)
    },
    [],
  )

  // Is the visible page bookmarked? Re-checked after every page change and relayout.
  useLayoutEffect(() => {
    setMarked(bookmarksOnPage(bookmarks).length > 0)
  }, [bookmarks, bookmarksOnPage, section, page, pageCount, W, H])

  const pageCountsRef = useRef<number[] | null>(null)
  pageCountsRef.current = pageCounts

  const toggleBookmark = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const here = bookmarksOnPage(bookmarks)
    if (here.length) {
      setBookmarks((list) => list.filter((b) => !here.includes(b)))
      return
    }
    const { section, page, W, fontSize } = live.current
    const anchor = captureAnchor(track, W, page, section)
    const counts = pageCountsRef.current
    const bookmark: Bookmark = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      anchor,
      fontSize,
      chapter: [...book.toc].reverse().find((t) => t.section <= section)?.title,
      page: counts ? counts.slice(0, section).reduce((a, n) => a + n, 0) + page + 1 : undefined,
      snippet: snippetAt(book, anchor),
      createdAt: Date.now(),
    }
    setBookmarks((list) => [...list, bookmark])
  }, [book, bookmarks, bookmarksOnPage, setBookmarks])

  useReaderGestures(stageRef, {
    onDrag: (dx) => {
      const { page, pageCount, section } = live.current
      const atStart = section === 0 && page === 0 && dx > 0
      const atEnd = section === book.sections.length - 1 && page === pageCount - 1 && dx < 0
      moveTrack(page, atStart || atEnd ? dx * 0.3 : dx, false)
    },
    onRelease: (dir) => (dir === -1 ? next() : dir === 1 ? prev() : moveTrack(live.current.page, 0, true)),
    onTap: (zone) => {
      if (zone === 'menu') return setUiOpen((o) => !o)
      setUiOpen(false)
      if (zone === 'next') next()
      else prev()
    },
    getFontSize: () => live.current.fontSize,
    onFontSize: setFontSize,
    onPinchActive: setPinching,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) next()
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) prev()
      else if (e.key === '+' || e.key === '=') setFontSize(live.current.fontSize + 1)
      else if (e.key === '-') setFontSize(live.current.fontSize - 1)
      else if (e.key === 'b') toggleBookmark()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, setFontSize, toggleBookmark])

  const current = book.sections[section]
  const anchor = anchorRef.current
  const atBookEnd = section === book.sections.length - 1 && page === pageCount - 1
  const read = current.charStart + (current.blockStarts[anchor.block] ?? 0) + anchor.char
  const percent = atBookEnd ? 100 : Math.floor((read / Math.max(1, book.totalChars)) * 100)
  const chapter = [...book.toc].reverse().find((t) => t.section <= section)
  // Whole-book page numbers. The open section uses its live count, the rest come from the background counter.
  const bookPage = pageCounts && {
    page: pageCounts.slice(0, section).reduce((a, n) => a + n, 0) + page + 1,
    total: pageCounts.reduce((a, n) => a + n, 0) - pageCounts[section] + pageCount,
  }

  return (
    <div className="reader" data-theme={settings.theme}>
      <div className="stage" ref={stageRef} style={{ maxWidth: MAX_STAGE_WIDTH }}>
        {W > 0 && (
          <div
            className={justify ? 'track justify' : 'track'}
            ref={trackRef}
            lang={book.lang}
            style={trackStyle(box)}
          >
            <SectionView key={section} section={current} doc={doc} box={box} />
          </div>
        )}
        {marked && <div className="ribbon" aria-label="Bookmarked page" />}
        <div className="status">
          <span>{bookPage && `Page ${bookPage.page} of ${bookPage.total}`}</span>
          <span>{percent}%</span>
        </div>
      </div>

      {pinching && <div className="zoom-badge">Aa {settings.fontSize}</div>}

      {uiOpen && (
        <Toolbar
          title={book.title}
          chapter={chapter?.title}
          section={section}
          sectionCount={book.sections.length}
          theme={settings.theme}
          onToc={() => setDrawer('contents')}
          marked={marked}
          onBookmark={toggleBookmark}
          onSmaller={() => setFontSize(settings.fontSize - 1)}
          onBigger={() => setFontSize(settings.fontSize + 1)}
          onTheme={() => setSettings((s) => ({ ...s, theme: THEMES[(THEMES.indexOf(s.theme) + 1) % THEMES.length] }))}
          onSeek={(s) => goToAnchor({ section: s, block: 0, char: 0 })}
          onOpenFile={onOpenFile}
          onClose={() => setUiOpen(false)}
        />
      )}

      {drawer && (
        <Toc
          tab={drawer}
          onTab={setDrawer}
          toc={book.toc}
          current={chapter?.section}
          bookmarks={bookmarks}
          onPick={(s) => {
            setDrawer(null)
            setUiOpen(false)
            goToAnchor({ section: s, block: 0, char: 0 })
          }}
          onPickBookmark={(b) => {
            setDrawer(null)
            setUiOpen(false)
            goToAnchor(b.anchor, b.fontSize)
          }}
          onDeleteBookmark={(id) => setBookmarks((list) => list.filter((b) => b.id !== id))}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}

interface SectionViewProps {
  section: Section
  doc: PDFDocumentProxy
  box: PageBox
}

/** The only part of the book in the DOM: one section's blocks. Memoized so page turns don't re-render text. */
// Keep this markup in sync with renderSection() in usePageCounts.ts, which counts pages from it.
const SectionView = memo(function SectionView({ section, doc, box }: SectionViewProps) {
  return section.blocks.map((b, i) => {
    switch (b.t) {
      case 'h':
        return (
          <h2 key={i} data-b={i}>
            {b.text}
          </h2>
        )
      case 'c':
        return (
          <p key={i} data-b={i} className="center">
            {b.text}
          </p>
        )
      case 'p':
        return (
          <p key={i} data-b={i}>
            {b.text}
          </p>
        )
      case 'img': {
        const { width, height } = fitImage(b.w, b.h, box)
        return <ImageBlock key={i} index={i} doc={doc} page={b.page} width={width} height={height} />
      }
    }
  })
})
