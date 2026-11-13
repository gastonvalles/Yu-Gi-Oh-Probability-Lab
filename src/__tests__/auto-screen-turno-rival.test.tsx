// @vitest-environment jsdom
import { writeFileSync } from 'node:fs'
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { writeHandtrapConfig } from '../app/handtraps'
import { AutoSoloScreen } from '../components/auto/AutoSoloScreen'
import { dispatches, hand } from './support/auto-screen-harness'
import { render } from './support/practice-mat-harness'
import FILMS from './support/turno-rival-film.json'
import { filmCards, filmSession, type RivalTurnFilm } from './support/turno-rival-film'

// El turno del rival en «Jugar solo automático», como lo cuenta el núcleo real (la grabación de `auto-turno-rival.slow.test.ts`): terminás tu turno con Kuriboh en el campo y el
// rival juega el suyo. Se cuenta en orden, como una película: «Turno de Rival», su Standby y su Main Phase 1, sus jugadas de a una (Raigeki, tu Kuriboh al cementerio, Inpachi),
// su Battle Phase, el ataque y recién ahí tus vidas, su End Phase y «Tu turno»; el marcador dice de quién es el turno que se ve. `FILM_LINE=<archivo>` guarda la línea de tiempo.

const { bot: BOT, passive: PASSIVE } = FILMS as unknown as Record<'bot' | 'passive', RivalTurnFilm>
const RAIGEKI = 'c1'
const INPACHI = 'c2'
const KURIBOH = 'card-40640057-1'
const TICK = 50

/**
 * Lo que se ve en un momento: el cartel del rival (sus fases y «Tu turno») o, si no hay, el de tu mesa (el último que salió: el elemento queda, transparente, al terminar), las cartas
 * del campo del rival, tu Kuriboh, tus vidas, el marcador, el aviso del ataque, su mano boca arriba, la banda que cruza el campo (`PhaseBand`) y cuántas cartas tenés en la mano.
 */
function frame() {
  // Sin cartel: lo que el lector de pantalla oye de la fase (un `role="status"` oculto junto al botón, que es el que pulsa); se apaga solo cuando termina el aviso.
  const banners = [...document.querySelectorAll('[aria-haspopup="menu"][aria-label^="Fases:"]')].map((button) => button.parentElement?.querySelector('[role="status"]')?.textContent ?? '').filter(Boolean)
  const rivalHand = screen.queryByLabelText(/^Mano del rival/)
  const rival = [...document.querySelectorAll<HTMLElement>('[data-rival-card-id]')].filter((element) => !rivalHand?.contains(element)).map((element) => element.dataset.rivalCardId!)
  const strip = document.querySelector<HTMLElement>('[data-fx="banner"]')

  return {
    band: strip ? `${strip.hasAttribute('data-turn') ? 'Cambio de turno' : strip.textContent}/${strip.dataset.side}` : '',
    mine: within(hand()).queryAllByRole('listitem').length,
    banner: banners.at(-1) ?? '',
    rival: [...new Set(rival)].sort().join(','),
    kuriboh: document.querySelector(`[data-card-id="${KURIBOH}"]`) ? 'campo' : '',
    life: screen.getAllByRole('group', { name: /^Puntos de vida de Vos/ })[0]!.getAttribute('aria-label')!.replace(/\D+/g, ''),
    // De quién es el turno: el borde grueso de la chapa (no hay texto del turno hasta 1100 px).
    turn: document.querySelector('[data-lp][data-active="true"]')?.getAttribute('data-lp') ?? '',
    attack: screen.queryByText(/te ataca directo/) ? 'ataque' : '',
    hand: rivalHand ? within(rivalHand).queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? '').join(',') : '',
  }
}
type Frame = ReturnType<typeof frame>

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
type Line = (Frame & { ms: number })[]

/** La pantalla con la grabación, en tu última pregunta del turno 1. */
function mount(film: RivalTurnFilm) {
  const session = filmSession(film)
  const cards = filmCards(film)

  render(<AutoSoloScreen mainIds={[...cards.keys()]} extraIds={[]} cardsById={cards} deckName="Test" onExit={() => {}} connect={() => session} />)
  advance(5000)
  return session
}

/** «Terminar turno» y la mesa cuenta lo que sigue: cada cambio de lo que se ve queda en la línea de tiempo, con su momento (ms). */
function play(film: RivalTurnFilm, name: string, until = 14_000): Line {
  const session = mount(film)
  const line: Line = []
  const note = (ms: number) => {
    const now = frame()
    const last = line.at(-1)

    if (!last || (Object.keys(now) as (keyof Frame)[]).some((key) => now[key] !== last[key])) line.push({ ms, ...now })
  }

  note(0)
  act(() => {
    session.answer({ type: 'select_idlecmd', action: 7, index: null })
  })
  for (let ms = 0; ms <= until; ms += TICK) {
    note(ms)
    advance(TICK)
  }
  expect(session.frame()).toBe(film.frames.length - 1)
  expect(dispatches).toBe(0)
  if (process.env.FILM_LINE) writeFileSync(`${process.env.FILM_LINE}-${name}.txt`, line.map((item) => JSON.stringify(item)).join('\n'))

  return line
}

/** El primer momento de la línea en que se cumple. */
function when(line: Line, test: (frame: Line[number]) => boolean): number {
  const found = line.find(test)

  expect(found, String(test)).toBeDefined()
  return found!.ms
}
const increasing = (moments: readonly number[]) => moments.every((ms, i) => i === 0 || moments[i - 1]! < ms)

const botConfig = () => writeHandtrapConfig({ enabled: true, picks: [12580477, 5464695].map((id) => ({ id, name: `#${id}`, copies: 1 })), hand: 2, ownTurn: true })

describe('auto-screen · el turno del rival, en orden (grabado del núcleo real)', () => {
  it('el rival que juega su turno: sus fases, Raigeki, tu Kuriboh al cementerio, Inpachi, la Battle Phase, el ataque con tus vidas, su End Phase y «Tu turno»; el marcador va con lo que se ve', () => {
    botConfig()
    const line = play(BOT, 'bot')
    const rivalTurn = when(line, (now) => now.banner === 'Turno de Rival')
    const standby = when(line, (now) => now.banner === 'Rival · Standby Phase')
    const main1 = when(line, (now) => now.banner === 'Rival · Main Phase 1')
    const raigeki = when(line, (now) => now.rival.includes(RAIGEKI))
    const swept = when(line, (now) => now.kuriboh === '')
    const resolved = when(line, (now) => now.rival === '' && now.kuriboh === '' && now.ms > raigeki)
    const inpachi = when(line, (now) => now.rival.includes(INPACHI))
    const battle = when(line, (now) => now.banner === 'Rival · Battle Phase')
    const attack = when(line, (now) => now.attack === 'ataque')
    const hit = when(line, (now) => now.life === '6150')
    const end = when(line, (now) => now.banner === 'Rival · End Phase')
    const back = when(line, (now) => now.banner === 'Tu turno')

    expect(increasing([rivalTurn, standby, main1, raigeki, swept, resolved, inpachi, battle, attack, end, back])).toBe(true)
    expect(attack <= hit && hit < end).toBe(true)
    // El bot no juega debajo de un cartel (TI-275): Raigeki espera a que se vaya el de su Main Phase 1, y el ataque, el de su Battle Phase.
    expect([raigeki, attack].map((ms) => line.find((item) => item.ms === ms)!.band)).toEqual(['', ''])
    // «Cambio de turno» cruza una vez por cada pase: cuando se va el aviso de una fase del rival, tu pase de antes no vuelve a anunciarse (TI-278).
    expect(line.filter((item, i) => item.band.startsWith('Cambio de turno') && item.band !== line[i - 1]?.band).map((item) => item.band)).toEqual(['Cambio de turno/theirs', 'Cambio de turno/mine'])
    // Tus vidas no bajan antes del ataque; el marcador dice «Turno de Rival · 2» desde «Turno de Rival» hasta «Tu turno», y «Tu turno · 3» con su cartel.
    expect(line.filter((item) => item.ms < attack).map((item) => item.life)).toEqual(line.filter((item) => item.ms < attack).map(() => '8000'))
    expect(new Set(line.filter((item) => item.ms < rivalTurn).map((item) => item.turn))).toEqual(new Set(['mine']))
    expect(new Set(line.filter((item) => item.ms >= rivalTurn && item.ms < back).map((item) => item.turn))).toEqual(new Set(['theirs']))
    expect(line.find((item) => item.ms === back)!.turn).toBe('mine')
    // Su mano boca arriba va con su mesa: Raigeki e Inpachi están en su mano hasta que los juega.
    expect(line.filter((item) => item.ms < raigeki).every((item) => item.hand.includes('#12580477'))).toBe(true)
    expect(line.filter((item) => item.ms < inpachi).every((item) => item.hand.includes('#5464695'))).toBe(true)
    expect(line.at(-1)!.hand).not.toMatch(/#12580477|#5464695/)
    // Un turno del bot de pocas jugadas no se hace largo.
    expect(back - rivalTurn).toBeLessThanOrEqual(9_000)
  })

  it('con movimiento, tus vidas esperan al golpe de su espada', () => {
    botConfig()
    const reduce = window.matchMedia

    window.matchMedia = ((query: string) => ({ ...reduce(query), matches: false })) as typeof window.matchMedia
    // Con movimiento, los vuelos piden cuadros sin fin: acá no corren.
    window.requestAnimationFrame = () => 1
    const line = play(BOT, 'bot-movimiento')
    const attack = when(line, (now) => now.attack === 'ataque')
    const hit = when(line, (now) => now.life === '6150')

    expect(hit - attack).toBeGreaterThanOrEqual(250)
    expect(hit).toBeLessThan(when(line, (now) => now.banner === 'Rival · End Phase'))
  })

  it('el rival pasivo: «Turno de Rival», Standby, Main Phase 1, End Phase y «Tu turno», con el marcador del rival hasta su cartel; tu robo, después', () => {
    const line = play(PASSIVE, 'pasivo', 8_000)
    const cards = (ms: number) => line.filter((item) => item.ms <= ms).at(-1)!
    const rivalTurn = when(line, (now) => now.banner === 'Turno de Rival')
    const back = when(line, (now) => now.banner === 'Tu turno')

    // Después de «Tu turno», tu SP y tu M1 pasan solas, cada una con su cartel (no encima de «Tu turno»).
    expect(line.map((item) => item.banner).filter((banner, i, all) => banner !== '' && banner !== all[i - 1])).toEqual(['End Phase', 'Turno de Rival', 'Rival · Standby Phase', 'Rival · Main Phase 1', 'Rival · End Phase', 'Tu turno', 'Standby Phase', 'Main Phase 1'])
    expect(new Set(line.filter((item) => item.ms >= rivalTurn && item.ms < back).map((item) => item.turn))).toEqual(new Set(['theirs']))
    expect(cards(back).turn).toBe('mine')
    expect(back - rivalTurn).toBeLessThanOrEqual(5_000)
  })

  it('el rival pasivo, en la banda del campo: «Cambio de turno», sus cuatro fases, «Cambio de turno» y tus fases, cada una su rato; tu robo, recién con tu Draw Phase a la vista', () => {
    const line = play(PASSIVE, 'pasivo-banda', 8_000)
    const bands = line.filter((item, i) => item.band !== '' && item.band !== line[i - 1]?.band)

    expect(bands.map((item) => item.band)).toEqual([
      'Cambio de turno/theirs',
      'Draw Phase/theirs',
      'Standby Phase/theirs',
      'Main Phase 1/theirs',
      'End Phase/theirs',
      'Cambio de turno/mine',
      'Draw Phase/mine',
      'Standby Phase/mine',
      'Main Phase 1/mine',
    ])
    // Cada fase se ve lo justo para leerla (la última, hasta que se va).
    const at = (band: string) => bands.find((item) => item.band === band)!.ms
    const shown = bands.slice(0, -1).map((item, i) => [item.band, bands[i + 1]!.ms - item.ms] as const)

    expect(shown.filter(([band, ms]) => !band.startsWith('Cambio') && ms < 450)).toEqual([])
    // Tu robo: con tu Draw Phase en la banda, nunca antes.
    const drawn = when(line, (now) => now.mine > line[0]!.mine)

    expect(drawn).toBeGreaterThan(at('Draw Phase/mine'))
    expect(drawn).toBeLessThan(at('Standby Phase/mine'))
    // Su turno entero, rápido: de su «Cambio de turno» al tuyo, menos de 4 s.
    expect(at('Cambio de turno/mine') - at('Cambio de turno/theirs')).toBeLessThanOrEqual(4_000)
  })

  it('tocar la mesa mientras cuenta su turno lo salta entero (sin carteles en ráfaga): su mesa, tus vidas y el marcador quedan como al final', () => {
    botConfig()
    const session = mount(BOT)

    act(() => {
      session.answer({ type: 'select_idlecmd', action: 7, index: null })
    })
    // Con los temporizadores de mentira cada paso de la mesa es un `act`: se avanza de a poco, como en el navegador.
    for (let ms = 0; ms < 3_000; ms += TICK) advance(TICK)
    expect(frame()).toMatchObject({ banner: 'Rival · Main Phase 1', turn: 'theirs', life: '8000' })
    fireEvent.pointerDown(hand(), { button: 0, pointerId: 1 })
    const seen = new Set<string>()

    for (let ms = 0; ms < 3_000; ms += TICK) {
      advance(TICK)
      seen.add(frame().banner)
    }
    expect([...seen].filter((banner) => banner.startsWith('Rival') && banner !== 'Rival · Main Phase 1')).toEqual([])
    expect(frame()).toMatchObject({ rival: INPACHI, kuriboh: '', life: '6150', turn: 'mine' })
  })
})
