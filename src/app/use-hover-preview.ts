import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiCardReference } from '../types'
import type { HoverPreviewState } from './model'

interface UseHoverPreviewOptions {
  delayMs: number
}

interface HoverPreviewController {
  clearHoverPreview: () => void
  hoverPreview: HoverPreviewState | null
  scheduleHoverPreview: (name: string, card: ApiCardReference, anchor: HTMLElement) => void
}

export function useHoverPreview({ delayMs }: UseHoverPreviewOptions): HoverPreviewController {
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null)
  const hoverTimerRef = useRef<number>(0)

  const clearHoverPreview = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current)
    setHoverPreview(null)
  }, [])

  const scheduleHoverPreview = useCallback((name: string, card: ApiCardReference, anchor: HTMLElement) => {
    window.clearTimeout(hoverTimerRef.current)

    hoverTimerRef.current = window.setTimeout(() => {
      setHoverPreview({
        name,
        card,
        anchor,
      })
    }, delayMs)
  }, [delayMs])

  useEffect(
    () => () => {
      window.clearTimeout(hoverTimerRef.current)
    },
    [],
  )

  return {
    clearHoverPreview,
    hoverPreview,
    scheduleHoverPreview,
  }
}
