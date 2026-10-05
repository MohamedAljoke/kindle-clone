import type { PDFDocumentProxy } from 'pdfjs-dist'
import { blockLength, type Block, type Book, type Section, type TocEntry } from './types.ts'

/**
 * Turns a fixed-layout PDF into reflowable blocks (paragraphs, headings,
 * centered lines, full-page images) grouped into sections. Only sections are
 * ever mounted by the reader, so huge books never sit in the DOM at once.
 *
 * Works in the browser and in Node: the caller opens the document and passes
 * the pdf.js OPS codes it should treat as images.
 */

export const PARSER_VERSION = 1

/** Pages with less text than this are checked for images and, if they have one, shown as a picture. */
const IMAGE_PAGE_MAX_CHARS = 300
/** Long chapters are split so a single section never holds more than this many characters. */
const MAX_SECTION_CHARS = 40_000

interface RawItem {
  str: string
  x: number
  y: number
  w: number
  h: number
}

interface Line {
  text: string
  x: number
  right: number
  y: number
  h: number
  pageWidth: number
}

type PageData =
  | { kind: 'text'; lines: Line[] }
  | { kind: 'image'; page: number; w: number; h: number }

export interface ParseOptions {
  imageOps: number[]
  onProgress?: (done: number, total: number) => void
}

const mode = (values: number[], fallback: number) => {
  const counts = new Map<number, number>()
  let best = fallback
  let bestCount = 0
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

const isSpace = (s: string) => /^\s*$/.test(s)

function buildLines(items: RawItem[], pageWidth: number): Line[] {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x)
  const groups: RawItem[][] = []
  for (const it of sorted) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(last[0].y - it.y) <= 3) last.push(it)
    else groups.push([it])
  }

  const lines: Line[] = []
  for (const group of groups) {
    group.sort((a, b) => a.x - b.x)
    const visible = group.filter((i) => !isSpace(i.str))
    if (!visible.length) continue

    // A drop cap is a single oversized letter at the start of a line: "O" + "s tambores…"
    const rest = visible.slice(1)
    const restH = rest.length ? Math.max(...rest.map((i) => i.h)) : 0
    const dropCap = rest.length > 0 && visible[0].str.trim().length === 1 && visible[0].h >= restH * 1.6

    let text = ''
    let prevEnd = -Infinity
    for (const it of group) {
      const gap = it.x - prevEnd
      const joinsDropCap = dropCap && prevEnd !== -Infinity && text.trim().length === 1
      if (text && !joinsDropCap && gap > it.h * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' '
      text += it.str
      prevEnd = Math.max(prevEnd, it.x + it.w)
    }
    text = text.replace(/\s+/g, ' ').trim()

    const first = dropCap ? rest[0] : visible[0]
    lines.push({
      text,
      x: dropCap ? visible[0].x : first.x,
      right: Math.max(...visible.map((i) => i.x + i.w)),
      y: group[0].y,
      h: dropCap ? restH : Math.max(...visible.map((i) => i.h)),
      pageWidth,
    })
  }
  return lines
}

async function readPages(doc: PDFDocumentProxy, opts: ParseOptions): Promise<PageData[]> {
  const pages: PageData[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const [, , pageWidth, pageHeight] = page.view
    const content = await page.getTextContent()
    const items: RawItem[] = []
    let chars = 0
    for (const raw of content.items) {
      if (!('str' in raw)) continue
      const h = raw.height || Math.abs(raw.transform[3])
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width, h })
      chars += raw.str.trim().length
    }

    let isImagePage = false
    if (chars < IMAGE_PAGE_MAX_CHARS) {
      const ops = await page.getOperatorList()
      isImagePage = ops.fnArray.some((fn) => opts.imageOps.includes(fn))
    }

    pages.push(
      isImagePage
        ? { kind: 'image', page: p, w: pageWidth, h: pageHeight }
        : { kind: 'text', lines: buildLines(items, pageWidth) },
    )
    page.cleanup()
    opts.onProgress?.(p, doc.numPages)
  }
  return pages
}

export async function parsePdf(
  doc: PDFDocumentProxy,
  id: string,
  fallbackTitle: string,
  opts: ParseOptions,
): Promise<Book> {
  const pages = await readPages(doc, opts)
  const textPages = pages.filter((p) => p.kind === 'text')
  const allLines = textPages.flatMap((p) => p.lines)

  // Typical layout of the book, used to tell body text from headings and indents.
  const bodySize = mode(allLines.map((l) => Math.round(l.h)), 12)
  const bodyLines = allLines.filter((l) => Math.abs(l.h - bodySize) < 1.5)
  const margin = mode(bodyLines.map((l) => Math.round(l.x)), 72)
  const rightEdge = mode(bodyLines.map((l) => Math.round(l.right)), 540)
  const pitches: number[] = []
  for (const p of textPages)
    for (let i = 1; i < p.lines.length; i++) pitches.push(Math.round(p.lines[i - 1].y - p.lines[i].y))
  const pitch = mode(pitches.filter((v) => v > 0), bodySize * 1.5)
  // In justified text a full line always reaches the right edge, so a short line closes its paragraph.
  const endsShort = (l: Line) => l.right < rightEdge - bodySize * 1.5
  const justified = bodyLines.filter((l) => !endsShort(l)).length > bodyLines.length * 0.5

  const blocks: Block[] = []
  // Index into `blocks` where each heading run starts; these become section breaks.
  const sectionStarts = new Set<number>([0])
  let open: { text: string } | null = null // paragraph still accepting lines
  let prev: Line | null = null
  let prevWasHeading = false

  for (const page of pages) {
    if (page.kind === 'image') {
      blocks.push({ t: 'img', page: page.page, w: page.w, h: page.h })
      open = null
      prev = null
      prevWasHeading = false
      continue
    }

    page.lines.forEach((line, i) => {
      const samePagePrev = i > 0 ? page.lines[i - 1] : null

      if (line.h >= bodySize * 1.4) {
        const last = blocks[blocks.length - 1]
        if (prevWasHeading && last?.t === 'h' && samePagePrev && samePagePrev.y - line.y < pitch * 4) {
          last.text += '\n' + line.text
        } else {
          sectionStarts.add(blocks.length)
          blocks.push({ t: 'h', text: line.text })
        }
        open = null
        prev = line
        prevWasHeading = true
        return
      }
      prevWasHeading = false

      const leftGap = line.x - margin
      const rightGap = line.pageWidth - margin - line.right
      if (leftGap > 30 && Math.abs(leftGap - rightGap) < 12) {
        blocks.push({ t: 'c', text: line.text })
        open = null
        prev = line
        return
      }

      const indented = leftGap > 8
      const prevEndedShort = prev ? endsShort(prev) : true
      const bigGap = samePagePrev ? samePagePrev.y - line.y > pitch * 1.6 : false
      const startsParagraph =
        !open ||
        bigGap ||
        (justified && prevEndedShort) ||
        (indented && (!prev || prev.x - margin <= 8 || prevEndedShort))

      if (startsParagraph) {
        open = { text: line.text }
        blocks.push({ t: 'p', text: line.text })
      } else {
        const para = blocks[blocks.length - 1] as { text: string }
        para.text += (/-$/.test(para.text) ? '' : ' ') + line.text
      }
      prev = line
    })
  }

  // Group blocks into sections: one per heading, with long chapters split at paragraph boundaries.
  const sections: Section[] = []
  const toc: TocEntry[] = []
  let current: Block[] = []
  let currentChars = 0
  const pushSection = () => {
    if (current.length) sections.push({ blocks: current, charStart: 0, blockStarts: [] })
    current = []
    currentChars = 0
  }
  blocks.forEach((block, i) => {
    if ((sectionStarts.has(i) || currentChars >= MAX_SECTION_CHARS) && current.length) pushSection()
    if (block.t === 'h' && sectionStarts.has(i)) toc.push({ title: block.text.replace(/\n/g, ' · '), section: sections.length })
    current.push(block)
    currentChars += blockLength(block)
  })
  pushSection()

  let total = 0
  for (const s of sections) {
    s.charStart = total
    let inSection = 0
    for (const b of s.blocks) {
      s.blockStarts.push(inSection)
      inSection += blockLength(b)
    }
    total += inSection
  }

  const meta = await doc.getMetadata().catch(() => null)
  const info = (meta?.info ?? {}) as { Title?: string; Language?: string }

  return {
    id,
    title: info.Title?.trim() || fallbackTitle,
    lang: info.Language?.trim() || 'pt',
    totalChars: total,
    sections,
    toc,
  }
}
