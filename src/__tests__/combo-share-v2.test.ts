import { deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { comboEnvelope, compactEnvelope, decodeComboPayload, encodeComboPayload, packPayload, parseComboText, readComboLink, unpackPayload } from '../app/combo-share'
import { replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { createSavedCombo, type SavedCombo } from '../app/saved-combos'
import { deckCombo, referenceCombo, withoutId } from './support/combo-fixtures'

/** Un enlace v1 de verdad: el combo de referencia (45 jugadas), escrito con el código de antes de v2. Tiene que abrir siempre igual, con sus nombres. */
const V1_LINK = 'https://ygoultralab.app/#combo=zxZnNbuM2EIBfxZizvOWPJIq6FUV7adFLu5cGPjC2bAuRpUCSk00CP1HRJ-ht-2IFpdgiwyFjwwiyhwU8-EhzpC-j0fgF1P095PC0afZV36pK3UIEd2W9ghyWze62gQgeIKfR66f8BWq1KyCH3_77py5UPvv-9x-1uivmPz8V3_-d_TCjs2XT9gVEsCqWd7-P8AmZ_VK2xezXst5ABJ16KFY_9pADIyydUzJn8k_KckJyQr4QQv6CCMq67EtV6W_WG0J-A0vVruZJTJM4zdicQjRGUkYEl5IbESkl5ySeIkJIylKaTJEsyTiV-uuPEclFQhkXU4QSmgqSxJkZkkkms0QaISoSIqkgRihOkowyMWfHCGOxEDHPpggnXKYilkYk4zQlKZkiccp4wgWdIqf0mZM-c9JnTvrMSZ856TM3feamz9z0mZM-d9LnTvrcSZ876XMnfe6kz530uZM-d9LnTvrcTZ_DIoLiW9-qk4aSjP8MfQihjMfCirA4lbEV4YLE1IrEkmeZFUmp4IkVETExlZeEZGnMpBWRmRCmzoRSShm3IvqA1pkpTzJqnZnGGU2tM9OUJNQ6MxUsS_SZFxFsla4aN2_uPHXuPHXuPHXuPHXu_PAVmyfIbxYR3Kq67LbFavy0e4b8pt5XVYT8p2-YDSwi6PrwinVZVCvIhxD0zV1Rd5CTCO63qtPlbNWqR4ig37f1UBvXalmsmsd6PM8gyNf78UOv2k3RH4_alg9jKTterCHwxb1kRjyRMc8kJ-Ml2HfjXodDNFTiTu_2tiDm8JNqezVbFbO62d22xaxS7aaZaQSplj5cI0gp9eJSSqTO-nCNIEXYh2sEqdA-XCNY-fbxmsFqu5-X0_5G4ffy1DjP9FTw4nGSOH85flwjyPPEh2sEedh48Yy7f5B-XCPIY-oiKf04KmUAx6T046iUfhyV0o_jUgYsQKUM8ZiUAR6Tkl8mpR9HpfTjqJQBHJPSj6NS-nFUSj-OShnAMSn9OCqlH0el9OO4lAELDCmN7se7PSEEaY0CONY3BXBm4MemKoBzAz92XAE8RtqxAG5emWOvFsCFgR8buQCeIV1eAJcTfmoB_TjF-sMAblz3U_MYwI3rfuosA7hx3U9tZwA3rvupJw3gwql6gSc3VvX8OFr1_Dha9QI4VvX8-GvVw7tM3yINelvQ4KJDBGrZl41ul29eoH-6193y2DVP3fNOlTWFQzQBlVpqoBymDk4v_NzUw7LnYRqwKr6NvXjTQQ6qv4MIts0j5FA37U5V5sb6MA-qD-xdrNfFsoecGqt2zYO9whoI9A3kY_tuLOn2u11T24vMF8PxgFVZ69PuVF-0pao67G1pccq38CZsfPGt6pdbQC-7k4Y1IBjS2DxBKG_7vf-0YmGsGST52p3W4aYZC15fnZbNvn5z2bvtfr2u9E5dod9xdA1KUpFJ05TLVbLeOxGV6BUqWXufpZI9SbrApWmk8I5Lxpk-0iVztHSeS-bA6JNckuQ6l6yJBeISu8Ila-8zXTJHkBe4NA2j3nHJONMHumQNJc9yyZo0fpZL9EqXzFkX4hK_xiVz7_NcsmbXF7g0jTHfc2k60we6ZI2zz3LJHFF_lkrsOpWMRhBVKb5CJWvv81Qyf_O4wKRp_P2OSfZM-KNMsn4GOcck66eNzzKJHxaHw_8'

/** Lo que no es lo de siempre: zonas ocupadas (materiales Xyz, contadores, la de Campo), boca abajo, Extra boca arriba, fichas, el rival simulado, cartas del rival de un duelo (`f.`, `c12`), ids que no son `card-<passcode>-<n>` tal cual, todas las jugadas y `auto`. */
function oddCombo(): SavedCombo {
  const initial: MatState = {
    deck: ['card-89631139-1', 'card-89631139-3', 'card-0123-1', 'card-5-150'],
    extra: ['card-84013237-1', 'card-84013237-2'],
    hand: ['card-14558127-1', 'card-14558127-2', 'card-97268402-1'],
    gy: ['card-23434538-1'],
    banished: ['card-23434538-2'],
    mz: [{ id: 'card-84013237-1', pos: 'atk', counters: 2, materials: ['card-97268402-2', 'token-1'] }, null, null, { id: 'f.c12', pos: 'def', counters: 0, materials: [] }, null],
    emz: [null, { id: 'token-2', pos: 'def', counters: 0, materials: [] }],
    st: [null, { id: 'card-73642296-1', pos: 'set', counters: 0, materials: [] }, null, null, null],
    field: { id: 'card-1-1', pos: 'atk', counters: 999, materials: [] },
    tokens: 2,
    phase: 'main1',
    turn: 3,
    facedown: ['card-23434538-2'],
    extraUp: ['card-84013237-2'],
    targeted: ['f.c12'],
    rival: { hand: ['rival.card-14558127-1', 'rival.card-97268402-1'], used: ['rival.card-97268402-1'] },
  }
  const actions: MatAction[] = [
    { type: 'draw', count: 1 },
    { type: 'draw', count: 0, ids: ['card-89631139-3'] },
    { type: 'mill', count: 2 },
    { type: 'shuffle', seed: -(2 ** 53) },
    { type: 'move', id: 'card-14558127-1', to: 'deck-bottom', faceDown: false, faceUp: true, shuffle: 7 },
    { type: 'place', id: 'card-14558127-2', zone: 'st', index: 0, pos: 'set', how: 'scale' },
    { type: 'tribute', id: 'card-97268402-1', tributes: ['card-84013237-1', 'token-1'], zone: 'mz', index: 4, pos: 'atk' },
    { type: 'summon', id: 'card-84013237-2', how: 'xyz', materials: ['card-97268402-1'], zone: 'emz', index: 0, pos: 'def' },
    { type: 'attach', id: 'card-0123-1', to: 'card-84013237-2' },
    { type: 'position', id: 'card-84013237-2', pos: 'atk' },
    { type: 'counter', id: 'card-1-1', delta: -999 },
    { type: 'token', zone: 'mz', index: 1 },
    { type: 'token', zone: 'mz', index: 2, pos: 'def' },
    { type: 'activate', id: 'card-73642296-1', cost: 'banish', effect: 50 },
    { type: 'reveal', id: 'card-5-150' },
    { type: 'declare', id: 'card-5-150' },
    { type: 'target', id: 'f.c12' },
    { type: 'rivalUse', id: 'rival.card-14558127-1' },
    { type: 'attack', id: 'card-84013237-2', target: 'c12' },
    { type: 'attack', id: 'card-84013237-2' },
    { type: 'phase', phase: 'end', skipDraw: true },
    { type: 'give', id: 'card-89631139-1', auto: true },
    { type: 'take', id: 'f.c12', zone: 'field', index: 0, pos: 'atk' },
    { type: 'regain', id: 'card-89631139-1', to: 'mz', index: 3, pos: 'def', faceDown: true, auto: true },
    { type: 'regain', id: 'card-23434538-1', to: 'gy' },
    { type: 'batch', actions: [{ type: 'shuffle', seed: 1 }, { type: 'move', id: 'card-89631139-1', to: 'banished', faceDown: true }, { type: 'target', id: 'card-1-1' }] },
  ]
  // Un `savedAt` que no es el de `toISOString` (un combo importado de otro lado): viaja como texto.
  return { ...createSavedCombo({ name: '«Línea» <b>rara</b> 🐍', deckName: '', initial, actions, nameOf: () => 'x', auto: true }, []), savedAt: '2026-10-29' }
}

const unpacked = async (payload: string) => {
  const result = await unpackPayload(payload)
  if (!result.ok) throw new Error(result.error)
  return JSON.parse(result.text) as unknown
}

describe('el enlace v2 de un combo (compacto)', () => {
  it('va y vuelve igual (sin los nombres) con combos de todas las formas, y se reproduce igual', async () => {
    const combos = [referenceCombo(), oddCombo(), deckCombo(3, 20, { rival: true }), deckCombo(5, 45, { rival: true }), deckCombo(7, 120), deckCombo(11, 300, { auto: true })]

    for (const combo of combos) {
      const result = await decodeComboPayload(await encodeComboPayload(combo))
      expect(result, combo.name).toEqual({ ok: true, combo: { ...withoutId(combo), names: {} } })
      if (result.ok) expect(replayMat(result.combo.initial, result.combo.actions)).toEqual(replayMat(combo.initial, combo.actions))
    }
    // Sin `CompressionStream` (`j`) también, y como archivo.
    const odd = oddCombo()
    const plain = `j${Buffer.from(JSON.stringify(compactEnvelope(odd))).toString('base64url')}`
    expect(await decodeComboPayload(plain)).toEqual({ ok: true, combo: { ...withoutId(odd), names: {} } })
    expect(parseComboText(JSON.stringify(compactEnvelope(odd)))).toEqual({ ok: true, combo: { ...withoutId(odd), names: {} } })
  })

  it('un enlace v1 que ya se compartió sigue abriendo igual, con sus nombres', async () => {
    const reference = referenceCombo()
    const result = await readComboLink(V1_LINK)
    expect(result).toEqual({ ok: true, combo: withoutId(reference) })
    if (result.ok) expect(replayMat(result.combo.initial, result.combo.actions)).toEqual(replayMat(reference.initial, reference.actions))
  })

  it('una versión vieja de la app (que lee sólo v1) dice «más nuevo»: es el mismo sobre, con v 2', async () => {
    // El lector v1 acepta `z` y `j`, y un sobre con `app` y `kind` de combo y un `v` mayor que 1 es `newer` («recargá la página»), no una excepción.
    const payload = await encodeComboPayload(referenceCombo())
    expect(payload[0]).toBe('z')
    expect(await unpacked(payload)).toMatchObject({ app: 'ygoultralab', kind: 'combo', v: 2 })
    expect(parseComboText(JSON.stringify({ ...compactEnvelope(referenceCombo()), v: 3 }))).toEqual({ ok: false, error: 'newer' })
    expect(parseComboText(JSON.stringify({ ...compactEnvelope(referenceCombo()), v: 0 }))).toEqual({ ok: false, error: 'broken' })
  })

  it('las entradas hostiles no rompen ni lanzan: dicen qué pasó', async () => {
    const base = compactEnvelope(oddCombo())
    const [name, deckName, savedAt, table, mat, actions] = base.c as [string, string, unknown, [unknown[], string[]], unknown[], unknown[]]
    const withC = (...c: unknown[]) => JSON.stringify({ ...base, c })
    const withMat = (n: number, value: unknown) => withC(name, deckName, savedAt, table, mat.map((entry, i) => (i === n ? value : entry)), actions)
    const withAction = (action: unknown) => withC(name, deckName, savedAt, table, mat, [action])
    const tableSize = table[0].reduce<number>((sum, entry) => sum + (typeof entry === 'number' ? 1 : (entry as number[])[1]!), 0) + table[1].length
    const hostile: string[] = [
      JSON.stringify({ ...base, c: undefined }),
      JSON.stringify({ ...base, c: 'x' }),
      withC(name, deckName, savedAt, table, mat, actions, true, 'de más'),
      // Índices fuera de la tabla, negativos, con coma o texto.
      withAction([11, tableSize]),
      withAction([11, -1]),
      withAction([11, 0.5]),
      withAction([11, '0']),
      withMat(0, [0, 999]),
      // Un valor fijo o un tipo de jugada fuera de su lista; una jugada larga; un lote dentro de otro.
      withAction([4, 0, 99, 0, 0]),
      withAction([99, 0]),
      withAction([11, 0, null, null, null, null, null, null, null]),
      withAction([21, [[21, []]]]),
      // Una tabla enorme (o que lo promete), un passcode imposible, ids que no son ids.
      withC(name, deckName, savedAt, [Array.from({ length: 20 }, () => [1, 99]), []], mat, actions),
      withC(name, deckName, savedAt, [[[1, 1e9]], []], mat, actions),
      withC(name, deckName, savedAt, [[1e15], []], mat, actions),
      withC(name, deckName, savedAt, [table[0], [...table[1], ...Array.from({ length: 1000 }, (_, n) => `token-${n}`)]], mat, actions),
      withC(name, deckName, savedAt, [table[0], ['__proto__']], mat, actions),
      withC(name, deckName, savedAt, [table[0], [...table[1], 'https://evil.example/x.png']], mat, actions),
      // La mesa: zonas del largo que no es, el rival que no es un par, `savedAt` imposible, un nombre enorme.
      withMat(6, [null, null, null, null, null, null]),
      withMat(3, 'x'),
      withC(name, deckName, savedAt, table, mat.slice(0, 3), actions),
      withC(name, deckName, 1e20, table, mat, actions),
      withC(name, deckName, -1, table, mat, actions),
      withC(name, 'x'.repeat(10_000), savedAt, table, mat, actions),
      '{"app":"ygoultralab","kind":"combo","v":2,"c":{"__proto__":{"polluted":true}}}',
    ]
    for (const text of hostile) expect(parseComboText(text), text.slice(0, 160)).toEqual({ ok: false, error: 'broken' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    // Bien armado, sí abre: las de arriba fallan por lo que cambian, no por la base.
    expect(parseComboText(withC(name, deckName, savedAt, table, mat, actions)).ok).toBe(true)

    // Cortado: el JSON (no es un combo) y los bytes del enlace (roto).
    const payload = await encodeComboPayload(oddCombo())
    expect(parseComboText(JSON.stringify(base).slice(0, 200))).toEqual({ ok: false, error: 'notCombo' })
    expect(await decodeComboPayload(payload.slice(0, Math.floor(payload.length / 2)))).toEqual({ ok: false, error: 'broken' })
    // Una bomba de deflate con el sobre v2 adelante: se corta al pasar el tope.
    const bomb = `z${deflateRawSync(Buffer.concat([Buffer.from('{"app":"ygoultralab","kind":"combo","v":2,"c":["'), Buffer.alloc(64 * 1024 * 1024, 32)])).toString('base64url')}`
    expect(await decodeComboPayload(bomb)).toEqual({ ok: false, error: 'tooBig' })
  })

  it('mide menos de la mitad que v1: la tabla de tamaños', async () => {
    const combos = [referenceCombo(), deckCombo(3, 20, { rival: true }), deckCombo(5, 45, { rival: true }), deckCombo(7, 120), deckCombo(11, 300)]
    const rows: string[] = ['combo | jugadas | JSON v1 → v2 | enlace v1 → v2']
    const links: number[] = []

    for (const combo of combos) {
      const [v1, v2] = [await packPayload(comboEnvelope(combo)), await encodeComboPayload(combo)]
      rows.push(`${combo.name} | ${combo.actions.length} | ${JSON.stringify(comboEnvelope(combo)).length} → ${JSON.stringify(compactEnvelope(combo)).length} | ${v1.length} → ${v2.length} (${Math.round((100 * v2.length) / v1.length)} %)`)
      // Las 300 jugadas al azar llevan decenas de semillas de 32 bits, que no se comprimen: ésas quedan apenas por encima de la mitad.
      if (combo.actions.length < 300) expect(v2.length, combo.name).toBeLessThan(v1.length / 2)
      links.push(v2.length)
    }
    console.info(rows.join('\n'))
    // El de referencia (45 jugadas): 1.672 caracteres en v1; en v2, unos 730.
    expect(links[0]).toBeLessThan(750)
  })
})
