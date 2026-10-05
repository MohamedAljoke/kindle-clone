import { useEffect, useState } from 'react'
import type { Anchor, Book } from '../book/types.ts'

export type Theme = 'light' | 'sepia' | 'dark'
export interface Settings {
  fontSize: number
  theme: Theme
}

export const MIN_FONT = 12
export const MAX_FONT = 40
const DEFAULT_SETTINGS: Settings = { fontSize: 19, theme: 'light' }

// localStorage can throw (private mode, blocked storage) — reading must never break the reader.
const read = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* best-effort */
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...read<Settings>('kc:settings') }))
  useEffect(() => write('kc:settings', settings), [settings])
  return [settings, setSettings] as const
}

export function loadPosition(book: Book): Anchor {
  const a = read<Anchor>(`kc:pos:${book.id}`)
  const section = a && book.sections[a.section]
  if (!a || !section || !(a.block >= 0 && a.block < section.blocks.length)) return { section: 0, block: 0, char: 0 }
  return a
}

export const savePosition = (book: Book, anchor: Anchor) => write(`kc:pos:${book.id}`, anchor)

export interface Bookmark {
  id: string
  anchor: Anchor
  /** Text size when the bookmark was made; jumping to it restores this zoom too. */
  fontSize: number
  chapter?: string
  /** Book page at the time it was saved (only meaningful at the saved font size). */
  page?: number
  snippet: string
  createdAt: number
}

const byPosition = (a: Bookmark, b: Bookmark) =>
  a.anchor.section - b.anchor.section || a.anchor.block - b.anchor.block || a.anchor.char - b.anchor.char

export function useBookmarks(book: Book) {
  const key = `kc:bm:${book.id}`
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() =>
    (read<Bookmark[]>(key) ?? []).filter((b) => book.sections[b.anchor.section]).sort(byPosition),
  )
  useEffect(() => write(key, bookmarks), [key, bookmarks])
  const update = (fn: (list: Bookmark[]) => Bookmark[]) => setBookmarks((list) => fn(list).sort(byPosition))
  return [bookmarks, update] as const
}
