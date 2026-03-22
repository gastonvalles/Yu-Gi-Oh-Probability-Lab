import { getCardLimitIndicator } from '../app/deck-format'
import { useAppSelector } from '../app/store-hooks'
import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

export type CardLimitBadgeSize = 'sm' | 'md' | 'lg'

interface CardLimitBadgeProps {
  card: ApiCardReference | ApiCardSearchResult | null
  size?: CardLimitBadgeSize
}

const BADGE_SIZE_CLASSNAME: Record<CardLimitBadgeSize, Record<'single' | 'double' | 'triple', string>> = {
  sm: {
    single: 'left-[-0.08rem] top-[-0.08rem] h-[1.08rem] w-[1.08rem]',
    double: 'left-[-0.08rem] top-[-0.08rem] h-[1.08rem] w-[1.42rem]',
    triple: 'left-[-0.08rem] top-[-0.08rem] h-[1.08rem] w-[1.72rem]',
  },
  md: {
    single: 'left-[-0.1rem] top-[-0.1rem] h-[1.42rem] w-[1.42rem]',
    double: 'left-[-0.1rem] top-[-0.1rem] h-[1.42rem] w-[1.84rem]',
    triple: 'left-[-0.1rem] top-[-0.1rem] h-[1.42rem] w-[2.2rem]',
  },
  lg: {
    single: 'left-[-0.12rem] top-[-0.12rem] h-[1.7rem] w-[1.7rem]',
    double: 'left-[-0.12rem] top-[-0.12rem] h-[1.7rem] w-[2.2rem]',
    triple: 'left-[-0.12rem] top-[-0.12rem] h-[1.7rem] w-[2.6rem]',
  },
}

const BADGE_TEXT_POSITION: Record<number, { x: number; y: number }> = {
  0: { x: 12, y: 12.25 },
  1: { x: 11.62, y: 12.74 },
  2: { x: 12.15, y: 12.25 },
}

export function CardLimitBadge({
  card,
  size = 'md',
}: CardLimitBadgeProps) {
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)

  if (!card) {
    return null
  }

  const indicator = getCardLimitIndicator(card, deckFormat)

  if (!indicator) {
    return null
  }

  const displayValue = String(indicator.value)
  const digitCount = displayValue.length
  const sizeKey = digitCount <= 1 ? 'single' : digitCount === 2 ? 'double' : 'triple'
  const viewBoxWidth = digitCount <= 1 ? 24 : digitCount === 2 ? 32 : 38
  const centerX = viewBoxWidth / 2
  const outerRadiusX = digitCount <= 1 ? 11.5 : digitCount === 2 ? 15.5 : 18.5
  const innerRadiusX = digitCount <= 1 ? 8.4 : digitCount === 2 ? 12.25 : 15.15
  const fontSize = digitCount <= 1 ? 16 : digitCount === 2 ? 13.5 : 11.25
  const letterSpacing = digitCount <= 1 ? '-0.06em' : digitCount === 2 ? '-0.04em' : '-0.02em'
  const textPosition =
    digitCount <= 1
      ? BADGE_TEXT_POSITION[indicator.value] ?? BADGE_TEXT_POSITION[0]
      : { x: centerX, y: 12.55 }

  return (
    <span
      className={[
        'pointer-events-none absolute z-10 block shrink-0 select-none',
        BADGE_SIZE_CLASSNAME[size][sizeKey],
      ].join(' ')}
      aria-hidden="true"
      data-card-limit={indicator.value}
    >
      <svg
        viewBox={`0 0 ${viewBoxWidth} 24`}
        className="block h-full w-full overflow-visible drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
      >
        <ellipse cx={centerX} cy="12" rx={outerRadiusX} ry="11.5" fill="#e30e0e" />
        <ellipse cx={centerX} cy="12" rx={innerRadiusX} ry="8.4" fill="#000000" />
        <text
          x={textPosition.x}
          y={textPosition.y}
          fill="#ffe15a"
          stroke="#000000"
          strokeWidth="1.2"
          paintOrder="stroke fill"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight="900"
          fontFamily='"Arial Black", Impact, sans-serif'
          letterSpacing={letterSpacing}
        >
          {displayValue}
        </text>
      </svg>
    </span>
  )
}
