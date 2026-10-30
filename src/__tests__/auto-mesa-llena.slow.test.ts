import createCore, { OcgProcessResult, OcgResponseType as R, ocgMessageTypeStrings, type OcgCoreSync, type OcgDuelHandle } from 'ocgcore-wasm'
import { describe, expect, it } from 'vitest'
import { MR5 } from '../app/auto/auto-session'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Una mesa de Angelechy en la que el núcleo no ofrece nada y es regla, no un error (lento, núcleo real): tus cinco zonas de Mágicas y Trampas ocupadas (tres Angelechy como
 * Mágicas Continuas, «Opening to e4» y «Verdict» colocadas), «Angelechy Problem» en el Campo, las Zonas de Monstruo vacías, el rival sin cartas en el campo y la restricción
 * de «Opening to e4» rigiendo. «Opening to e4» y «Problem» piden una zona de Mágicas y Trampas libre (`GetLocationCount(tp, LOCATION_SZONE) > 0`); «Verdict», con 1 a 4
 * Angelechy boca arriba, una carta boca arriba del rival que se pueda negar; los Dominus de la mano y Ash sólo responden a una cadena. Liberando una zona o con una carta
 * del rival, el núcleo sí las ofrece: la restricción («no podés Invocar de modo Especial desde el Extra Deck, salvo Monstruos Sincronía») no es lo que las frena.
 */
const BASTION = 28904860
const CASTELLAN = 101402090
const SHATRANGA = 42410161
const DESTRIER = 55393975
const ENLISTED = 81797573
const SENESCHAL = 86673403
const OPENING = 80565021
const VERDICT = 101402096
const PROBLEM = 17782288
const ENDGAME = 12845564
const IMPULSE = 40366667
const PURGE = 97045737
const ASH = 14558127
const FILLER = 89631139
const PSEUDO_SHUFFLE = 16n

describe.skipIf(!hasCoreData)('una mesa de Angelechy sin jugadas (núcleo real)', () => {
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)

  /** Arma la mesa (`spells`: las de la fila de Mágicas y Trampas, de izquierda a derecha; `rival`: una carta boca arriba del rival) y devuelve la primera `select_idlecmd`. */
  async function idle({ spells, rival }: { spells: [number, boolean][]; rival: boolean }) {
    const errors: string[] = []
    const lib: OcgCoreSync = await createCore({ sync: true, wasmBinary: wasm })
    const handle: OcgDuelHandle = lib.createDuel({
      flags: BigInt(MR5) | PSEUDO_SHUFFLE,
      seed: [1n, 2n, 3n, 4n],
      team1: { startingLP: 8000, startingDrawCount: 0, drawCountPerTurn: 0 },
      team2: { startingLP: 8000, startingDrawCount: 0, drawCountPerTurn: 0 },
      cardReader: (code) => cards.get(code) ?? null,
      scriptReader: (name) => store.read(name),
      errorHandler: (type, text) => void errors.push(`${type}: ${text}`),
    })!

    for (const name of ['constant.lua', 'utility.lua']) expect(lib.loadScript(handle, name, store.read(name)!)).toBe(true)
    const add = (code: number, place: string, seq: number, pos: string) => `Debug.AddCard(${code}, 0, 0, ${place}, ${seq}, ${pos})`
    const lua = [
      // Las Angelechy boca arriba en la fila de Mágicas y Trampas, tratadas como Mágicas Continuas (como las deja `plop` de «Opening to e4»).
      ...spells.map(([code, faceup], seq) => (faceup ? `local c${seq} = ${add(code, 'LOCATION_SZONE', seq, 'POS_FACEUP')}\nlocal t${seq} = Effect.CreateEffect(c${seq})\nt${seq}:SetType(EFFECT_TYPE_SINGLE)\nt${seq}:SetCode(EFFECT_CHANGE_TYPE)\nt${seq}:SetValue(TYPE_SPELL|TYPE_CONTINUOUS)\nc${seq}:RegisterEffect(t${seq})` : add(code, 'LOCATION_SZONE', seq, 'POS_FACEDOWN'))),
      add(PROBLEM, 'LOCATION_FZONE', 0, 'POS_FACEUP'),
      ...[IMPULSE, ASH, OPENING, PURGE].map((code) => add(code, 'LOCATION_HAND', 0, 'POS_FACEDOWN')),
      ...[OPENING, DESTRIER].map((code) => add(code, 'LOCATION_GRAVE', 0, 'POS_FACEUP')),
      add(VERDICT, 'LOCATION_REMOVED', 0, 'POS_FACEUP'),
      ...[SHATRANGA, ENLISTED, ENLISTED, SENESCHAL, BASTION, DESTRIER, DESTRIER].map((code) => add(code, 'LOCATION_EXTRA', 0, 'POS_FACEDOWN')),
      ...[ENDGAME, ...Array<number>(30).fill(FILLER)].map((code) => add(code, 'LOCATION_DECK', 0, 'POS_FACEDOWN')),
      ...Array.from({ length: 34 }, () => `Debug.AddCard(${FILLER}, 1, 1, LOCATION_DECK, 0, POS_FACEDOWN)`),
      ...(rival ? [`Debug.AddCard(${PROBLEM}, 1, 1, LOCATION_FZONE, 0, POS_FACEUP)`] : []),
      // La restricción de «Opening to e4» (su `plop`), rigiendo sobre vos.
      `local r = Effect.GlobalEffect()\nr:SetType(EFFECT_TYPE_FIELD)\nr:SetProperty(EFFECT_FLAG_PLAYER_TARGET)\nr:SetCode(EFFECT_CANNOT_SPECIAL_SUMMON)\nr:SetTargetRange(1,0)\nr:SetTarget(function(e,c) return c:IsLocation(LOCATION_EXTRA) and not c:IsSynchroMonster() end)\nDuel.RegisterEffect(r,0)`,
    ].join('\n')

    expect(lib.loadScript(handle, 'mesa.lua', lua), errors.join('\n')).toBe(true)
    lib.startDuel(handle)
    for (;;) {
      const status = lib.duelProcess(handle)

      for (const message of lib.duelGetMessage(handle)) {
        const name = ocgMessageTypeStrings.get(message.type as never) as string

        if (name === 'select_chain') lib.duelSetResponse(handle, { type: R.SELECT_CHAIN, index: null })
        else if (name === 'select_idlecmd') {
          lib.destroyDuel(handle)
          expect(errors).toEqual([])
          const ask = message as unknown as Record<'summons' | 'special_summons' | 'activates' | 'spell_sets' | 'monster_sets', { code: number }[]>

          return Object.fromEntries(Object.entries(ask).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, (value as { code: number }[]).map((card) => card.code)]))
        } else if (name.startsWith('select_')) throw new Error(`pregunta inesperada: ${name}`)
      }
      if (status === OcgProcessResult.END) throw new Error('el duelo terminó sin preguntar')
    }
  }

  const FULL: [number, boolean][] = [[BASTION, true], [CASTELLAN, true], [OPENING, false], [SHATRANGA, true], [VERDICT, false]]

  it('con las cinco zonas ocupadas y el rival sin cartas, no hay nada para activar ni colocar', async () => {
    const offer = await idle({ spells: FULL, rival: false })

    console.log('oferta, mesa llena:', JSON.stringify(offer))
    expect(offer.activates).toEqual([])
    expect(offer.special_summons).toEqual([])
    expect(offer.spell_sets).toEqual([])
  })

  it('con una zona libre, el núcleo ofrece «Opening to e4» colocada y el efecto de «Problem», aunque rija la restricción', async () => {
    const offer = await idle({ spells: FULL.filter(([code]) => code !== SHATRANGA), rival: false })

    console.log('oferta, una zona libre:', JSON.stringify(offer))
    expect(offer.activates).toEqual(expect.arrayContaining([OPENING, PROBLEM]))
    expect(offer.activates).not.toContain(VERDICT)
  })

  it('con una carta boca arriba del rival, el núcleo ofrece «Verdict» colocada', async () => {
    const offer = await idle({ spells: FULL, rival: true })

    console.log('oferta, el rival con una carta:', JSON.stringify(offer))
    expect(offer.activates).toEqual([VERDICT])
  })
})
