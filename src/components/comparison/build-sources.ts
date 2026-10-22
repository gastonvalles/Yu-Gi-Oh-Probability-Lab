import { isCardPendingClassification } from '../../app/build-comparison'
import type { CardMove, DeckChanges, MainChange } from '../../app/change-pairs'
import { CURRENT_SOURCE, DECK_BEFORE_SOURCE, DRAFT_SOURCE, type BuildSource, type ComparisonSources } from '../../app/comparison-selection'
import type { DeckBefore } from '../../app/deck-before'
import { getCardRoleDefinition } from '../../app/deck-groups'
import type { DeckCardInstance, DeckZone } from '../../app/model'
import { withReferenceClassification, type BuildZones, type SavedBuild } from '../../app/saved-builds'
import { formatInteger } from '../../app/utils'
import { dateLocale, getLocale, perLocale, t } from '../../i18n'
import type { CardRole } from '../../types'

/**
 * Lo que la pantalla de Comparar dice de cada fuente (tu deck, «Tu deck de antes», el borrador del Lab, las builds guardadas) y de cada cambio, en
 * palabras. Puro: sin DOM ni estado.
 */

export type SourceKind = 'current' | 'deck-before' | 'draft' | 'saved'

export interface SourceOption {
  source: BuildSource
  kind: SourceKind
  /** Cómo se llama en Comparar: «Tu deck actual», «Tu deck de antes», «Borrador del Lab» o el nombre de la build. */
  name: string
  /** La segunda línea: de dónde sale y cuándo («se guardó sola · ayer, 21:40»). */
  meta: string
  /** El nombre propio del deck (el del builder o el de la copia): lo que dice la lista y con lo que se carga en el builder. */
  deckName: string
  /** Las zonas, con la clasificación de tu deck en las cartas que también están en él: una misma carta se mide igual en las dos builds. */
  zones: BuildZones
  /** Cuántas cartas distintas del Main falta clasificar. */
  pending: number
  build?: SavedBuild
}

/** Lo que hay para comparar, con «Tu deck de antes» entero (trae el nombre del deck). */
type NamedSources = Omit<ComparisonSources, 'deckBefore'> & { deckBefore: DeckBefore | null }

// La hora en 24 h en los dos idiomas: «hoy, 14:20» (con «p. m.» no entraba en el chip).
const timeFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
const dayFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' }))
const dayYearFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' }))
const listFormat = perLocale((tag) => new Intl.ListFormat(tag, { type: 'conjunction' }))

/** Cuándo se guardó, como se dice: «hoy, 14:20», «ayer, 21:40», «12 oct» (con el año si no es el de ahora). */
export function whenText(iso: string, now = new Date()): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  const time = timeFormat(dateLocale()).format(date)

  if (days === 0) return t('meta.compare.when.today', { time })
  if (days === 1) return t('meta.compare.when.yesterday', { time })

  return (date.getFullYear() === now.getFullYear() ? dayFormat : dayYearFormat)(dateLocale()).format(date).replace('.', '')
}

/** Una lista con «y», como la escribe cada idioma. */
export const joinList = (items: readonly string[]) => listFormat(getLocale()).format(items)

const pendingCount = (main: readonly DeckCardInstance[]) => new Set(main.filter(isCardPendingClassification).map((card) => card.apiCard.ygoprodeckId)).size

const withReference = (zones: BuildZones, reference: readonly DeckCardInstance[]): BuildZones => ({
  main: withReferenceClassification(zones.main, reference),
  extra: zones.extra,
  side: zones.side,
})

const FROM_META = { deck: 'meta.compare.source.saved', import: 'meta.compare.source.imported', lab: 'meta.compare.source.lab' } as const

/** Las fuentes que se pueden elegir, en el orden de la lista: tu deck, «Tu deck de antes», el borrador y las builds guardadas, de la más nueva a la más vieja. */
export function sourceOptions(sources: NamedSources, deckName: string, now = new Date()): SourceOption[] {
  const reference = sources.current.main
  const option = (source: BuildSource, kind: SourceKind, name: string, meta: string, zones: BuildZones, ownName: string, build?: SavedBuild): SourceOption => {
    const measured = kind === 'current' ? zones : withReference(zones, reference)

    return { source, kind, name, meta, deckName: ownName, zones: measured, pending: pendingCount(measured.main), ...(build ? { build } : {}) }
  }
  const options = [option(CURRENT_SOURCE, 'current', t('meta.compare.source.current'), t('meta.compare.source.currentMeta'), sources.current, deckName)]

  if (sources.deckBefore) {
    const before = sources.deckBefore

    options.push(option(DECK_BEFORE_SOURCE, 'deck-before', t('meta.compare.source.before'), t('meta.compare.source.beforeMeta', { when: whenText(before.savedAt, now) }), before, before.deckName))
  }

  if (sources.draft) {
    options.push(option(DRAFT_SOURCE, 'draft', t('meta.compare.source.draft'), t('meta.compare.source.draftMeta'), sources.draft, deckName))
  }

  for (const build of [...sources.savedBuilds].sort((left, right) => right.savedAt.localeCompare(left.savedAt))) {
    options.push(option(build.id, 'saved', build.name, t(FROM_META[build.from ?? 'deck'], { when: whenText(build.savedAt, now) }), build, build.name, build))
  }

  return options
}

/** El rol que se nombra de una carta: el que dice su familia (arranca, interactúa, traba) antes que el de relleno, como piensa el cambio un jugador. */
const ROLE_PRIORITY: readonly CardRole[] = ['starter', 'extender', 'handtrap', 'disruption', 'boardbreaker', 'floodgate', 'brick', 'garnet', 'searcher', 'enabler', 'draw', 'recovery', 'payoff']

const roleOf = (card: DeckCardInstance) => {
  const role = ROLE_PRIORITY.find((candidate) => card.roles.includes(candidate)) ?? card.roles[0]

  return role ? getCardRoleDefinition(role).label : t('meta.compare.change.unclassified')
}

/**
 * Un cambio del Main en palabras: el título (la carta que entra o, si no entra ninguna, la que sale) y sus datos, de a uno («Starter», «sube del Side»,
 * «en lugar de…»). Lo que baja al Side lo dice la línea del Side (`describeZones`), como en la maqueta aprobada.
 */
export function describeChange(change: MainChange): { title: string; facts: string[] } {
  const { out, in: entering } = change

  if (entering) {
    const how =
      entering.place === 'side'
        ? t('meta.compare.change.fromSide')
        : entering.copiesA === 0
          ? t('meta.compare.change.new')
          : t('meta.compare.change.nowCopies', { n: formatInteger(entering.copiesB) })
    const instead = out ? [t('meta.compare.change.instead', { name: out.card.name })] : []

    return { title: entering.card.name, facts: [roleOf(entering.card), how, ...instead] }
  }

  const leaving = out!
  const fate =
    leaving.place === 'side'
      ? t('meta.compare.change.toSide')
      : leaving.copiesB > 0
        ? t('meta.compare.change.remaining', { n: formatInteger(leaving.copiesB) })
        : t('meta.compare.change.leavesDeck')

  return { title: t('meta.compare.change.removed', { name: leaving.card.name }), facts: [roleOf(leaving.card), fate] }
}

const ZONE_LABEL = { extra: 'meta.compare.zoneExtra', side: 'meta.compare.zoneSide' } as const
/** Hasta acá se nombra lo que pasa en una zona; lo demás, «y N más» (con dos decks muy distintos la línea era un párrafo). */
const ZONE_FACTS = 4

const capped = (facts: readonly string[]) =>
  facts.length > ZONE_FACTS ? [...facts.slice(0, ZONE_FACTS - 1), t('meta.compare.more', { n: formatInteger(facts.length - ZONE_FACTS + 1) })] : facts

const moveText = (move: CardMove, key: 'meta.compare.zone.down' | 'meta.compare.zone.leaves' | 'meta.compare.zone.enters' | 'meta.compare.zone.fromExtra' | 'meta.compare.zone.toExtra') =>
  t(key, { count: move.copies, n: formatInteger(move.copies), name: move.card.name })

/**
 * El Extra y el Side en una línea: lo que baja del Main al Side, lo que sale o entra al deck y lo que pasa entre el Extra y el Side (lo que sube del Side
 * al Main ya lo dice su cambio: «sube del Side»), y que el Side no cambia la mano.
 */
export function describeZones(changes: DeckChanges): string {
  const { extra, side } = changes.zones

  if (extra.unchanged && side.unchanged) {
    return t('meta.compare.zone.bothSame')
  }

  const facts: Record<'extra' | 'side', string[]> = {
    side: [
      ...side.in.filter((move) => move.from === 'main').map((move) => moveText(move, 'meta.compare.zone.down')),
      ...side.in.filter((move) => move.from === 'extra').map((move) => moveText(move, 'meta.compare.zone.fromExtra')),
      ...side.out.filter((move) => move.to === 'extra').map((move) => moveText(move, 'meta.compare.zone.toExtra')),
      ...side.out.filter((move) => move.to === 'outside').map((move) => moveText(move, 'meta.compare.zone.leaves')),
      ...side.in.filter((move) => move.from === 'outside').map((move) => moveText(move, 'meta.compare.zone.enters')),
    ],
    extra: [
      ...extra.out.filter((move) => move.to === 'outside').map((move) => moveText(move, 'meta.compare.zone.leaves')),
      ...extra.in.filter((move) => move.from === 'outside').map((move) => moveText(move, 'meta.compare.zone.enters')),
    ],
  }
  const lines = (['side', 'extra'] as const).flatMap((zone) => {
    if (facts[zone].length > 0) return [t('meta.compare.zone.line', { zone: t(ZONE_LABEL[zone]), facts: joinList(capped(facts[zone])) })]

    return changes.zones[zone].unchanged ? [t('meta.compare.zone.same', { zone: t(ZONE_LABEL[zone]) })] : []
  })

  return [...lines, t('meta.compare.zone.note')].join(' ')
}

/** Las copias marcadas de cada carta en una zona de «Las dos listas»: en A las que salen de la zona, en B las que entran (por id de YGOPRODeck). */
export function zoneMarks(changes: DeckChanges, zone: DeckZone): { A: Map<number, number>; B: Map<number, number> } {
  const tally = (moves: readonly CardMove[]) => {
    const marks = new Map<number, number>()

    for (const move of moves) {
      marks.set(move.card.apiCard.ygoprodeckId, (marks.get(move.card.apiCard.ygoprodeckId) ?? 0) + move.copies)
    }

    return marks
  }

  return { A: tally(changes.zones[zone].out), B: tally(changes.zones[zone].in) }
}
