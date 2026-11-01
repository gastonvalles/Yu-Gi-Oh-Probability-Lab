import { describe, expect, it } from 'vitest'

import { nextBanlist } from '../app/banlists'
import { BOT_DECK_LISTS } from '../app/bot-deck-lists'
import { BOT_BANLIST, botBanlistIssues, botCopyLimit } from '../app/handtraps'

/**
 * La guardia de los mazos del bot: la sincronización diaria de las banlists puede traer una lista nueva, y entonces este test avisa qué lista del bot hay que actualizar
 * (`bot-deck-lists.ts`), con la misma regla que el deck del jugador (por nombre, la lista TCG que rige).
 */
const describeIssues = (issues: ReturnType<typeof botBanlistIssues>) => issues.map(({ name, count, limit }) => `${name}: ${count} (deja ${limit})`)

describe('los mazos del bot respetan la banlist del jugador', () => {
  it.each(BOT_DECK_LISTS.map((list) => [list.name, list] as const))('%s: Main y Extra legales con la lista que rige', (_name, list) => {
    expect({ main: describeIssues(botBanlistIssues(list, list.main)), extra: describeIssues(botBanlistIssues(list, list.extra)) }).toEqual({ main: [], extra: [] })
    // Lo que se puede cambiar también: ninguna cambiable prohibida.
    expect(Object.entries(list.flex).filter(([code]) => botCopyLimit(list, Number(code)) === 0).map(([, name]) => name)).toEqual([])
  })

  it('con la lista que viene (si ya se anunció), avisa lo que habrá que cambiar sin fallar', () => {
    const next = nextBanlist(BOT_BANLIST)

    for (const list of next ? BOT_DECK_LISTS : []) {
      const issues = [...botBanlistIssues(list, list.main, next!.date), ...botBanlistIssues(list, list.extra, next!.date)]

      if (issues.length > 0) console.warn(`La lista ${BOT_BANLIST.toUpperCase()} del ${next!.date} deja ilegal el mazo del bot ${list.name}; actualizá bot-deck-lists.ts: ${describeIssues(issues).join(', ')}`)
    }
  })
})
