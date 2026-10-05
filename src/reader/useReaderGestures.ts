import { useEffect, useRef, type RefObject } from 'react'
import { createUseGesture, dragAction, pinchAction } from '@use-gesture/react'
import { MAX_FONT, MIN_FONT } from './storage.ts'

const useGesture = createUseGesture([dragAction, pinchAction])
/** Pinch scale 1 corresponds to this font size. */
const BASE = 16

export interface GestureHandlers {
  /** Live finger offset while dragging. */
  onDrag: (dx: number) => void
  /** Finger released: -1 next page, +1 previous page, 0 snap back. */
  onRelease: (direction: -1 | 0 | 1) => void
  onTap: (zone: 'prev' | 'menu' | 'next') => void
  getFontSize: () => number
  onFontSize: (size: number) => void
  onPinchActive: (active: boolean) => void
}

/** Swipe / tap / pinch on the page area. Pinch changes the font size, never the page scale. */
export function useReaderGestures(target: RefObject<HTMLElement | null>, handlers: GestureHandlers) {
  // Handlers change every render; the gesture config should not.
  const h = useRef(handlers)
  h.current = handlers

  useGesture(
    {
      onDrag: ({ tap, active, movement: [mx], velocity: [vx], xy: [x], pinching, cancel, event }) => {
        if (pinching) return cancel()
        const el = target.current
        if (!el) return
        if (tap) {
          // Taps on toolbar buttons etc. bubble here too; only handle taps on the page itself.
          if ((event.target as HTMLElement).closest('button, a, input')) return
          const rect = el.getBoundingClientRect()
          const rel = (x - rect.left) / rect.width
          h.current.onTap(rel < 0.3 ? 'prev' : rel > 0.7 ? 'next' : 'menu')
          return
        }
        if (active) return h.current.onDrag(mx)
        const width = el.clientWidth
        const flung = vx > 0.3 && Math.abs(mx) > 20
        if (Math.abs(mx) > width * 0.2 || flung) h.current.onRelease(mx < 0 ? -1 : 1)
        else h.current.onRelease(0)
      },
      onPinchStart: () => h.current.onPinchActive(true),
      onPinch: ({ offset: [scale], event }) => {
        if (event.cancelable) event.preventDefault() // ctrl+wheel would otherwise zoom the whole browser page
        h.current.onFontSize(Math.round(scale * BASE))
      },
      onPinchEnd: () => h.current.onPinchActive(false),
    },
    {
      target,
      eventOptions: { passive: false },
      drag: { axis: 'x', filterTaps: true },
      pinch: {
        // Each pinch starts from the current font size, expressed as a scale of BASE.
        from: () => [h.current.getFontSize() / BASE, 0],
        scaleBounds: { min: MIN_FONT / BASE, max: MAX_FONT / BASE },
        rubberband: false,
      },
    },
  )

  // Safari fires its own gesture events for pinch; stop them from zooming the page.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.addEventListener('gesturechange', stop)
    return () => {
      document.removeEventListener('gesturestart', stop)
      document.removeEventListener('gesturechange', stop)
    }
  }, [])
}

