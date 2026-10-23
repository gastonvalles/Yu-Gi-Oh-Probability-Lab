import { buildMetaDeckHash, filterMetaDecks, META_DECKS, placementRank } from '../../app/meta'
import { buildReplaysHash, getReplayEntries, replayLabel } from '../../app/replays'
import { normalizeSearchText } from '../../app/utils'
import { t } from '../../i18n'
import { FINDER_MIN_LENGTH, words, type FinderResult } from './finder-sources'

/**
 * Los decks de torneo y los replays del buscador de la app. Van en un archivo aparte porque traen los datos de los torneos (~280 KB): el buscador los pide con `import()`
 * al abrirse (y la app los precarga en un momento ocioso), así no viajan con el arranque. Nada del arranque los importa estático (`startup-imports.test.ts`).
 */

/** Los decks de torneo que nombran lo escrito (el deck, el torneo, el puesto o quien lo jugó), los más nuevos primero y, a igual fecha, el mejor puesto. */
export function findDeckResults(query: string, limit = 5): FinderResult[] {
  if (normalizeSearchText(query).length < FINDER_MIN_LENGTH) {
    return []
  }

  return filterMetaDecks(META_DECKS.decks, { text: query })
    .sort((a, b) => b.date.localeCompare(a.date) || placementRank(a.placement ?? '') - placementRank(b.placement ?? ''))
    .slice(0, limit)
    .map((deck) => ({
      id: `deck:${deck.id}`,
      group: t('shell.find.group.decks'),
      label: deck.name,
      hint: [deck.player, deck.tournament, deck.placement].filter(Boolean).join(' · '),
      icon: 'trophy',
      action: { type: 'hash', hash: buildMetaDeckHash(deck.id) },
    }))
}

/** Los replays que nombran lo escrito (el torneo, la instancia, los jugadores o sus decks), los más nuevos primero. */
export function findReplayResults(query: string, limit = 4): FinderResult[] {
  const wanted = words(query)

  if (normalizeSearchText(query).length < FINDER_MIN_LENGTH) {
    return []
  }

  return getReplayEntries()
    .filter((entry) => wanted.every((word) => entry.search.includes(word)))
    .sort((a, b) => b.video.date.localeCompare(a.video.date))
    .slice(0, limit)
    .map((entry) => ({
      id: `replay:${entry.video.id}`,
      group: t('shell.find.group.replays'),
      label: replayLabel(entry),
      hint: [entry.event, entry.stage?.label].filter(Boolean).join(' · '),
      icon: 'play',
      action: { type: 'hash', hash: buildReplaysHash({ video: entry.video.id }) },
    }))
}
