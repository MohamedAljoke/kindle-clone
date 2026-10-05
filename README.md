# Kindle Clone

A mobile-first web reader that turns PDF books into reflowable, Kindle-style pages.

**Live demo:** https://mohamedaljoke.github.io/kindle-clone/ (open any text-based PDF from your device; nothing is uploaded)

## Features

- **Reflowing text**: pinch (or A− / A+) changes the font size and lines re-wrap to the screen, so you never pan around a zoomed page.
- **Page turns**: swipe, tap the left/right edge, or use the arrow keys / space.
- **Whole-book page numbers** and reading percentage.
- **Remembers your place**: position, text size and theme are restored when you come back.
- **Bookmarks**: save pages and jump back to them with the text size you had.
- **Light / sepia / dark** themes, contents drawer and a slider to jump through the book.
- **Handles big books**: only the current chapter is in the DOM; parsed books are cached in IndexedDB.

## How it works

1. `src/book/parsePdf.ts` extracts text with [pdf.js](https://mozilla.github.io/pdf.js/) and rebuilds paragraphs, headings, drop caps and picture pages from the text positions.
2. The book is split into sections (one per chapter, capped in size). Only the open section is rendered, using CSS multi-column layout so each column is exactly one screen wide.
3. Your position is stored as a text anchor (block + character), not a page number, so changing the font size or rotating the phone keeps the same sentence on screen.

## Development

```bash
npm install
npm run dev        # put a PDF at public/sample.pdf to have it open automatically
npm run build
npm run inspect -- path/to/book.pdf   # print what the parser extracts
```

PDFs are git-ignored on purpose. Books are usually copyrighted, so keep them local.

## Limitations

- Paragraph detection is heuristic and tuned on typical novel layouts; complex layouts (tables, multi-column papers) won't reflow well.
- Scanned PDFs (no text layer) are shown as page images.
- Bold/italic styling isn't preserved yet.
