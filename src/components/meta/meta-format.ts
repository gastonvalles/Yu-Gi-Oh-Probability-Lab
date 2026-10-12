import { TIER_FLOORS, type HandtrapStat, type MetaTier, type MetaTrend } from '../../app/meta-handtraps'
import { formatInteger } from '../../app/utils'
import { dateLocale, formatDay, numberLocale, t } from '../../i18n'

/** La etiqueta se arma al leerla: así sigue el idioma de ese momento sin crear texto al evaluar el módulo. */
export const TREND_LOOK: Record<MetaTrend, { tone: 'success' | 'danger' | 'neutral'; label: string }> = {
  up: { tone: 'success', get label() { return t('meta.trend.up') } },
  down: { tone: 'danger', get label() { return t('meta.trend.down') } },
  flat: { tone: 'neutral', get label() { return t('meta.trend.flat') } },
}

const TIER_LABEL_KEY = { S: 'meta.tier.s', A: 'meta.tier.a', B: 'meta.tier.b', C: 'meta.tier.c', D: 'meta.tier.d' } as const satisfies Record<MetaTier, string>
// Los colores clásicos de las tier lists: así la reconoce cualquiera.
const TIER_COLOR: Record<MetaTier, string> = { S: '#ff7f7f', A: '#ffbf7f', B: '#ffdf7f', C: '#ffff7f', D: '#bfff7f' }

export const TIER_ORDER: readonly MetaTier[] = ['S', 'A', 'B', 'C', 'D']

export function tierLabel(tier: MetaTier): string {
  return t(TIER_LABEL_KEY[tier])
}

export function tierColor(tier: MetaTier): string {
  return TIER_COLOR[tier]
}

export function tierHint(tier: MetaTier): string {
  const floor = TIER_FLOORS.find(([key]) => key === tier)?.[1]
  return floor === undefined
    ? t('meta.tier.below', { percent: percent(TIER_FLOORS.at(-1)?.[1] ?? 0) })
    : t('meta.tier.atLeast', { percent: percent(floor) })
}

/** "08/10/2026" (en inglés "Oct 8, 2026": con el mes en letras no se confunde día con mes): cuándo se actualizaron los datos, en la hora del usuario. */
export function formatMetaDateFull(instant: string): string {
  // Sin zona horaria fija: el instante del snapshot se muestra en la hora del usuario (las fechas de torneo, en cambio, son días en UTC).
  return formatDay(instant)
}

export function percent(value: number): string {
  return `${formatInteger(Math.round(value * 100))}%`
}

/** "8 oct" / "Oct 8": el día de un torneo (son días en UTC). */
export function formatMetaDate(date: string): string {
  return new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date)).replace('.', '')
}

/** "72% ×2,8": en qué parte de los decks que la juegan va en esa zona, y con cuántas copias. */
export function usageText(decks: number, copies: number, total: number): string {
  if (decks === 0) {
    return '0%'
  }

  const average = new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(copies / decks)

  return `${percent(decks / total)} ×${average}`
}

export function trendText(stat: HandtrapStat): string {
  if (stat.trend === 'flat') {
    return t('meta.trend.flat')
  }

  const text = t(stat.trend === 'up' ? 'meta.trend.upTo' : 'meta.trend.downTo', { percent: percent(stat.projectedShare) })

  return stat.projectedTier === stat.tier ? text : `${text} · ${tierLabel(stat.projectedTier)}`
}
