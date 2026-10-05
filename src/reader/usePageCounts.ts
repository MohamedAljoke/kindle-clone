import { useEffect, useState } from 'react'
import type { Book, Section } from '../book/types.ts'
import { fitImage, measurePageCount, trackStyle, type PageBox } from './layout.ts'

/** Wait this long after the last font/size change (e.g. during a pinch) before recounting. */
const DEBOUNCE_MS = 250
/** Time budget per animation frame, so counting never makes page turns stutter. */
const FRAME_BUDGET_MS = 8

/** Fills `host` with a section's blocks, mirroring SectionView's markup so page breaks match. */
function renderSection(host: HTMLElement, section: Section, box: PageBox) {
  host.replaceChildren(
    ...section.blocks.map((b, i) => {
      let el: HTMLElement
      if (b.t === 'img') {
        const { width, height } = fitImage(b.w, b.h, box)
        el = document.createElement('div')
        el.className = 'img-block'
        el.style.width = `${width}px`
        el.style.height = `${height}px`
      } else {
        el = document.createElement(b.t === 'h' ? 'h2' : 'p')
        if (b.t === 'c') el.className = 'center'
        el.textContent = b.text
      }
      el.dataset.b = String(i)
      return el
    }),
  )
}

/**
 * Pages per section for the whole book at the current layout, so the reader can show
 * "page 120 of 741" like a Kindle. Sections are laid out one at a time in a hidden
 * track and discarded, so the full book is never in the DOM. Null while counting.
 */
export function usePageCounts(book: Book, box: PageBox, lang: string): number[] | null {
  const [counts, setCounts] = useState<number[] | null>(null)
  const { W, H, pad, padTop, padBottom, fontSize, justify } = box

  useEffect(() => {
    if (!W || !H) return
    setCounts(null)
    const layout: PageBox = { W, H, pad, padTop, padBottom, fontSize, justify }
    let frame = 0
    let host: HTMLDivElement | null = null

    const timer = setTimeout(() => {
      host = document.createElement('div')
      host.className = justify ? 'track justify' : 'track'
      host.lang = lang
      host.setAttribute('aria-hidden', 'true')
      Object.assign(host.style, trackStyle(layout), {
        position: 'fixed',
        top: '0',
        left: '-100000px',
        visibility: 'hidden',
        pointerEvents: 'none',
        contain: 'strict',
      })
      document.body.appendChild(host)

      const result: number[] = []
      const step = () => {
        const started = performance.now()
        while (result.length < book.sections.length && performance.now() - started < FRAME_BUDGET_MS) {
          renderSection(host!, book.sections[result.length], layout)
          result.push(measurePageCount(host!, W))
        }
        if (result.length < book.sections.length) {
          frame = requestAnimationFrame(step)
        } else {
          host!.remove()
          host = null
          setCounts(result)
        }
      }
      frame = requestAnimationFrame(step)
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      host?.remove()
    }
  }, [book, lang, W, H, pad, padTop, padBottom, fontSize, justify])

  return counts
}
