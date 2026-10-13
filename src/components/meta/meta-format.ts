import { MIN_WEEK_DECKS, TIER_FLOORS, countKindCopies, type MetaCardKind, type MetaCardStat, type MetaDeck, type MetaTier, type MetaTrend, type MetaWeek } from '../../app/meta'
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

/** Qué pide un tier: sus pisos son los de la lista (los decks se reparten el meta en porcentajes mucho más bajos que las cartas). */
export function tierHint(tier: MetaTier, floors: ReadonlyArray<readonly [MetaTier, number]> = TIER_FLOORS): string {
  const floor = floors.find(([key]) => key === tier)?.[1]
  return floor === undefined
    ? t('meta.tier.below', { percent: percent(floors.at(-1)?.[1] ?? 0) })
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

/** Lo que tienen en común una carta y un deck del tier list: cómo les va hoy y hacia dónde van. */
type Trending = Pick<MetaCardStat, 'trend' | 'projectedShare' | 'tier' | 'projectedTier'>

export function trendText(stat: Trending): string {
  if (stat.trend === 'flat') {
    return t('meta.trend.flat')
  }

  const text = t(stat.trend === 'up' ? 'meta.trend.upTo' : 'meta.trend.downTo', { percent: percent(stat.projectedShare) })

  return stat.projectedTier === stat.tier ? text : `${text} · ${tierLabel(stat.projectedTier)}`
}

/** "12% · 14% · —": la serie semanal, de la semana más vieja a la más nueva. Una semana con pocos decks queda vacía: tampoco pesa en la tendencia. */
export function weeklyText(weekly: readonly MetaWeek[]): string {
  return weekly.map((week) => (week.decks >= MIN_WEEK_DECKS ? percent(week.share) : '—')).join(' · ')
}

/** Lo que lleva un deck de hand traps y de boardbreakers ("Hand traps: 6 en Main · 3 en Side"): sin renglón para el tipo que no lleva. */
export function deckCardCounts(deck: Pick<MetaDeck, 'main' | 'side'>): Array<{ kind: MetaCardKind; text: string }> {
  const count = (kind: MetaCardKind) => ({ main: countKindCopies(deck.main, kind), side: countKindCopies(deck.side, kind) })
  const handtraps = count('handtrap')
  const boardbreakers = count('boardbreaker')

  return [
    ...(handtraps.main + handtraps.side === 0
      ? []
      : [{ kind: 'handtrap' as const, text: t('meta.deck.handtraps', { main: formatInteger(handtraps.main), side: formatInteger(handtraps.side) }) }]),
    ...(boardbreakers.main + boardbreakers.side === 0
      ? []
      : [{ kind: 'boardbreaker' as const, text: t('meta.deck.boardbreakers', { main: formatInteger(boardbreakers.main), side: formatInteger(boardbreakers.side) }) }]),
  ]
}
