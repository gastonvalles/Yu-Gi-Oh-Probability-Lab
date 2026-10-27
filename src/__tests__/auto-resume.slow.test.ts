import createCore, { OcgLocation, OcgPosition, OcgProcessResult, OcgQueryFlags, OcgResponseType as R, ocgMessageTypeStrings, type OcgCoreSync, type OcgDuelHandle, type OcgMessage } from 'ocgcore-wasm'
import { describe, expect, it } from 'vitest'
import { MR5 } from '../app/auto/auto-session'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Evidencia (lenta, con el núcleo real) de qué se puede y qué no al armar un duelo del núcleo desde una mesa arbitraria (pasar de manual a automático; no está construido):
 * antes de `startDuel`, `duelNewCard` pone cada carta en cualquier lugar y posición (campo, colocadas, mano, cementerio, destierro, deck en orden con `PSEUDO_SHUFFLE`,
 * Extra), `startingLP` fija las vidas y la biblioteca Lua `Debug` del modo puzzle de EDOPro (`libdebug.cpp`, cargada por `loadScript`) completa el resto: materiales Xyz
 * (`AddCard` sobre una casilla ocupada), equipos (`PreEquip`), contadores (`PreAddCounter`), zonas de Péndulo, Extra boca arriba, campo, y la invocación hecha bien
 * (`AddCard(..., true)`). Lo que no se puede fijar: el turno (siempre 1), la fase (arranca en la DP del jugador 0; la Battle Phase del turno 1 pide `ATTACK_FIRST_TURN`),
 * quién tiene el turno (sólo poniéndolo de asiento 0), y todo lo del turno en curso (Invocación Normal hecha, ataques declarados, «una vez por turno» usados, lo colocado
 * o invocado este turno, cadenas, modificadores temporales): el núcleo rearmado lo cuenta como si el turno recién empezara. Los valores de Lua se leen con el error de un
 * script (`error(...)` llega al `errorHandler`).
 */
const BEWD = 89631139
const DM = 46986414
const GEMINI = 69140098
const STONE = 13039848
const MST = 5318639
const MIRROR = 44095762
const POT = 55144522
const AXE = 40619825
const SKULL = 70781052
const LEVIATHAN = 69610924
const ODDEYES = 16178681
const PLASMA = 18161786
const DECK0 = [GEMINI, BEWD, DM, GEMINI, GEMINI, POT, GEMINI, GEMINI, GEMINI, GEMINI]
const PSEUDO_SHUFFLE = 16n
const ATTACK_FIRST_TURN = 2n

describe.skipIf(!hasCoreData)('rearmar el núcleo desde una mesa (investigación)', () => {
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const errors: string[] = []
  const newCard = (lib: OcgCoreSync, handle: OcgDuelHandle, team: 0 | 1, code: number, location: number, sequence: number, position: number) => lib.duelNewCard(handle, { team, duelist: 0, code, controller: team, location: location as never, sequence, position: position as never })

  async function build(flags: bigint, lua: string | null, lp: [number, number] = [6400, 7200]) {
    errors.length = 0
    const lib = await createCore({ sync: true, wasmBinary: wasm })
    const handle = lib.createDuel({
      flags,
      seed: [1n, 2n, 3n, 4n],
      team1: { startingLP: lp[0], startingDrawCount: 0, drawCountPerTurn: 1 },
      team2: { startingLP: lp[1], startingDrawCount: 0, drawCountPerTurn: 1 },
      cardReader: (code) => cards.get(code) ?? null,
      scriptReader: (name) => store.read(name),
      errorHandler: (type, text) => void errors.push(`${type}: ${text}`),
    })!

    expect(handle).toBeTruthy()
    for (const name of ['constant.lua', 'utility.lua']) expect(lib.loadScript(handle, name, store.read(name)!)).toBe(true)
    // El jugador 0: dos monstruos boca arriba, una trampa colocada, un Juego Rápido colocado, dos en la mano, una en el cementerio, una desterrada y el deck en orden.
    newCard(lib, handle, 0, BEWD, OcgLocation.MZONE, 2, OcgPosition.FACEUP_ATTACK)
    newCard(lib, handle, 0, DM, OcgLocation.MZONE, 0, OcgPosition.FACEUP_DEFENSE)
    newCard(lib, handle, 0, MIRROR, OcgLocation.SZONE, 1, OcgPosition.FACEDOWN)
    newCard(lib, handle, 0, MST, OcgLocation.SZONE, 3, OcgPosition.FACEDOWN)
    newCard(lib, handle, 0, GEMINI, OcgLocation.HAND, 0, OcgPosition.FACEDOWN)
    newCard(lib, handle, 0, POT, OcgLocation.HAND, 0, OcgPosition.FACEDOWN)
    newCard(lib, handle, 0, STONE, OcgLocation.GRAVE, 0, OcgPosition.FACEUP)
    newCard(lib, handle, 0, STONE, OcgLocation.REMOVED, 0, OcgPosition.FACEUP)
    for (const code of [...DECK0].reverse()) newCard(lib, handle, 0, code, OcgLocation.DECK, 0, OcgPosition.FACEDOWN_DEFENSE)
    newCard(lib, handle, 0, LEVIATHAN, OcgLocation.EXTRA, 0, OcgPosition.FACEDOWN_DEFENSE)
    // El jugador 1: un monstruo boca arriba y su deck.
    newCard(lib, handle, 1, SKULL, OcgLocation.MZONE, 2, OcgPosition.FACEUP_ATTACK)
    for (let i = 0; i < 10; i += 1) newCard(lib, handle, 1, GEMINI, OcgLocation.DECK, 0, OcgPosition.FACEDOWN_DEFENSE)
    if (lua !== null) expect(lib.loadScript(handle, 'resume.lua', lua), errors.join('\n')).toBe(true)
    lib.startDuel(handle)

    return { lib, handle }
  }

  /** Corre hasta la próxima pregunta que no sea una ventana de cadena (ésas se pasan, como «Nunca» en la pantalla); devuelve los mensajes y la pregunta. */
  function run(lib: OcgCoreSync, handle: OcgDuelHandle): { seen: string[]; question: (OcgMessage & Record<string, unknown>) | null; status: number } {
    const seen: string[] = []
    let question: (OcgMessage & Record<string, unknown>) | null = null
    let status: number = OcgProcessResult.CONTINUE

    while (status === OcgProcessResult.CONTINUE && !question) {
      status = lib.duelProcess(handle)
      for (const message of lib.duelGetMessage(handle)) {
        const name = ocgMessageTypeStrings.get(message.type as never) as string

        seen.push(name)
        if (name === 'select_chain') {
          lib.duelSetResponse(handle, { type: R.SELECT_CHAIN, index: null })
          status = OcgProcessResult.CONTINUE
        } else if (name.startsWith('select_') || name.startsWith('announce_') || name === 'sort_card') question = message as never
      }
    }

    return { seen, question, status }
  }

  /** Lee un valor de Lua: el error del script llega al `errorHandler`. */
  function peek(lib: OcgCoreSync, handle: OcgDuelHandle, expr: string): string {
    errors.length = 0
    lib.loadScript(handle, `peek${Math.random()}.lua`, `error('PEEK=' .. tostring(${expr}))`)

    return errors.find((text) => text.includes('PEEK='))?.replace(/^.*PEEK=/, '') ?? `(sin respuesta: ${errors.join(' | ')})`
  }

  it('duelNewCard arma el campo en cualquier lugar; el núcleo arranca en el turno 1 del jugador 0 y pregunta en su Main Phase 1 con las jugadas de esa mesa', async () => {
    const { lib, handle } = await build(BigInt(MR5) | PSEUDO_SHUFFLE | ATTACK_FIRST_TURN, null)
    const first = run(lib, handle)

    console.log('mensajes hasta la primera pregunta:', first.seen.join(' '))
    expect(first.question?.type && ocgMessageTypeStrings.get(first.question.type as never)).toBe('select_idlecmd')
    expect(first.question?.player).toBe(0)
    const field = lib.duelQueryField(handle)
    const p0 = field.players[0]

    expect(p0.monsters.map((card) => (card ? card.position : 0))).toEqual([OcgPosition.FACEUP_DEFENSE, 0, OcgPosition.FACEUP_ATTACK, 0, 0, 0, 0])
    expect(p0.spells.map((card) => (card ? card.position : 0))).toEqual([0, OcgPosition.FACEDOWN, 0, OcgPosition.FACEDOWN, 0, 0, 0, 0])
    console.log('tamaños:', JSON.stringify({ deck: p0.deck_size, hand: p0.hand_size, grave: p0.grave_size, banish: p0.banish_size, extra: p0.extra_size }))
    expect({ deck: p0.deck_size, hand: p0.hand_size, grave: p0.grave_size, banish: p0.banish_size, extra: p0.extra_size }).toEqual({ deck: 10, hand: 2, grave: 1, banish: 1, extra: 1 })
    expect(field.players[1].monsters[2]?.position).toBe(OcgPosition.FACEUP_ATTACK)
    // El deck quedó en el orden dado (PSEUDO_SHUFFLE): el núcleo lo lista de abajo hacia arriba (el de arriba, `sequence 0` al agregarlo, es el último).
    const deck = lib.duelQueryLocation(handle, { flags: OcgQueryFlags.CODE as never, controller: 0, location: OcgLocation.DECK })

    console.log('deck:', JSON.stringify(deck.map((card) => card?.code)))
    expect(deck.map((card) => card?.code)).toEqual([...DECK0].reverse())
    // Lo que el núcleo cree: vidas, turno, fase, de quién es el turno.
    const state = { lp: [peek(lib, handle, 'Duel.GetLP(0)'), peek(lib, handle, 'Duel.GetLP(1)')], turn: peek(lib, handle, 'Duel.GetTurnCount()'), phase: peek(lib, handle, 'Duel.GetCurrentPhase()'), player: peek(lib, handle, 'Duel.GetTurnPlayer()') }

    console.log('estado del núcleo:', JSON.stringify(state))
    expect(state).toEqual({ lp: ['6400', '7200'], turn: '1', phase: String(0x4), player: '0' })
    // Las jugadas que ofrece: invocar a Gemini Elf de la mano, activar Pot of Greed, el Juego Rápido colocado (lo colocado «este turno» no cuenta: el núcleo no lo sabe), ir a la Battle Phase.
    const ask = first.question as unknown as { summons: { code: number }[]; activates: { code: number }[]; to_bp: boolean; to_ep: boolean; pos_changes: { code: number }[] }

    console.log('pregunta:', JSON.stringify({ summons: ask.summons.map((card) => card.code), activates: ask.activates.map((card) => card.code), pos: ask.pos_changes.map((card) => card.code), to_bp: ask.to_bp, to_ep: ask.to_ep }))
    expect(ask.summons.map((card) => card.code)).toEqual([GEMINI])
    expect(ask.activates.map((card) => card.code)).toEqual(expect.arrayContaining([POT, MST]))
    expect(ask.to_bp).toBe(true)
    // Cambiar de posición: los monstruos puestos con `duelNewCard` cuentan como de antes de este turno (en la mesa real pueden haber sido invocados ahora).
    expect(ask.pos_changes.map((card) => card.code).sort()).toEqual([BEWD, DM].sort())

    // A la Battle Phase: Blue-Eyes puede atacar (ATTACK_FIRST_TURN) y Dark Magician, en defensa, no.
    lib.duelSetResponse(handle, { type: R.SELECT_IDLECMD, action: 6, index: null })
    const battle = run(lib, handle)

    expect(battle.question?.type && ocgMessageTypeStrings.get(battle.question.type as never)).toBe('select_battlecmd')
    const bp = battle.question as unknown as { attacks: { code: number; can_direct: boolean }[] }

    console.log('batalla:', JSON.stringify(bp.attacks))
    expect(bp.attacks.map((card) => card.code)).toEqual([BEWD])
    lib.destroyDuel(handle)
  })

  it('sin ATTACK_FIRST_TURN el turno 1 no tiene Battle Phase: el núcleo rearmado necesita ese flag para seguir un turno empezado', async () => {
    const { lib, handle } = await build(BigInt(MR5) | PSEUDO_SHUFFLE, null)
    const first = run(lib, handle)
    const ask = first.question as unknown as { to_bp: boolean }

    expect(ask.to_bp).toBe(false)
    lib.destroyDuel(handle)
  })

  it('la biblioteca Debug (modo puzzle) está en el wasm: materiales Xyz, equipo, contadores y la invocación hecha bien', async () => {
    const lua = `
      assert(Debug and Debug.AddCard and Debug.PreSummon and Debug.PreEquip and Debug.PreAddCounter and Debug.SetPlayerInfo, 'sin Debug')
      local xyz = Debug.AddCard(${LEVIATHAN}, 0, 0, LOCATION_MZONE, 4, POS_FACEUP_ATTACK, true)
      assert(xyz, 'sin xyz')
      -- Materiales (libdebug.cpp, AddCard): una carta en una casilla del campo ya ocupada se pega como material Xyz de la que está ahí.
      local m1 = Debug.AddCard(${STONE}, 0, 0, LOCATION_MZONE, 4, POS_FACEUP)
      local m2 = Debug.AddCard(${STONE}, 0, 0, LOCATION_MZONE, 4, POS_FACEUP)
      PROBE = 'm1=' .. tostring(m1 and m1:GetLocation()) .. ' overlaid=' .. xyz:GetOverlayCount()
      Debug.PreSummon(xyz, SUMMON_TYPE_XYZ, LOCATION_EXTRA)
      local pend = Debug.AddCard(${ODDEYES}, 0, 0, LOCATION_PZONE, 0, POS_FACEUP)
      local pend2 = Debug.AddCard(${ODDEYES}, 0, 0, LOCATION_EXTRA, 0, POS_FACEUP)
      PROBE = PROBE .. ' pzone=' .. tostring(pend and pend:GetLocation()) .. '/' .. tostring(pend and pend:GetSequence()) .. ' extraUp=' .. tostring(pend2 and pend2:IsFaceup())
      local axe = Debug.AddCard(${AXE}, 0, 0, LOCATION_SZONE, 2, POS_FACEUP)
      local bewd = Duel.GetFieldCard(0, LOCATION_MZONE, 2)
      assert(bewd, 'sin bewd')
      Debug.PreEquip(axe, bewd)
      Debug.PreAddCounter(bewd, COUNTER_SPELL, 2)
      local plasma = Debug.AddCard(${PLASMA}, 0, 0, LOCATION_FZONE, 0, POS_FACEUP)
      assert(plasma, 'sin campo')
    `
    const { lib, handle } = await build(BigInt(MR5) | PSEUDO_SHUFFLE | ATTACK_FIRST_TURN, lua)
    const first = run(lib, handle)

    console.log('errores del armado:', JSON.stringify(errors))
    console.log('sonda:', peek(lib, handle, 'PROBE'))
    expect(first.question?.player).toBe(0)
    const field = lib.duelQueryField(handle)

    console.log('campo:', JSON.stringify(field.players[0]))
    expect(field.players[0].monsters[4]).toMatchObject({ position: OcgPosition.FACEUP_ATTACK, materials: 2 })
    expect(field.players[0].spells[2]?.position).toBe(OcgPosition.FACEUP)
    expect(field.players[0].spells[5]?.position).toBe(OcgPosition.FACEUP)
    const stats = lib.duelQueryLocation(handle, { flags: (OcgQueryFlags.CODE | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE) as never, controller: 0, location: OcgLocation.MZONE })

    console.log('monstruos:', JSON.stringify(stats.map((card) => card && { code: card.code, atk: card.attack, def: card.defense })))
    // El Hacha equipada suma 1000 y Mystic Plasma Zone, +500/-400 a los OSCURIDAD (Dark Magician): el equipo y el campo valen como de verdad.
    expect(stats[2]).toMatchObject({ code: BEWD, attack: 4000 })
    expect(stats[0]).toMatchObject({ code: DM, attack: 3000, defense: 1700 })
    const read = { equips: peek(lib, handle, '#Duel.GetFieldCard(0, LOCATION_MZONE, 2):GetEquipGroup()'), counters: peek(lib, handle, 'Duel.GetFieldCard(0, LOCATION_MZONE, 2):GetCounter(COUNTER_SPELL)'), xyzProper: peek(lib, handle, 'Duel.GetFieldCard(0, LOCATION_MZONE, 4):IsStatus(STATUS_PROC_COMPLETE)'), materials: peek(lib, handle, '#Duel.GetFieldCard(0, LOCATION_MZONE, 4):GetOverlayGroup()') }

    console.log('leído en Lua:', JSON.stringify(read))
    expect(read).toEqual({ equips: '1', counters: '2', xyzProper: 'true', materials: '2' })
    // Leviathan Dragon ofrece su efecto (desacoplar 1): el Xyz con materiales juega.
    const ask = first.question as unknown as { activates: { code: number }[] }

    expect(ask.activates.map((card) => card.code)).toContain(LEVIATHAN)
    lib.destroyDuel(handle)
  })

  it('lo que el núcleo no puede saber de una mesa manual: «una vez por turno» ya usado, la Invocación Normal del turno, el ataque hecho, lo colocado este turno, el turno y la fase', async () => {
    const { lib, handle } = await build(BigInt(MR5) | PSEUDO_SHUFFLE | ATTACK_FIRST_TURN, null)

    run(lib, handle)
    const read ={ summonedThisTurn: peek(lib, handle, 'Duel.GetFieldCard(0, LOCATION_MZONE, 2):IsStatus(STATUS_SUMMON_TURN)'), setThisTurn: peek(lib, handle, 'Duel.GetFieldCard(0, LOCATION_SZONE, 1):IsStatus(STATUS_SET_TURN)'), attacked: peek(lib, handle, 'Duel.GetFieldCard(0, LOCATION_MZONE, 2):GetAttackedCount()'), normalSummons: peek(lib, handle, 'Duel.GetActivityCount(0, ACTIVITY_NORMALSUMMON)'), turn: peek(lib, handle, 'Duel.GetTurnCount()') }

    console.log('lo que se reinicia:', JSON.stringify(read))
    expect(read).toEqual({ summonedThisTurn: 'false', setThisTurn: 'false', attacked: '0', normalSummons: '0', turn: '1' })
    lib.destroyDuel(handle)
  })
})
