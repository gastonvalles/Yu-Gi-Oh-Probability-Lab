import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_HANDTRAP_CONFIG } from '../app/handtraps'
import { hasCoreData } from './support/core-data'
import { handtrapDuels, type DuelScenario } from './support/handtrap-duel'
import { filmOf, type RivalTurnFilm } from './support/turno-rival-film'

/**
 * El turno del rival como lo cuenta el núcleo real (lento: `npm run test:auto`; se salta sin datos), grabado para la prueba de pantalla que lo reproduce en la mesa
 * (`auto-screen-turno-rival.test.tsx`): Invocás a Kuriboh y terminás; el rival que juega su turno barre con Raigeki, Invoca a Inpachi y ataca directo, y el pasivo sólo pasa sus
 * fases. Si el núcleo o el adaptador cambian lo que cuentan, falla; `UPDATE_FILM=1` vuelve a grabar.
 */

const FILM = path.join(__dirname, 'support', 'turno-rival-film.json')
const RAIGEKI = 12580477
const INPACHI = 5464695
const KURIBOH = 40640057
const POT = 55144522
const ONE: DuelScenario = { deck: [[POT, 3]], hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }, { do: 'end' }] }

describe.skipIf(!hasCoreData)('el turno del rival, grabado del núcleo real (npm run test:auto)', () => {
  const { duel } = handtrapDuels()

  it('el bot que juega su turno (Raigeki, Inpachi, ataque directo) y el pasivo: la grabación de la prueba de pantalla sigue siendo la del núcleo', async () => {
    const films: Record<string, RivalTurnFilm> = {}

    for (const [name, config] of [
      ['bot', { ...DEFAULT_HANDTRAP_CONFIG, enabled: true, picks: [RAIGEKI, INPACHI].map((id) => ({ id, name: '', copies: 1 })), hand: 2, ownTurn: true }],
      ['passive', { ...DEFAULT_HANDTRAP_CONFIG, enabled: false }],
    ] as const) {
      const { history, adapter } = await duel(ONE, config)
      // Desde tu última mesa del turno 1 (contestás «terminar») hasta la primera de tu turno 3 en que el núcleo te deja jugar.
      const from = history.findLastIndex((snap) => snap.overlay.turn === 1)
      const to = history.findIndex((snap) => snap.overlay.turn === 3 && snap.ask?.ask.type === 'select_idlecmd')

      expect(from).toBeGreaterThanOrEqual(0)
      expect(to).toBeGreaterThan(from)
      expect(new Set(history.slice(from, to + 1).map((snap) => snap.initial)).size).toBe(1)
      films[name] = filmOf(history.slice(from, to + 1), adapter)
    }
    if (process.env.UPDATE_FILM) writeFileSync(FILM, `${JSON.stringify(films)}\n`)

    expect(JSON.parse(JSON.stringify(films))).toEqual(JSON.parse(readFileSync(FILM, 'utf8')))
  }, 180_000)
})
