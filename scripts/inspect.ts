// Runs the browser parser in Node against a PDF and prints what the reader will get.
// Usage: npm run inspect -- [path/to/book.pdf]
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parsePdf } from '../src/book/parsePdf.ts'

const file = process.argv[2] ?? 'public/sample.pdf'
const data = new Uint8Array(await readFile(file))
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise
const started = Date.now()
const book = await parsePdf(doc as never, 'inspect', basename(file, '.pdf'), {
  imageOps: [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject],
})

console.log(`parsed in ${Date.now() - started}ms`)
console.log(`title=${book.title} lang=${book.lang} chars=${book.totalChars} sections=${book.sections.length}`)
console.log('largest section chars:', Math.max(...book.sections.map((s, i) => (book.sections[i + 1]?.charStart ?? book.totalChars) - s.charStart)))
console.log('toc:', book.toc.slice(0, 12).map((t) => `${t.section}:${t.title}`).join(' | '), '…')
const show = (n: number, count = 8) => {
  console.log(`\n--- section ${n} ---`)
  for (const b of book.sections[n].blocks.slice(0, count))
    console.log(b.t === 'img' ? `[img p${b.page}]` : `[${b.t}] ${b.text.slice(0, 160)}${b.text.length > 160 ? '…' : ''}`)
}
show(0, 30)
for (const t of book.toc.slice(1, 4)) show(t.section, 6)
