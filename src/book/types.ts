export type TextBlock = { t: 'p' | 'h' | 'c'; text: string }
export type ImageBlock = { t: 'img'; page: number; w: number; h: number }
export type Block = TextBlock | ImageBlock

export interface Section {
  blocks: Block[]
  /** Character offset of this section's first block within the whole book. */
  charStart: number
  /** Character offset of each block within this section (same length as blocks). */
  blockStarts: number[]
}

export interface TocEntry {
  title: string
  section: number
}

export interface Book {
  id: string
  title: string
  lang: string
  totalChars: number
  sections: Section[]
  toc: TocEntry[]
}

/** A reading position that survives relayout (font size, rotation, resize). */
export interface Anchor {
  section: number
  block: number
  char: number
}

export const blockLength = (b: Block) => (b.t === 'img' ? 1 : b.text.length)
