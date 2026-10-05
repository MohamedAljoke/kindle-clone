import { useCallback, useEffect, useState } from 'react'
import { getLastFile, loadBook, MissingSampleError, rememberFile, type BookSource, type LoadedBook } from './book/loadBook.ts'
import { Reader } from './reader/Reader.tsx'

// Optional dev-only sample: put a PDF at public/sample.pdf. PDFs are git-ignored, so production never has one.
const SAMPLE: BookSource = { kind: 'url', url: `${import.meta.env.BASE_URL}sample.pdf`, name: 'sample.pdf' }

type State =
  | { status: 'welcome' }
  | { status: 'loading'; progress: number }
  | { status: 'error'; message: string }
  | { status: 'ready'; loaded: LoadedBook }

function PickPdf({ onPick, label }: { onPick: (file: File) => void; label: string }) {
  return (
    <label className="pick-pdf">
      {label}
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
        }}
      />
    </label>
  )
}

export function App() {
  const [state, setState] = useState<State>({ status: 'loading', progress: 0 })
  const [source, setSource] = useState<BookSource | null>(null)

  // Reopen the last book the user picked, otherwise the bundled sample.
  useEffect(() => {
    getLastFile().then((file) => {
      if (file) setSource({ kind: 'file', file })
      else if (import.meta.env.DEV) setSource(SAMPLE)
      else setState({ status: 'welcome' })
    })
  }, [])

  useEffect(() => {
    if (!source) return
    let cancelled = false
    let loaded: LoadedBook | null = null
    setState({ status: 'loading', progress: 0 })
    loadBook(source, (progress) => !cancelled && setState({ status: 'loading', progress }))
      .then((result) => {
        loaded = result
        if (cancelled) result.doc.loadingTask.destroy()
        else setState({ status: 'ready', loaded: result })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof MissingSampleError) setState({ status: 'welcome' })
        else setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
      loaded?.doc.loadingTask.destroy()
    }
  }, [source])

  const openFile = useCallback((file: File) => {
    rememberFile(file)
    setSource({ kind: 'file', file })
  }, [])

  if (state.status === 'ready') {
    const { book, doc } = state.loaded
    return <Reader key={book.id} book={book} doc={doc} onOpenFile={openFile} />
  }

  return (
    <div className="splash">
      {state.status === 'welcome' ? (
        <>
          <h1>Kindle Clone</h1>
          <p>Open a PDF book to read it with reflowing text, swipe page turns and pinch-to-zoom.</p>
          <PickPdf onPick={openFile} label="Open a PDF" />
          <small>The file stays on your device; nothing is uploaded.</small>
        </>
      ) : state.status === 'loading' ? (
        <>
          <p>{state.progress > 0 ? 'Preparing the book for reading…' : 'Opening…'}</p>
          <div className="progress">
            <div style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
          <small>This only happens the first time a book is opened.</small>
        </>
      ) : (
        <>
          <p>{state.message}</p>
          <PickPdf onPick={openFile} label="Open another PDF" />
        </>
      )}
    </div>
  )
}
