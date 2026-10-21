// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCardEffectMap, setCardEffectMapForTests } from '../app/card-effect-data'
import { EFFECT_FACT } from '../app/card-effect-facts'
import { EFFECT_PLACE } from '../app/card-effect-map'
import { effectSentences } from '../app/card-text'
import type { DuelConnect } from '../app/use-duel'
import { LifeTile } from '../components/duel/DuelBar'
import { DuelScreen } from '../components/duel/DuelScreen'
import { applyLocale } from '../i18n'
import type { ApiCardReference } from '../types'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { createDuelHarness, asDesktop, asSocket, calculator, closeCalculator, effectMonster, handOf, mainIds, monsters, myLife, openCalculator, openGames, phaseChip, render, summonFirst, tap, typeInto, zoneOf } from './support/duel-screen-harness'

// La pantalla del duelo arma dos mesas completas por prueba: sola cada una tarda un par de segundos, pero con toda la suite corriendo a la vez alguna pasaba los 5 s de siempre (la de «atacar» fallaba una de cada tantas corridas).
vi.setConfig({ testTimeout: 20_000 })

// Las cartas de un deck pegado se piden por su número: acá salen todas menos la 999 (que no existe).
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.filter((id) => id !== 999).map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
  // El detalle de una carta pide también sus artes alternativos: acá no hay ninguno.
  fetchCardArts: vi.fn(async () => []),
}))

const { railsOn } = vi.hoisted(() => ({ railsOn: { value: false } }))

vi.mock('../app/duel-rails', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/duel-rails')>()), railsFit: () => railsOn.value }))

// La calculadora de vidas se carga a pedido (`lazy`): en las pruebas llega al instante.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()), LazyLifeCalculatorScreen: (await import('../components/life/LifeCalculatorScreen')).LifeCalculatorScreen }))

let memory: MemoryRoom
let connect: DuelConnect

const { allowUndo, click, confirmEndTurn, createRoom, flush, joinByLink, letPass, openTable, passTurn, passTurnFromEnd, screenProps, startDuel } = createDuelHarness(() => ({ memory, connect }))

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  railsOn.value = false
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('la pantalla del duelo', () => {
  it('juegos: moneda, piedra-papel-tijera y quién empieza; los dos ven lo mismo y la elección del rival no se ve hasta elegir la propia', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    openTable(host, guest)

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos' }))
    const open = (view: RenderResult) => openGames(view)
    const close = () => fireEvent.keyDown(document, { key: 'Escape' })

    // La moneda: tira Ana, los dos ven el mismo resultado, con su nombre.
    open(host)
    fireEvent.click(panel().getByRole('button', { name: 'Tirar la moneda' }))
    flush()
    const tossed = panel().getByText(/^Ana: (Cara|Cruz)$/).textContent!.replace('Ana: ', '')
    close()
    open(guest)
    expect(panel().getByText(`Ana tiró la moneda: ${tossed}`)).toBeInTheDocument()
    close()

    // Piedra, papel o tijera: Ana elige y espera; Beto sabe que eligió pero no qué.
    open(host)
    fireEvent.click(panel().getByRole('button', { name: 'Piedra' }))
    flush()
    expect(panel().getByText('Elegiste Piedra. Esperando a Beto…')).toBeInTheDocument()
    close()
    open(guest)
    expect(panel().getByText('Ana ya eligió.')).toBeInTheDocument()
    // No dice qué eligió: ni el resultado ni el registro lo cuentan todavía.
    expect(panel().queryByText(/ contra /)).not.toBeInTheDocument()
    // En el registro están las dos elecciones de Ana: la de la sala, que definió quién empieza, y ésta.
    expect(panel().getAllByText('Ana eligió en piedra, papel o tijera')).toHaveLength(2)
    fireEvent.click(panel().getByRole('button', { name: 'Tijera' }))
    flush()
    expect(panel().getByText('Tijera contra Piedra')).toBeInTheDocument()
    expect(panel().getByText('Perdiste')).toBeInTheDocument()
    close()
    open(host)
    expect(panel().getByText('Piedra contra Tijera')).toBeInTheDocument()
    expect(panel().getByText('Ganaste')).toBeInTheDocument()

    // Otra ronda: vuelve a elegir.
    fireEvent.click(panel().getByRole('button', { name: 'Otra ronda' }))
    flush()
    expect(panel().getByRole('button', { name: 'Papel' })).toBeInTheDocument()

    // Quién empieza ya no se cambia desde acá: se definió al entrar.
    expect(panel().queryByText('Quién empieza')).not.toBeInTheDocument()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
  })

  it('un duelo se juega con 40 cartas en el Main como mínimo: con menos se dice y no se puede estar listo', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 39) })} />)
    joinByLink(guest, link)
    flush()

    expect(within(guest.container).getByText(/Tu Main tiene 39 cartas y un duelo se juega con 40 como mínimo/)).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    expect(within(host.container).queryByText(/Tu Main tiene/)).not.toBeInTheDocument()
  })

  it('puntos de vida: no se elige, los dos empiezan siempre con 8000', () => {
    window.history.replaceState(null, '', '#duel')
    const lobby = render(<DuelScreen {...screenProps()} />)
    expect(within(lobby.container).queryByText('Puntos de vida')).not.toBeInTheDocument()
    expect(within(lobby.container).queryByRole('button', { name: '4000' })).not.toBeInTheDocument()
    cleanup()

    const { host, guest } = startDuel()

    for (const view of [host, guest]) {
      const rules = within(within(view.container).getByTestId('room-summary'))

      // Sin la vida ni la mano inicial: en TCG son siempre las mismas y no se comunican.
      expect(rules.queryByText('Vida inicial')).not.toBeInTheDocument()
      expect(rules.queryByText('Mano inicial')).not.toBeInTheDocument()
      expect(rules.getByText('Tiempo').nextElementSibling).toHaveTextContent('50 min')
    }

    openTable(host, guest)
    expect(myLife(host)).toHaveAccessibleName(/8000/)
    expect(within(guest.container).getByRole('button', { name: /Puntos de vida de Ana: 8000/ })).toBeInTheDocument()
  })

  it('puntos de vida: se escriben sin separador de miles en inglés también (12000, no 12,000)', () => {
    applyLocale('en')

    try {
      const view = render(<LifeTile name="Yeou" life={12000} mine onClick={() => {}} />)

      expect(within(view.container).getByRole('button')).toHaveTextContent('12000')
      expect(view.container).not.toHaveTextContent('12,000')
    } finally {
      applyLocale('es')
    }
  })

  it('rendirse: pide confirmación, termina el duelo para los dos y la revancha de los dos vuelve a la sala con todo de cero', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos' }))
    const close = () => fireEvent.keyDown(document, { key: 'Escape' })

    openGames(guest)
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    // Cancelar no se rinde.
    fireEvent.click(panel().getByRole('button', { name: 'Cancelar' }))
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    expect(panel().getByText('¿Seguro? Gana Ana.')).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    flush()

    const hostResult = within(within(host.container).getByRole('dialog', { name: '¡Ganaste!' }))
    expect(hostResult.getByText('Beto se rindió.')).toBeInTheDocument()
    const guestResult = within(within(guest.container).getByRole('dialog', { name: 'Perdiste' }))
    expect(guestResult.getByText('Te rendiste.')).toBeInTheDocument()

    // Ana pide la revancha: Beto lo ve y la acepta.
    click(host, 'Revancha')
    flush()
    expect(within(host.container).getByText('Esperando a Beto…')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana quiere la revancha.')).toBeInTheDocument()
    click(guest, 'Revancha')
    flush()
    close()

    // De vuelta en la sala, elige quién va primero quien perdió (Beto), sin tirar nada: los dos ya estaban listos. Después cada uno reparte otra vez y el resultado se fue.
    expect(within(guest.container).getByText('Elegís vos, porque perdiste el duelo anterior.')).toBeInTheDocument()
    expect(within(host.container).getByText('Beto elige, porque perdió el duelo anterior.')).toBeInTheDocument()
    click(guest, 'Ir segundo')
    flush()
    flush()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    expect(within(guest.container).queryByText('Te rendiste.')).not.toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: /Puntos de vida de Ana: 8000/ })).toBeInTheDocument()
    // La revancha empieza con el reloj de nuevo: se reinició y vuelve a arrancar solo.
    expect(within(host.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
    flush()
    expect(within(guest.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
  })

  it('el robo del turno: al pasar el turno no se roba de más, y el que no empezó roba en su primer turno', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const hand = (view: RenderResult) => handOf(view).getAllByRole('listitem').length
    expect([hand(host), hand(guest)]).toEqual([5, 5])

    // Ana (la que empieza) termina su turno: su mesa pasa a la Draw Phase del turno siguiente pero todavía no le toca, así que no roba.
    passTurn(host)
    expect(hand(host)).toBe(5)
    // A Beto le empieza el primer turno: roba solo.
    expect(hand(guest)).toBe(6)

    // Beto termina el suyo: ahora a Ana le toca otra vez y roba; Beto no roba de más.
    passTurn(guest)
    expect(hand(host)).toBe(6)
    expect(hand(guest)).toBe(6)

    // Ana se arrepiente de pasar (deshace) y vuelve a pasar: Beto ya robó por ese turno y no roba otra vez.
    passTurn(host)
    expect(hand(guest)).toBe(7)
    click(host, 'Deshacer')
    flush()
    allowUndo()
    passTurnFromEnd(host)
    expect(hand(guest)).toBe(7)
  })

  it('la sala: cada uno ve si el otro tocó "Estoy listo", y se puede dejar de estarlo', () => {
    const { host, guest } = startDuel()

    expect(within(host.container).getByRole('button', { name: 'Estoy listo' })).toBeEnabled()
    click(host, 'Estoy listo')
    flush()

    // El invitado ve que Ana ya está lista; Ana, que todavía falta Beto.
    expect(within(guest.container).getAllByText('Listo')).toHaveLength(1)
    expect(within(guest.container).getByText('Todavía no')).toBeInTheDocument()
    expect(within(host.container).getByText('Esperando que Beto esté listo…')).toBeInTheDocument()

    // Ana se arrepiente.
    click(host, 'Ya no estoy listo')
    flush()
    expect(within(guest.container).queryByText('Listo')).not.toBeInTheDocument()
    // Hasta que los dos están listos no se ofrece cómo definir quién empieza.
    expect(within(host.container).queryByRole('button', { name: 'Moneda' })).not.toBeInTheDocument()
  })

  it('quién empieza: con la moneda pide cara o cruz quien la eligió; con el dado tiran los dos; y quien gana elige ir primero o segundo', () => {
    // Moneda: Ana la elige, Beto lo ve, Ana pide cara o cruz.
    const first = startDuel()
    click(first.host, 'Estoy listo')
    click(first.guest, 'Estoy listo')
    flush()
    click(first.host, 'Moneda')
    flush()
    expect(within(first.guest.container).getByText('Ana está eligiendo cara o cruz…')).toBeInTheDocument()
    expect(within(first.host.container).getByText('Elegí cara o cruz')).toBeInTheDocument()
    click(first.host, 'Cara')
    flush()
    // Gane quien gane, lo dicen los dos lados: uno elige y el otro espera.
    const hostChooses = within(first.host.container).queryByText('Ganaste: elegís vos.') !== null
    expect(within(first.host.container).getByText(hostChooses ? '¿Querés ir primero o segundo?' : 'Ganó Beto.')).toBeInTheDocument()
    expect(within(first.guest.container).getByText(hostChooses ? 'Ana está eligiendo quién va primero…' : '¿Querés ir primero o segundo?')).toBeInTheDocument()
    cleanup()
    window.history.replaceState(null, '', '#duel')
    sessionStorage.clear()

    // Dado: cada uno tira el suyo y los dos ven los dos números.
    const second = startDuel()
    click(second.host, 'Estoy listo')
    click(second.guest, 'Estoy listo')
    flush()
    click(second.guest, 'Dado')
    flush()
    const dice = (view: RenderResult) => view.container.querySelector('[data-stage="dice"]')
    // Antes de que nadie tire, los dos ven los dos lugares vacíos.
    expect(dice(second.host)?.textContent).toContain('?')
    click(second.host, 'Tirar el dado')
    flush()
    expect(within(second.guest.container).getByText('Ana ya tiró: te toca.')).toBeInTheDocument()
    expect(within(second.host.container).getByRole('button', { name: 'Tirar el dado' })).toBeDisabled()
    // El dado de Ana gira también en la pantalla de Beto, y el de Beto sigue vacío hasta que tire.
    expect(dice(second.guest)?.querySelectorAll('[class*="animate-die-spin"]')).toHaveLength(1)
    expect(dice(second.guest)?.textContent).toContain('?')
    click(second.guest, 'Tirar el dado')
    flush()
    // Ya tiraron los dos: cada uno ve los dos dados (sin lugares vacíos) y, sin empate, quién elige.
    for (const view of [second.host, second.guest]) {
      expect(dice(view)?.querySelectorAll('[class*="animate-die-spin"]')).toHaveLength(2)
      expect(dice(view)?.textContent).not.toContain('?')
    }
    const tied = within(second.host.container).queryByText(/^Empate en [1-6]: tiren de nuevo.$/) !== null
    if (!tied) {
      expect(within(second.host.container).queryByText('Ganaste: elegís vos.') ?? within(second.host.container).queryByText('Ganó Beto.')).not.toBeNull()
    }
  })

  it('piedra, papel o tijera en la sala: cuando eligieron los dos, los dos ven las dos manos a la vez', () => {
    const { host, guest } = startDuel()
    click(host, 'Estoy listo')
    click(guest, 'Estoy listo')
    flush()
    click(host, 'Piedra, papel o tijera')
    flush()
    const hands = (view: RenderResult) => view.container.querySelector('[data-stage="rps"]')

    // Con una sola elección todavía no se muestra ninguna mano (la del rival no se ve hasta elegir la propia).
    click(host, 'Piedra')
    flush()
    expect(hands(host)).toBeNull()
    expect(hands(guest)).toBeNull()

    click(guest, 'Tijera')
    flush()
    for (const view of [host, guest]) {
      expect(hands(view)?.textContent).toContain('✊')
      expect(hands(view)?.textContent).toContain('✌')
      expect(hands(view)?.querySelectorAll('[class*="animate-rps-reveal"]')).toHaveLength(2)
    }
  })

  it('en la mesa lo que tira el rival se ve girar aunque el panel de juegos esté cerrado, y las dos manos al cerrarse una ronda de piedra-papel-tijera', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const overlay = () => document.querySelector('[role="status"].fixed')
    expect(overlay()).toBeNull()

    // Ana tira la moneda con su panel: Beto la ve en el centro de su pantalla, sin abrir nada.
    openGames(host)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Juegos' })).getByRole('button', { name: 'Tirar la moneda' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(guest.container).queryByRole('dialog')).not.toBeInTheDocument()
    expect(overlay()?.textContent).toMatch(/Ana: (Cara|Cruz)/)
  })

  it('puntos de vida: la calculadora del duelo muestra cómo quedan antes de aplicar, resta o suma, la mitad se aplica sola y las del rival se ven pero no se eligen', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const key = (name: string | RegExp) => fireEvent.click(within(screen.getByRole('group', { name: 'Teclado' })).getByRole('button', { name }))
    const apply = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
    const lifeOfAna = (view: RenderResult) => within(view.container).getByRole('button', { name: /Puntos de vida de Ana/ })

    // Las dos vidas abren la calculadora: la tuya (elegida) y la del rival, que se ve pero no se elige. Es la misma de la herramienta, sin salir del duelo.
    openCalculator(host)
    expect(calculator().getByRole('button', { name: /^Ana: 8000 LP\. Elegido/ })).toHaveAttribute('aria-pressed', 'true')
    const rivalPanel = calculator().getByRole('button', { name: 'Beto: 8000 LP' })
    expect(rivalPanel).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(rivalPanel)
    expect(calculator().getByRole('button', { name: /^Ana: 8000 LP\. Elegido/ })).toBeInTheDocument()
    // Sin reiniciar, deshacer, moneda y dado (el duelo trae los suyos) ni reiniciar el reloj.
    expect(calculator().queryByRole('button', { name: 'Reiniciar' })).not.toBeInTheDocument()
    expect(calculator().queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()

    // "8" es 800: se ve cómo quedaría (8000 − 800) y recién al aplicar cambia (y el rival lo ve).
    key('8')
    expect(calculator().getByRole('status', { name: 'Ana: 8000 menos 800' })).toBeInTheDocument()
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/8000/)
    apply(/^Aplicar: restar 800/)
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/7200/)
    expect(calculator().getByRole('button', { name: /^Ana: 7200 LP/ })).toBeInTheDocument()

    // Sumar: "+" y un monto; sin monto «=» está apagado.
    expect(screen.getByRole('button', { name: /^Aplicar: restar 0/ })).toBeDisabled()
    key('Sumar')
    key('5')
    apply(/^Aplicar: sumar 500/)
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/7700/)

    // La mitad se aplica sola y la calculadora sigue abierta, con el número nuevo.
    key(/Dejar a Ana con la mitad/)
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/3850/)
    expect(calculator().getByRole('button', { name: /^Ana: 3850 LP/ })).toBeInTheDocument()

    // Lo que cambia el rival se ve en mi calculadora en el momento (sincronizada con el duelo).
    closeCalculator()
    openCalculator(guest)
    key('1')
    key('0')
    apply(/^Aplicar: restar 1000/)
    flush()
    closeCalculator()
    openCalculator(host)
    expect(calculator().getByRole('button', { name: 'Beto: 7000 LP' })).toBeInTheDocument()
    closeCalculator()
    expect(screen.queryByRole('dialog', { name: 'Calculadora de LP' })).not.toBeInTheDocument()
  })

  it('el chat: desde la sala y desde la mesa, con un contador de lo que no leíste', () => {
    const { host, guest } = startDuel()

    // En la sala el chat está siempre a un toque (también antes de que entre el rival), en una hoja que se abre desde «Chat».
    const roomChat = (view: RenderResult) => {
      click(view, 'Chat')

      return within(screen.getByRole('dialog', { name: 'Chat' }))
    }
    const closeChat = () => fireEvent.keyDown(document, { key: 'Escape' })

    let inChat = roomChat(host)
    fireEvent.change(inChat.getByLabelText('Escribí un mensaje'), { target: { value: 'Hola, ya entro' } })
    fireEvent.click(inChat.getByRole('button', { name: 'Enviar' }))
    flush()
    closeChat()
    inChat = roomChat(guest)
    expect(inChat.getByText('Hola, ya entro')).toBeInTheDocument()

    // Un mensaje rápido va con un toque. Las señales, sólo con su emoji (🤔 pensando, 👍 continuá): nada de una lista larga ni de texto.
    const quick = inChat.getByRole('group', { name: 'Mensajes rápidos' })
    expect(within(quick).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Pensando…', 'Continuá'])
    for (const button of within(quick).getAllByRole('button')) {
      // Sin texto: sólo el emoji (y, tras apretarlo, su copia que sube).
      expect(button.textContent).toMatch(/^\p{Extended_Pictographic}+$/u)
      // Grandes: el emoji de 33 px en un botón de 56 (con el pulgar se acierta y se ve lo que se manda).
      expect(button).toHaveClass('h-14', 'w-14', 'text-stat')
    }
    fireEvent.click(within(quick).getByRole('button', { name: 'Pensando…' }))
    flush()
    // Una señal cada 3 segundos: tras mandar una, las dos quedan apagadas hasta que pase el plazo (así no se spamean).
    expect(within(quick).getByRole('button', { name: 'Continuá' })).toBeDisabled()
    expect(within(quick).getByRole('button', { name: 'Pensando…' })).toBeDisabled()
    closeChat()

    const hostLog = roomChat(host).getByRole('log', { name: 'Chat con Beto' })
    // Un emoji solo se ve grande, como una reacción.
    expect(within(hostLog).getByText('🤔', { exact: false })).toHaveClass('text-display')
    closeChat()

    openTable(host, guest)

    // En la mesa el chat se abre desde la barra; con el chat cerrado el botón cuenta lo que llegó.
    click(host, 'Chat')
    const chat = () => within(screen.getByRole('dialog', { name: 'Chat con Beto' }))
    fireEvent.change(chat().getByLabelText('Escribí un mensaje'), { target: { value: '¿Respondés a mi invocación?' } })
    fireEvent.click(chat().getByRole('button', { name: 'Enviar' }))
    flush()
    expect(chat().getByText('¿Respondés a mi invocación?')).toBeInTheDocument()

    expect(within(guest.container).getByRole('button', { name: 'Chat (1 sin leer)' })).toBeInTheDocument()
    click(guest, /^Chat/)
    expect(within(screen.getAllByRole('dialog', { name: 'Chat con Ana' }).at(-1)!).getByText('¿Respondés a mi invocación?')).toBeInTheDocument()
  })

  it('si el rival mira su Extra Deck o su deck se ve sobre la línea del registro mientras lo mira, y se va cuando termina', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    expect(within(host.container).queryByText(/está mirando/)).not.toBeInTheDocument()

    fireEvent.click(within(guest.container).getByRole('button', { name: /^Extra: \d+/ }))
    flush()
    expect(within(host.container).getByText('Beto está mirando su Extra Deck')).toBeInTheDocument()

    // Y él, lo mismo conmigo.
    expect(within(guest.container).queryByText(/está mirando/)).not.toBeInTheDocument()
    fireEvent.click(within(host.container).getByRole('button', { name: /^GY: \d+/ }))
    flush()
    expect(within(guest.container).getByText('Ana está mirando su cementerio')).toBeInTheDocument()

    // Al cerrar el visor, el aviso se va.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    flush()
    expect(within(host.container).queryByText('Beto está mirando su Extra Deck')).not.toBeInTheDocument()
  })

  it('el chat: lo que llega entra con su animación y lo que ya estaba al abrirlo se ve quieto', () => {
    const { host, guest } = startDuel()
    const closeChat = () => fireEvent.keyDown(document, { key: 'Escape' })
    const write = (view: RenderResult, text: string) => {
      click(view, 'Chat')
      const dialog = within(screen.getByRole('dialog', { name: 'Chat' }))
      fireEvent.change(dialog.getByLabelText('Escribí un mensaje'), { target: { value: text } })
      fireEvent.click(dialog.getByRole('button', { name: 'Enviar' }))
      flush()

      return dialog
    }
    const bubble = (dialog: ReturnType<typeof within>, text: string) => dialog.getByText(text, { exact: false }).closest('li')!

    write(guest, 'Primero')
    closeChat()

    // Al abrir el chat, lo escrito antes está quieto; lo que se escribe con él abierto entra con su animación.
    click(host, 'Chat')
    const hostChat = within(screen.getByRole('dialog', { name: 'Chat' }))
    expect(bubble(hostChat, 'Primero')).not.toHaveClass('motion-safe:animate-message-in')
    fireEvent.change(hostChat.getByLabelText('Escribí un mensaje'), { target: { value: 'Segundo' } })
    fireEvent.click(hostChat.getByRole('button', { name: 'Enviar' }))
    flush()
    expect(bubble(hostChat, 'Segundo')).toHaveClass('motion-safe:animate-message-in', 'origin-bottom-right')
    expect(bubble(hostChat, 'Primero')).not.toHaveClass('motion-safe:animate-message-in')
  })

  it('las fases y el turno: los dos ven en qué fase va quien juega, el rival ve el cartel de cada fase y, al terminar el turno, el de "Tu turno"', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const phase = (view: RenderResult) => within(view.container).getByTestId('duel-phase').textContent
    const banner = (view: RenderResult) => view.container.querySelector('[data-fx="banner"]')?.textContent ?? ''

    expect(phase(host)).toBe(' · Draw Phase')
    expect(phase(guest)).toBe(' · Draw Phase')

    // Ana pasa a la Main Phase 1: Beto lo ve en la barra y en un cartel con el nombre de Ana.
    click(host, 'Main Phase 1')
    flush()
    expect(phase(host)).toBe(' · Main Phase 1')
    expect(phase(guest)).toBe(' · Main Phase 1')
    expect(banner(guest)).toContain('Ana')
    expect(banner(guest)).toContain('Main Phase 1')

    // Las fases son una sola para los dos y sólo las toca quien tiene el turno: Beto las ve (encendidas igual que Ana) pero no puede cambiarlas.
    expect(phaseChip(guest)).toBeDisabled()
    expect(phaseChip(guest)).toHaveAccessibleName('Fases: Main Phase 1')
    expect(phaseChip(guest)).toHaveTextContent('M1')
    expect(phaseChip(host)).toBeEnabled()

    // La End Phase se juega: llegar a ella no pasa el turno ni le hace robar a Beto.
    const handOfGuest = handOf(guest).getAllByRole('listitem').length
    click(host, 'End Phase')
    flush()
    expect(phase(guest)).toBe(' · End Phase')
    expect(within(guest.container).queryByText('Tu turno')).not.toBeInTheDocument()
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(handOfGuest)
    expect(phaseChip(guest)).toBeDisabled()
    expect(phaseChip(guest)).toHaveAccessibleName('Fases: End Phase')
    // Para Ana, en el celular, llegar a la End Phase pregunta si termina el turno (no hay «Pasar turno»).
    expect(within(host.container).queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: '¿Terminar tu turno?' })).toBeInTheDocument()

    // Ana lo termina: ahí sí pasa el turno, Beto ve el cartel y roba, y ahora las fases son de él.
    confirmEndTurn()
    expect(within(host.container).getAllByText('Turno de Beto').length).toBeGreaterThan(0)
    expect(within(guest.container).getAllByText('Tu turno').length).toBeGreaterThan(0)
    expect(phase(guest)).toBe(' · Draw Phase')
    expect(phase(host)).toBe(' · Draw Phase')
    expect(banner(guest)).toContain('Tu turno')
    expect(banner(host)).toContain('Turno de Beto')
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(handOfGuest + 1)
    expect(phaseChip(host)).toBeDisabled()
    expect(phaseChip(guest)).toBeEnabled()

    // Y Beto juega su turno: Ana lo ve fase por fase.
    click(guest, 'Battle Phase')
    flush()
    expect(phase(host)).toBe(' · Battle Phase')
    expect(phaseChip(host)).toHaveAccessibleName('Fases: Battle Phase')
  })

  it('en escritorio la barra tiene un botón de ventana grande (el duelo en toda la pantalla), que se apaga al tocarlo otra vez', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    const on = within(host.container).getByRole('button', { name: 'Ventana grande' })
    expect(on).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(on)
    expect(within(host.container).getByRole('button', { name: 'Salir de la ventana grande' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(host.container).getByRole('button', { name: 'Salir de la ventana grande' }))
    expect(within(host.container).getByRole('button', { name: 'Ventana grande' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('en el celular no hay botón de ventana grande: la mesa ya ocupa toda la pantalla', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    expect(within(host.container).queryByRole('button', { name: 'Ventana grande' })).not.toBeInTheDocument()
  })

  it('pasar de fase le pregunta al rival si no va a hacer nada más: él ve la pregunta en el medio de la pantalla y deja pasar o juega antes, y quien pasa espera con la fase sin cambiar', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel()
    openTable(host, guest)
    const lane = (view: RenderResult, kind: string) => view.container.querySelector<HTMLElement>(`[data-lane="${kind}"]`)
    /** La pregunta del rival de pasar de fase: va en el medio de la mesa, no con los avisos de arriba. */
    const prompt = (view: RenderResult) => view.container.querySelector<HTMLElement>('[data-prompt="passAsked"]')
    const chip = (view: RenderResult) => within(view.container).getByRole('button', { name: /^Fases:/ })

    // Ana toca la Battle Phase: la fase no cambia hasta que Beto conteste; él ve la pregunta (sin diálogo que tape la mesa).
    fireEvent.click(phaseChip(host))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Battle Phase/ }))
    flush()
    expect(chip(host)).toHaveAccessibleName(/Main Phase 1|Draw Phase|Standby Phase/)
    expect(lane(host, 'passAsking')).toHaveTextContent('Le preguntás a Beto si no hace nada más…')
    expect(prompt(guest)).toHaveTextContent('Ana quiere pasar a la Battle Phase. ¿Hacés algo antes?')
    // En el medio de la pantalla (la capa de la mesa que centra), no sobre la línea del registro de arriba; ni Ana la ve.
    expect(prompt(guest)!.closest('[data-testid="duel-prompt-layer"]')).toHaveClass('place-items-center')
    expect(lane(guest, 'passAsked')).toBeNull()
    expect(prompt(host)).toBeNull()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // Beto quiere jugar antes: la fase no pasa y Ana se entera un rato.
    fireEvent.click(within(prompt(guest)!).getByRole('button', { name: 'Jugar antes' }))
    flush()
    expect(prompt(guest)).toBeNull()
    expect(lane(host, 'passHeld')).toHaveTextContent('Beto quiere jugar antes de que pases de fase.')
    expect(chip(host)).not.toHaveAccessibleName(/Battle Phase/)
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(lane(host, 'passHeld')).toBeNull()

    // Lo vuelve a intentar y Beto lo deja pasar: la fase pasa en las dos pantallas.
    fireEvent.click(phaseChip(host))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Battle Phase/ }))
    flush()
    fireEvent.click(within(prompt(guest)!).getByRole('button', { name: 'Dejar pasar' }))
    flush()
    expect(chip(host)).toHaveAccessibleName(/Battle Phase/)
    expect(chip(guest)).toHaveAccessibleName(/Battle Phase/)
    expect(lane(host, 'passAsking')).toBeNull()
  })

  it('cuando el rival pregunta si hacés algo antes, las cartas tuyas que pueden responder brillan en ámbar y el aviso las nombra; sin la pregunta, nada brilla', async () => {
    // Todas las cartas de Beto tienen un efecto rápido confirmado que se activa desde la mano y sin condición.
    await loadCardEffectMap()
    setCardEffectMapForTests(new Map([[2, [[0, EFFECT_FACT.quick | EFFECT_FACT.cost, EFFECT_PLACE.hand]]]]))

    try {
      const quickMonster = { ...effectMonster, ygoprodeckId: 2, description: '(Quick Effect): You can discard this card; draw 1 card.' } as unknown as ApiCardReference
      const quick = new Map([...monsters].map(([id, entry]) => [id, { ...entry, apiCard: quickMonster }]))
      const { host, guest } = startDuel({ cardsById: quick })
      openTable(host, guest)
      const prompt = (view: RenderResult) => view.container.querySelector<HTMLElement>('[data-prompt="passAsked"]')
      const glowing = (view: RenderResult) => view.container.querySelectorAll('[data-glow-kind="respond"]').length

      expect(glowing(guest)).toBe(0)

      fireEvent.click(phaseChip(host))
      fireEvent.click(screen.getByRole('menuitem', { name: /^Battle Phase/ }))
      flush()
      // La mano de Beto (cinco cartas distintas por nombre) brilla y el aviso nombra a dos y «y 3 más».
      expect(prompt(guest)).toHaveTextContent(/^Ana quiere pasar a la Battle Phase\. Podés responder con Monstruo \d+, Monstruo \d+ y 3 más\./)
      expect(glowing(guest)).toBe(5)
      // Ana no recibe la pregunta: no se le resalta nada.
      expect(glowing(host)).toBe(0)

      fireEvent.click(within(prompt(guest)!).getByRole('button', { name: 'Dejar pasar' }))
      flush()
      expect(glowing(guest)).toBe(0)
    } finally {
      setCardEffectMapForTests(null)
    }
  })

  it('cuando el rival activa una carta, las cartas tuyas cuyo efecto rápido esperaba una activación brillan en ámbar y un aviso sobre la línea del registro las nombra, un rato; si jugás algo, se va', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Todas las cartas tienen un efecto rápido confirmado que se activa desde la mano y que espera que el rival active una carta o un efecto.
    await loadCardEffectMap()
    setCardEffectMapForTests(new Map([[2, [[0, EFFECT_FACT.quick | EFFECT_FACT.cost, EFFECT_PLACE.hand]]]]))

    try {
      const waiting = { ...effectMonster, ygoprodeckId: 2, description: 'When your opponent activates a card or effect (Quick Effect): You can discard this card; negate that effect.' } as unknown as ApiCardReference
      const cards = new Map([...monsters].map(([id, entry]) => [id, { ...entry, apiCard: waiting }]))
      const { host, guest } = startDuel({ cardsById: cards })
      openTable(host, guest)
      const lane = (view: RenderResult, kind: string) => view.container.querySelector<HTMLElement>(`[data-lane="${kind}"]`)
      const glowing = (view: RenderResult) => view.container.querySelectorAll('[data-glow-kind="respond"]').length

      summonFirst(host)
      flush()
      // Invocar no es activar: no hay a qué responder.
      await act(async () => {})
      expect(lane(guest, 'chain')).toBeNull()
      expect(glowing(guest)).toBe(0)

      // Ana activa el efecto de su monstruo (y la carta pasa a ser pública): Beto puede responder con las cinco de su mano.
      tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      flush()
      await act(async () => {})
      expect(lane(guest, 'chain')).toHaveTextContent(/^Ana activó Carta \d+\. Podés responder con Monstruo \d+, Monstruo \d+ y 3 más\./)
      expect(glowing(guest)).toBe(5)
      // Ana (quien activó) no recibe nada.
      expect(lane(host, 'chain')).toBeNull()
      expect(glowing(host)).toBe(0)

      // Se va solo a los ocho segundos.
      act(() => {
        vi.advanceTimersByTime(8100)
      })
      expect(lane(guest, 'chain')).toBeNull()
      expect(glowing(guest)).toBe(0)

      // Otra activación y Beto juega algo (roba): la ventana se cierra.
      tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      flush()
      await act(async () => {})
      expect(lane(guest, 'chain')).not.toBeNull()
      tap(within(guest.container).getByRole('button', { name: /^Main: \d+/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
      flush()
      expect(lane(guest, 'chain')).toBeNull()
      expect(glowing(guest)).toBe(0)
    } finally {
      setCardEffectMapForTests(null)
    }
  })

  it('el aviso de cadena también dice cuál efecto activó el rival, si eligió uno entre varios', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await loadCardEffectMap()
    // Dos efectos: el primero roba; el segundo es rápido, se activa desde la mano y espera que el rival active algo.
    const twoEffects = 'If this card is Normal Summoned: You can draw 1 card. When your opponent activates a card or effect (Quick Effect): You can discard this card; negate that effect.'
    const [draw, quick] = effectSentences(twoEffects)

    setCardEffectMapForTests(
      new Map([
        [
          2,
          [
            [draw!.start, 0, 0],
            [quick!.start, EFFECT_FACT.quick | EFFECT_FACT.cost, EFFECT_PLACE.hand],
          ],
        ],
      ]),
    )

    try {
      const waiting = { ...effectMonster, ygoprodeckId: 2, description: twoEffects } as unknown as ApiCardReference
      const cards = new Map([...monsters].map(([id, entry]) => [id, { ...entry, apiCard: waiting }]))
      const { host, guest } = startDuel({ cardsById: cards })
      openTable(host, guest)
      const lane = (view: RenderResult) => view.container.querySelector<HTMLElement>('[data-lane="chain"]')

      summonFirst(host)
      flush()
      await act(async () => {})

      // Ana activa el efecto 1 (el que roba): Beto, que puede responder con el rápido de sus cartas, ve cuál efecto es.
      tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /^Efecto 1 · / }))
      flush()
      await act(async () => {})
      expect(lane(guest)).toHaveTextContent(/^Ana activó el efecto 1 de Carta \d+\. Podés responder con Monstruo \d+, Monstruo \d+ y 3 más\./)
    } finally {
      setCardEffectMapForTests(null)
    }
  })

  it('las fases son un solo botón en el centro del campo (la fase de ahora): al tocarlo muestra las seis y elegir una pasa a ella; sin el turno no abre', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    // No hay seis botones sueltos: el botón dice la fase de ahora y, tocado, ofrece todas.
    expect(within(host.container).queryByRole('button', { name: 'Battle Phase' })).not.toBeInTheDocument()
    expect(phaseChip(host)).toHaveTextContent('DP')
    fireEvent.click(phaseChip(host))
    // Sin información de más: el menú no repite la fase de ahora como título, la marca en la lista.
    const menu = screen.getByRole('menu', { name: 'Fases' })
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Draw Phase', 'Standby Phase', 'Main Phase 1', 'Battle Phase', 'Main Phase 2', 'End Phase'])
    expect(within(menu).getAllByText('Draw Phase')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'Draw Phase' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('menuitem', { name: 'Battle Phase' })).not.toHaveAttribute('aria-current')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Battle Phase' }))
    letPass()
    expect(phaseChip(host)).toHaveTextContent('BP')
    expect(phaseChip(guest)).toHaveTextContent('BP')
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

    // Quien no tiene el turno ve la fase pero no abre nada.
    fireEvent.click(phaseChip(guest))
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('en el celular no hay «Pasar turno»: llegar a la End Phase pregunta si se termina el turno; «Seguir jugando» no lo termina y hay que volver a tocar el botón de la End Phase; la fase va ámbar si el turno es tuyo y violeta si es del rival', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const phase = (view: RenderResult) => within(view.container).getByTestId('duel-phase').textContent
    const ask = () => screen.getByRole('alertdialog', { name: '¿Terminar tu turno?' })

    expect(within(host.container).queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
    // La fase de ahora va en ámbar si el turno es tuyo (lo que se toca) y la misma, vista por Beto, en violeta (es del rival).
    click(host, 'Main Phase 1')
    flush()
    expect(phaseChip(host)).toHaveClass('bg-info')
    expect(phaseChip(guest)).toHaveClass('bg-accent')

    // En la Main Phase 1 el botón abre las fases; llegar a la End Phase pregunta si se termina el turno, y «Seguir jugando» deja todo como está.
    click(host, 'End Phase')
    flush()
    expect(within(ask()).getByText('El turno pasa a Beto.')).toBeInTheDocument()
    fireEvent.click(within(ask()).getByRole('button', { name: 'Seguir jugando' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(phase(guest)).toBe(' · End Phase')
    expect(within(guest.container).queryByText('Tu turno')).not.toBeInTheDocument()

    // Para darle el turno a Beto hay que volver a tocar el botón de la End Phase (ya no abre las fases: pregunta).
    fireEvent.click(phaseChip(host))
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    confirmEndTurn()
    expect(within(guest.container).getAllByText('Tu turno').length).toBeGreaterThan(0)
    expect(phase(guest)).toBe(' · Draw Phase')
    expect(phaseChip(guest)).toHaveClass('bg-info')
    expect(phaseChip(host)).toHaveClass('bg-accent')
  })

  it('en escritorio «Pasar turno» no está hasta llegar a la End Phase y entonces aparece justo debajo del botón de las fases, sin preguntar', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    const pass = (view: RenderResult) => within(view.container).queryByRole('button', { name: 'Pasar turno' })

    expect(pass(host)).not.toBeInTheDocument()
    expect(pass(guest)).not.toBeInTheDocument()
    click(host, 'Main Phase 1')
    flush()
    expect(pass(host)).not.toBeInTheDocument()

    // En la End Phase aparece sólo para quien tiene el turno, en la casilla del botón de las fases (absoluto: no corre nada) y sin pregunta.
    click(host, 'End Phase')
    flush()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(pass(guest)).not.toBeInTheDocument()
    expect(pass(host)).toBeInTheDocument()
    expect(pass(host)!.parentElement).toBe(phaseChip(host).parentElement)
    expect(pass(host)).toHaveClass('absolute')
    // Ya no está abajo a la derecha: ahí quedan deshacer y tus vidas.
    expect(within(within(host.container).getByRole('toolbar')).queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()

    fireEvent.click(pass(host)!)
    letPass()
    expect(within(guest.container).getAllByText('Tu turno').length).toBeGreaterThan(0)
    expect(pass(host)).not.toBeInTheDocument()
  })

  it('el registro del duelo: lo escrito, el comienzo de cada turno y lo que hizo cada uno van en orden en el chat, y la línea sobre el campo muestra lo último que se jugó (no lo escrito: eso le llega como un mensaje) y lo abre', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    // Sin nada que mostrar, la línea del registro no ocupa lugar.
    expect(within(host.container).queryByRole('button', { name: 'Abrir el registro de jugadas' })).not.toBeInTheDocument()

    // Ana invoca y pasa el turno y Beto escribe: la línea de Ana muestra lo último que jugó ella y no lo escrito (eso le llega como un mensaje entrante y en el contador del chat; en la línea salía dos veces).
    const summoned = summonFirst(host)
    flush()
    passTurn(host)
    click(guest, 'Chat')
    const guestChat = () => within(screen.getByRole('dialog', { name: 'Chat con Ana' }))
    fireEvent.change(guestChat().getByLabelText('Escribí un mensaje'), { target: { value: 'Dale, mi turno' } })
    fireEvent.click(guestChat().getByRole('button', { name: 'Enviar' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    const line = within(host.container).getByRole('button', { name: /^Abrir el registro de jugadas: / })
    expect(line).toHaveTextContent(summoned)
    expect(line).not.toHaveTextContent('Dale, mi turno')

    // Tocarla abre el chat, con lo jugado, el comienzo del turno y lo escrito en el orden en que pasó.
    click(host, /^Abrir el registro de jugadas/)
    const log = within(within(screen.getByRole('dialog', { name: 'Chat con Beto' })).getByRole('log'))
    const rows = log.getAllByRole('listitem').map((row) => row.textContent)
    expect(rows.at(-2)).toBe('Turno 2 · Beto')
    expect(rows.at(-1)).toContain('Dale, mi turno')
  })

  it('el registro no repite el comienzo de un turno al deshacer y volver a pasarlo, ni anota el turno que retrocede', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    passTurn(host)
    click(host, 'Deshacer')
    flush()
    allowUndo()
    passTurnFromEnd(host)

    click(guest, 'Chat')
    const rows = within(within(screen.getByRole('dialog', { name: 'Chat con Ana' })).getByRole('log'))
      .getAllByRole('listitem')
      .map((row) => row.textContent)
    expect(rows.filter((text) => text?.startsWith('Turno'))).toEqual(['Turno 2 · Beto'])
  })

})
