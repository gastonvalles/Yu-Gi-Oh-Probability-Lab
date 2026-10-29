import { deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { buildComboLink, comboFileName, comboFileText, comboPayloadOf, decodeComboPayload, encodeComboPayload, MAX_LINK_LENGTH, parseComboText, toSavedCombo } from '../app/combo-share'
import { createMatState, replayMat, type MatAction } from '../app/practice-mat'
import { createSavedCombo, type SavedCombo } from '../app/saved-combos'

// Un combo como los de verdad: 40 cartas de passcodes de 8 cifras, 15 en el Extra, la mano de 5, el rival simulado y 45 jugadas.
const passcodes = Array.from({ length: 14 }, (_, i) => 14558127 + i * 7_919_311)
const deck = Array.from({ length: 40 }, (_, i) => `card-${passcodes[i % 14]}-${Math.floor(i / 14) + 1}`)
const extra = Array.from({ length: 15 }, (_, i) => `card-${90_000_000 + i * 12_347}-1`)
const table = createMatState(deck, extra, 5)
const initial = { ...table, rival: { hand: ['rival.card-14558127-1', 'rival.card-59438930-1'], used: [] } }
const hand = initial.hand
const actions: MatAction[] = []
for (let i = 0; actions.length < 45; i++) {
  const turn: MatAction[] = [
    { type: 'phase', phase: 'main1' },
    { type: 'place', id: hand[i % 5]!, zone: 'mz', index: i % 5, pos: 'atk', how: 'normal' },
    { type: 'activate', id: hand[i % 5]!, effect: 1 },
    { type: 'move', id: deck[10 + i]!, to: 'hand' },
    { type: 'summon', id: extra[i % 15]!, how: 'link', materials: [hand[i % 5]!], zone: 'emz', index: 0, pos: 'atk' },
    { type: 'batch', actions: [{ type: 'move', id: deck[20 + i]!, to: 'gy' }, { type: 'move', id: deck[25 + i]!, to: 'gy' }] },
    { type: 'rivalUse', id: 'rival.card-14558127-1' },
    { type: 'draw', count: 1 },
    { type: 'shuffle', seed: 123456789 + i },
  ]
  actions.push(...turn.slice(0, 45 - actions.length))
}
const names = (id: string) => `Carta de nombre largo ${id.slice(5, 9)}`
const combo = createSavedCombo({ name: 'Línea: «Snake-Eye» / 1 corte', deckName: 'Snake-Eye Fire King', initial, actions, nameOf: names }, [], new Date('2026-10-29T12:00:00Z'))
const shared = (({ id: _id, ...rest }: SavedCombo) => rest)(combo)

const toPayload = (value: unknown) => `j${Buffer.from(JSON.stringify(value)).toString('base64url')}`
const envelope = (inner: unknown, extraFields = {}) => ({ app: 'ygoultralab', kind: 'combo', v: 1, combo: inner, ...extraFields })

describe('compartir combos', () => {
  it('ida y vuelta por enlace: 45 jugadas entran comprimidas debajo del tope, y se reproducen igual', async () => {
    const payload = await encodeComboPayload(combo)
    const link = buildComboLink('https://ygoultralab.app', '/', payload)
    const plain = toPayload(JSON.parse(comboFileText(combo)))

    // Medido: 1,7 mil caracteres comprimido contra 9,5 mil sin comprimir.
    expect(payload[0]).toBe('z')
    expect(link.length).toBeLessThan(MAX_LINK_LENGTH)
    expect(plain.length).toBeGreaterThan(link.length * 2)

    const result = await decodeComboPayload(comboPayloadOf(link)!)
    expect(result).toEqual({ ok: true, combo: shared })
    if (!result.ok) return
    expect(replayMat(result.combo.initial, result.combo.actions, 45)).toEqual(replayMat(combo.initial, combo.actions, 45))
    // También sin comprimir (un navegador sin `CompressionStream`).
    expect(await decodeComboPayload(plain)).toEqual({ ok: true, combo: shared })
  })

  it('ida y vuelta por archivo, con nombre de archivo limpio; importar no repite un nombre', () => {
    expect(parseComboText(comboFileText(combo))).toEqual({ ok: true, combo: shared })
    expect(comboFileName(combo.name)).toBe('Linea-Snake-Eye-1-corte.ygolab-combo.json')
    expect(comboFileName('../../ «»')).toBe('combo.ygolab-combo.json')

    const imported = toSavedCombo(shared, [combo])
    expect(imported.name).toBe(`${combo.name} (2)`)
    expect(imported.id).not.toBe(combo.id)
  })

  it('reconoce el enlace entero, el hash o los datos solos', () => {
    expect(comboPayloadOf('https://x.app/#combo=zAbC_-1')).toBe('zAbC_-1')
    expect(comboPayloadOf('  zAbC  ')).toBe('zAbC')
    expect(comboPayloadOf('https://x.app/#duel?room=ABC')).toBeNull()
    expect(comboPayloadOf('hola')).toBeNull()
  })

  it('un combo enorme no se ofrece por enlace', async () => {
    const long = { ...combo, actions: Array.from({ length: 1500 }, (_, i): MatAction => ({ type: 'shuffle', seed: i * 2_654_435_761 })) }
    expect(buildComboLink('https://x.app', '/', await encodeComboPayload(long)).length).toBeGreaterThan(MAX_LINK_LENGTH)
  })

  it('las entradas hostiles no rompen ni lanzan: dicen qué pasó', async () => {
    const proto = JSON.parse(comboFileText(combo)) as { combo: { names: Record<string, string> } }
    const hostile: Array<[string, string]> = [
      ['{', 'notCombo'],
      ['null', 'notCombo'],
      ['[]', 'notCombo'],
      [JSON.stringify({ app: 'otra', kind: 'combo', v: 1, combo: shared }), 'notCombo'],
      [JSON.stringify(envelope(shared, { kind: 'duel' })), 'notCombo'],
      [JSON.stringify(envelope(shared, { v: 2 })), 'newer'],
      [JSON.stringify(envelope(shared, { v: '1' })), 'notCombo'],
      [JSON.stringify(envelope({ ...shared, actions: [{ type: 'place', id: 'card-1-1', zone: 'mz', index: 99, pos: 'atk' }] })), 'broken'],
      [JSON.stringify(envelope({ ...shared, actions: [{ type: 'nuke' }] })), 'broken'],
      [JSON.stringify(envelope({ ...shared, actions: [{ type: 'draw', count: 1e9 }] })), 'broken'],
      [JSON.stringify(envelope({ ...shared, actions: [{ type: 'batch', actions: [{ type: 'batch', actions: [] }] }] })), 'broken'],
      [JSON.stringify(envelope({ ...shared, actions: 'x'.repeat(10) })), 'broken'],
      [JSON.stringify(envelope({ ...shared, initial: { ...shared.initial, hand: ['https://evil.example/x.png'] } })), 'broken'],
      [JSON.stringify(envelope({ ...shared, initial: { ...shared.initial, mz: [null] } })), 'broken'],
      [JSON.stringify(envelope({ ...shared, name: 'x'.repeat(10_000) })), 'broken'],
      [JSON.stringify(envelope({ ...shared, savedAt: 'ayer' })), 'broken'],
      [JSON.stringify(envelope({ ...proto.combo, names: { ...proto.combo.names, constructor: 'x' } })), 'broken'],
      ['{"app":"ygoultralab","kind":"combo","v":1,"combo":{"__proto__":{"polluted":true}}}', 'broken'],
      [JSON.stringify(envelope({ ...shared, names: JSON.parse('{"__proto__":"x"}') as Record<string, string> })), 'broken'],
    ]

    for (const [text, error] of hostile) expect(parseComboText(text), text.slice(0, 80)).toEqual({ ok: false, error })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()

    // Una bomba de deflate (64 MB de ceros en ~64 KB): se corta al pasar el tope, sin inflarla entera.
    const bomb = `z${deflateRawSync(Buffer.alloc(64 * 1024 * 1024)).toString('base64url')}`
    expect(await decodeComboPayload(bomb)).toEqual({ ok: false, error: 'tooBig' })
    expect(await decodeComboPayload('z' + 'A'.repeat(300_000))).toEqual({ ok: false, error: 'tooBig' })
    expect(await decodeComboPayload('z!!!')).toEqual({ ok: false, error: 'broken' })
    expect(await decodeComboPayload('zAAAA')).toEqual({ ok: false, error: 'broken' })
    expect(await decodeComboPayload('x' + toPayload(shared).slice(1))).toEqual({ ok: false, error: 'broken' })
    expect(await decodeComboPayload(`j${Buffer.from([0xff, 0xfe]).toString('base64url')}`)).toEqual({ ok: false, error: 'broken' })
  })

  it('copia sólo los campos conocidos', () => {
    const withExtras = { ...shared, evil: 1, initial: { ...shared.initial, evil: 2 }, actions: [{ type: 'draw', count: 1, evil: 3 }] }
    const result = parseComboText(JSON.stringify(envelope(withExtras)))
    expect(result.ok && JSON.stringify(result.combo).includes('evil')).toBe(false)
  })
})
