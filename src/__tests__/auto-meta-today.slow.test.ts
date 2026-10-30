import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mapDeck, type DeckList } from '../app/auto/deck-map'
import { hasCoreData, loadCards, scriptStore } from './support/core-data'

/**
 * El chequeo de hoy, informativo (`npm run test:auto`): qué mazos del meta de `src/data/` (cambia todos los días) no se pueden automatizar con los datos del lock
 * (una carta que no está en el `.cdb` o una con efecto y sin script). Las demás pruebas lentas usan listas fijas (`slowDecklists`), así que esto no las mueve: sólo
 * imprime la lista, útil para la actualización semanal del lock, y falla si no se puede jugar ninguno (los datos del núcleo no sirven). Con `process.stdout`: el
 * `console.log` de una prueba que pasa no se ve en la salida.
 */
describe.skipIf(!hasCoreData)('el meta de hoy contra los datos del lock (informativo)', () => {
  it('imprime los mazos que no se pueden jugar; falla sólo si no se puede ninguno', () => {
    const { cards, names } = loadCards()
    const store = scriptStore()
    const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), 'src/data', file), 'utf8'))
    const lists = read('meta-decklists.json') as Record<string, DeckList>
    const titles = new Map((read('meta-decks.json') as { decks: { id: number; name: string }[] }).decks.map((deck) => [String(deck.id), deck.name]))
    const decks = Object.entries(lists).map(([id, list]) => ({ id, ...mapDeck(list, (code) => cards.get(code) ?? null, store.has) }))
    const blocked = decks
      .filter((deck) => deck.missing.length > 0 || deck.noRules.length > 0)
      .map((deck) => ({ id: deck.id, name: titles.get(deck.id) ?? '?', missing: deck.missing, noRules: deck.noRules.map((code) => `${code} ${names.get(code) ?? '?'}`) }))

    process.stdout.write(`El meta de hoy: se pueden jugar ${decks.length - blocked.length} de ${decks.length} mazos.${blocked.length > 0 ? ` No se pueden:\n${blocked.map((deck) => JSON.stringify(deck)).join('\n')}` : ''}\n`)
    expect(blocked.length).toBeLessThan(decks.length)
  })
})
