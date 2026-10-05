import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface Props {
  doc: PDFDocumentProxy
  page: number
  /** Box already sized to fit one reader page, so layout never shifts when the image arrives. */
  width: number
  height: number
  index: number
}

/** Renders a PDF page as a picture, only while its section is mounted. */
export function ImageBlock({ doc, page, width, height, index }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null

    ;(async () => {
      const pdfPage = await doc.getPage(page)
      if (cancelled) return
      const base = pdfPage.getViewport({ scale: 1 })
      // Render at screen resolution for the box, capped so huge screens don't allocate giant canvases.
      const scale = Math.min((width * (window.devicePixelRatio || 1)) / base.width, 3)
      const viewport = pdfPage.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      task = pdfPage.render({ canvas, viewport })
      await task.promise
      if (cancelled) return
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      canvas.width = canvas.height = 0
      if (cancelled || !blob) return
      url = URL.createObjectURL(blob)
      setSrc(url)
    })().catch(() => {
      /* a failed render just leaves the placeholder box */
    })

    return () => {
      cancelled = true
      task?.cancel()
      if (url) URL.revokeObjectURL(url)
      setSrc(null)
    }
  }, [doc, page, width])

  return (
    <div className="img-block" data-b={index} style={{ width, height }}>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  )
}
