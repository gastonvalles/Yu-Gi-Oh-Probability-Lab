import { t } from '../../i18n'
import type { IconName } from '../ui/Icon'
import { mascotsNavItem, searchNavItem, type NavGroup } from './nav-model'

/** Un resultado del buscador de la app: a dónde lleva (`key` es el mismo que entiende `onSelect` del menú), cómo se llama, de qué grupo es y con qué palabras se encuentra. */
export interface FindEntry {
  key: string
  label: string
  group: string
  /** La línea que explica qué hay (la del menú del celular), o el estado del paso. */
  hint: string
  icon: IconName
  /** Palabras que no están en el nombre pero lo describen («pdf» → Exportar, «vidas» → Calculadora de LP). */
  keywords: string
}

/** Las palabras de cada destino, por clave (`shell.find.kw.*`): lo que alguien escribiría para llegar ahí sin saber cómo se llama. */
const KEYWORD_KEYS = {
  'deck-builder': 'shell.find.kw.deck-builder',
  categorization: 'shell.find.kw.categorization',
  'probability-lab': 'shell.find.kw.probability-lab',
  workspace: 'shell.find.kw.workspace',
  export: 'shell.find.kw.export',
  practice: 'shell.find.kw.practice',
  duel: 'shell.find.kw.duel',
  'duel-watch': 'shell.find.kw.duel-watch',
  'duel-join': 'shell.find.kw.duel-join',
  life: 'shell.find.kw.life',
  meta: 'shell.find.kw.meta',
  tournaments: 'shell.find.kw.tournaments',
  replays: 'shell.find.kw.replays',
  expansions: 'shell.find.kw.expansions',
  banlists: 'shell.find.kw.banlists',
  mascots: 'shell.find.kw.mascots',
  search: 'shell.find.kw.search',
} as const

const keywordsOf = (key: string): string => (key in KEYWORD_KEYS ? t(KEYWORD_KEYS[key as keyof typeof KEYWORD_KEYS]) : '')

/** Minúsculas y sin tildes: «práctica» y «practica» son lo mismo al buscar. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Todo lo que se puede hacer en la app, en el orden del menú: los destinos de cada grupo (los de la hoja del celular, que son los más completos: traen «Mirar un duelo» y «Entrar con un enlace»;
 * también los que el menú esconde, como «Entrenar solo») más las herramientas que no son un destino: las mascotas y, donde hay buscador, las cartas.
 */
export function buildFindEntries(groups: NavGroup[], { cards }: { cards: boolean }): FindEntry[] {
  const fromGroups = groups.flatMap((group) =>
    (group.sheetItems ?? group.items).map<FindEntry>((item) => ({
      key: item.key,
      label: item.label,
      group: group.label,
      hint: item.blurb ?? item.detail ?? '',
      icon: item.icon,
      keywords: keywordsOf(item.key),
    })),
  )
  const tools = t('shell.find.group.tools')
  const mascots = mascotsNavItem()
  const search = searchNavItem()

  return [
    ...fromGroups,
    ...(cards ? [{ key: search.key, label: search.label, group: tools, hint: t('shell.find.cardsHint'), icon: search.icon, keywords: keywordsOf(search.key) }] : []),
    { key: mascots.key, label: mascots.label, group: tools, hint: mascots.detail ?? '', icon: mascots.icon, keywords: keywordsOf(mascots.key) },
  ]
}

/**
 * Lo que coincide con lo escrito, lo más parecido primero. Cada palabra tiene que aparecer en alguna parte (nombre, palabras clave, línea que explica o grupo); el nombre pesa más que lo demás
 * y empezar con la palabra más que contenerla. Sin nada escrito, todo en el orden del menú.
 */
export function filterFindEntries(entries: FindEntry[], query: string): FindEntry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return entries
  }

  const scored = entries.flatMap((entry, index) => {
    const label = normalize(entry.label)
    const rest = [entry.keywords, entry.hint, entry.group].map(normalize)
    let score = 0

    for (const word of words) {
      if (label.startsWith(word)) score += 100
      else if (label.split(/[\s·-]+/).some((part) => part.startsWith(word))) score += 90
      else if (label.includes(word)) score += 70
      else if (rest[0]?.split(/\s+/).some((part) => part.startsWith(word))) score += 50
      else if (rest.some((text) => text.includes(word))) score += 25
      else return []
    }

    return [{ entry, score, index }]
  })

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ entry }) => entry)
}
