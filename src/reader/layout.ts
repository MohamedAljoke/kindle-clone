import type { Anchor } from '../book/types.ts'

/**
 * DOM measurement helpers for the multi-column paginator.
 *
 * The track lays a section out as columns that are exactly one viewport (W)
 * apart, so "which page is X on" is just floor(x / W), where x is measured
 * from the track's own left edge. Both the track and its children move with
 * the same transform, so these measurements are valid mid-animation too.
 */

const blocksOf = (track: HTMLElement) => Array.from(track.querySelectorAll<HTMLElement>('[data-b]'))

const firstRect = (el: Element) => el.getClientRects()[0] ?? el.getBoundingClientRect()
const lastRect = (el: Element) => {
  const rects = el.getClientRects()
  return rects[rects.length - 1] ?? el.getBoundingClientRect()
}

export function measurePageCount(track: HTMLElement, W: number) {
  const blocks = blocksOf(track)
  if (!blocks.length || !W) return 1
  const end = lastRect(blocks[blocks.length - 1]).right - 1 - track.getBoundingClientRect().left
  return Math.max(1, Math.floor(end / W) + 1)
}

function charLeft(text: Text, offset: number) {
  const range = document.createRange()
  range.setStart(text, offset)
  range.setEnd(text, Math.min(offset + 1, text.length))
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  return rect.left
}

/** First block (and character inside it) visible on `page`. */
export function captureAnchor(track: HTMLElement, W: number, page: number, section: number): Anchor {
  const blocks = blocksOf(track)
  const origin = track.getBoundingClientRect().left
  const pageStart = page * W

  // Blocks are laid out in order, so their end positions only increase: binary search.
  let lo = 0
  let hi = blocks.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lastRect(blocks[mid]).right - origin > pageStart + 1) hi = mid
    else lo = mid + 1
  }
  const el = blocks[lo]
  if (!el) return { section, block: 0, char: 0 }
  const block = Number(el.dataset.b)

  // The block started on an earlier page: find the first character that lands on this one.
  const text = el.firstChild
  if (firstRect(el).left - origin >= pageStart || !(text instanceof Text) || !text.length) {
    return { section, block, char: 0 }
  }
  let a = 0
  let b = text.length - 1
  while (a < b) {
    const mid = (a + b) >> 1
    if (charLeft(text, mid) - origin >= pageStart) b = mid
    else a = mid + 1
  }
  return { section, block, char: a }
}

/** Page on which an anchor currently sits (after any relayout). */
export function pageForAnchor(track: HTMLElement, W: number, anchor: Anchor) {
  const el = track.querySelector<HTMLElement>(`[data-b="${anchor.block}"]`)
  if (!el || !W) return 0
  const origin = track.getBoundingClientRect().left
  const text = el.firstChild
  const left =
    anchor.char > 0 && text instanceof Text && anchor.char < text.length
      ? charLeft(text, anchor.char)
      : firstRect(el).left
  return Math.max(0, Math.floor((left - origin + 1) / W))
}

/** Everything that decides where page breaks fall. */
export interface PageBox {
  W: number
  H: number
  pad: number
  padTop: number
  padBottom: number
  fontSize: number
  justify: boolean
}

/** Inline styles for a paginating track; shared by the visible reader and the background page counter. */
export const trackStyle = (b: PageBox) => ({
  width: `${b.W}px`,
  height: `${b.H}px`,
  padding: `${b.padTop}px ${b.pad}px ${b.padBottom}px`,
  columnWidth: `${b.W - 2 * b.pad}px`,
  columnGap: `${2 * b.pad}px`,
  fontSize: `${b.fontSize}px`,
})

/** Size of a full-page image scaled to fit one reader page. */
export function fitImage(w: number, h: number, b: PageBox) {
  const scale = Math.min((b.W - 2 * b.pad) / w, (b.H - b.padTop - b.padBottom) / h)
  return { width: Math.floor(w * scale), height: Math.floor(h * scale) }
}
