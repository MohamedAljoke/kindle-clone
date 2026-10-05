// The legacy build runs on older mobile browsers; the default build needs very recent JS features.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { get, set } from 'idb-keyval'
import { parsePdf, PARSER_VERSION } from './parsePdf.ts'
import type { Book } from './types.ts'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type BookSource = { kind: 'url'; url: string; name: string } | { kind: 'file'; file: File }

export interface LoadedBook {
  book: Book
  /** Kept open only so image pages can be rendered on demand. */
  doc: pdfjs.PDFDocumentProxy
}

const LAST_FILE_KEY = 'kc:last-file'

// IndexedDB can be unavailable (private mode, blocked storage); the reader must still work.
const cacheGet = async <T>(key: string) => {
  try {
    return await get<T>(key)
  } catch {
    return undefined
  }
}
const cacheSet = async (key: string, value: unknown) => {
  try {
    await set(key, value)
  } catch {
    /* cache is best-effort */
  }
}

/** Thrown when the optional bundled sample book isn't deployed (it's never in the public repo). */
export class MissingSampleError extends Error {}

export const getLastFile = () => cacheGet<File>(LAST_FILE_KEY)
export const rememberFile = (file: File) => cacheSet(LAST_FILE_KEY, file)

export async function loadBook(source: BookSource, onProgress: (fraction: number) => void): Promise<LoadedBook> {
  let bytes: ArrayBuffer
  let name: string
  if (source.kind === 'url') {
    const res = await fetch(source.url)
    bytes = res.ok ? await res.arrayBuffer() : new ArrayBuffer(0)
    // Dev servers answer missing files with index.html, so check for the PDF signature too.
    if (new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))) !== '%PDF-') {
      throw new MissingSampleError(`No sample book at ${source.url}`)
    }
    name = source.name
  } else {
    bytes = await source.file.arrayBuffer()
    name = source.file.name
  }

  const id = `${name}:${bytes.byteLength}:v${PARSER_VERSION}`
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise

  const cached = await cacheGet<Book>(`kc:book:${id}`)
  if (cached) return { book: cached, doc }

  const book = await parsePdf(doc, id, name.replace(/\.pdf$/i, ''), {
    imageOps: [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject],
    onProgress: (done, total) => onProgress(done / total),
  })
  if (!book.sections.length) throw new Error('No readable content was found in this PDF.')
  await cacheSet(`kc:book:${id}`, book)
  return { book, doc }
}
