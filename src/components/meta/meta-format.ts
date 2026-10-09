import { createRoleGroupKey, getDeckGroupTheme } from '../../app/deck-groups'
import { TIER_FLOORS, type HandtrapStat, type MetaTier, type MetaTrend } from '../../app/meta-handtraps'
import { formatInteger } from '../../app/utils'
import { cx } from '../ui/cx'
import { filterChip } from '../ui/surfaces'

export const HANDTRAP_RGB = getDeckGroupTheme(createRoleGroupKey('handtrap')).rgb
export const LINK_CHIP = cx(filterChip, 'h-8 gap-1')

export const TREND_LOOK: Record<MetaTrend, { tone: 'success' | 'danger' | 'neutral'; label: string }> = {
  up: { tone: 'success', label: 'Sube' },
  down: { tone: 'danger', label: 'Baja' },
  flat: { tone: 'neutral', label: 'Estable' },
}

const TIER_LABEL: Record<MetaTier, string> = { S: 'TIER S', A: 'TIER A', B: 'TIER B', C: 'MEH', D: '😭' }
// Los colores clásicos de las tier lists: así la reconoce cualquiera.
const TIER_COLOR: Record<MetaTier, string> = { S: '#ff7f7f', A: '#ffbf7f', B: '#ffdf7f', C: '#ffff7f', D: '#bfff7f' }

export const TIER_ORDER: readonly MetaTier[] = ['S', 'A', 'B', 'C', 'D']

export function tierLabel(tier: MetaTier): string {
  return TIER_LABEL[tier]
}

export function tierColor(tier: MetaTier): string {
  return TIER_COLOR[tier]
}

export function tierHint(tier: MetaTier): string {
  const floor = TIER_FLOORS.find(([key]) => key === tier)?.[1]
  return floor === undefined ? `Menos del ${percent(TIER_FLOORS.at(-1)?.[1] ?? 0)} de los decks` : `Al menos el ${percent(floor)} de los decks`
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const AVERAGE_FORMAT = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function percent(value: number): string {
  return `${formatInteger(Math.round(value * 100))}%`
}

export function formatMetaDate(date: string): string {
  return DATE_FORMAT.format(new Date(date)).replace('.', '')
}

/** "72% ×2,8": en qué parte de los decks que la juegan va en esa zona, y con cuántas copias. */
export function usageText(decks: number, copies: number, total: number): string {
  return decks === 0 ? '0%' : `${percent(decks / total)} ×${AVERAGE_FORMAT.format(copies / decks)}`
}

export function trendText(stat: HandtrapStat): string {
  if (stat.trend === 'flat') {
    return 'Estable'
  }

  return `${TREND_LOOK[stat.trend].label} a ${percent(stat.projectedShare)}${stat.projectedTier === stat.tier ? '' : ` · ${tierLabel(stat.projectedTier)}`}`
}
