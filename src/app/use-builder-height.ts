import { useLayoutEffect, useState } from 'react'

import type { CalculatorMode } from './model'

interface UseBuilderHeightOptions {
  builderRef: React.RefObject<HTMLElement | null>
  extraDeckCount: number
  mainDeckCount: number
  mode: CalculatorMode
  sideDeckCount: number
}

export function useBuilderHeight({
  builderRef,
  extraDeckCount,
  mainDeckCount,
  mode,
  sideDeckCount,
}: UseBuilderHeightOptions): number | null {
  const [builderHeight, setBuilderHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = builderRef.current

    if (!element || mode !== 'deck') {
      setBuilderHeight(null)
      return
    }

    const updateHeight = () => {
      setBuilderHeight(Math.ceil(element.getBoundingClientRect().height))
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [builderRef, extraDeckCount, mainDeckCount, mode, sideDeckCount])

  return builderHeight
}
