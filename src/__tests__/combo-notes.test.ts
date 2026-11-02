import { describe, expect, it } from 'vitest'

import { buildComboLink, comboEnvelope, compactEnvelope, decodeComboPayload, encodeComboPayload, MAX_LINK_LENGTH, parseComboText, toSavedCombo } from '../app/combo-share'
import { isNoteKey, MAX_NOTE, migrateSavedCombo, normalizeNote, setComboNote, type SavedCombo } from '../app/saved-combos'
import { referenceCombo, withoutId } from './support/combo-fixtures'

const withNotes = (notes: Record<string, string>): SavedCombo => ({ ...referenceCombo(), notes })
const v3 = (notes: unknown) => {
  const envelope = compactEnvelope(withNotes({ 0: 'x' }))
  return JSON.stringify({ ...envelope, c: [...envelope.c.slice(0, 7), notes] })
}

describe('notas por paso: la nota', () => {
  it('es una línea de hasta 140, sin saltos ni espacios de más; vacía no es nota', () => {
    expect(normalizeNote('  Busca a\n\n  Ash\tpara  cortar  ')).toBe('Busca a Ash para cortar')
    expect(normalizeNote(' \n \t ')).toBe('')
    expect(normalizeNote('x'.repeat(200))).toHaveLength(MAX_NOTE)
    expect(normalizeNote(`${'x'.repeat(139)}  y`)).toBe('x'.repeat(139))
  })

  it('la clave es el índice de una jugada que existe', () => {
    expect(isNoteKey('0', 3)).toBe(true)
    expect(isNoteKey('2', 3)).toBe(true)
    for (const key of ['3', '-1', '01', '1.5', '', '__proto__', 'constructor', '1e2']) expect(isNoteKey(key, 3), key).toBe(false)
  })

  it('poner, cambiar y borrar: el vacío la saca y sin notas el combo queda como era', () => {
    const combo = referenceCombo()
    const added = setComboNote([combo], combo.id, 4, '  Abre con\nel campo ')
    expect(added[0]!.notes).toEqual({ 4: 'Abre con el campo' })
    expect(setComboNote(added, combo.id, 4, 'Otra')[0]!.notes).toEqual({ 4: 'Otra' })
    const removed = setComboNote(added, combo.id, 4, '   ')
    expect(removed[0]).toEqual(combo)
    expect('notes' in removed[0]!).toBe(false)
    // Una jugada que no existe no lleva nota; otro combo, no se toca.
    expect(setComboNote([combo], combo.id, combo.actions.length, 'x')[0]).toBe(combo)
    expect(setComboNote([combo], 'otro', 0, 'x')[0]).toBe(combo)
  })
})

describe('notas por paso: guardadas en el navegador', () => {
  it('un combo viejo, sin notas, abre igual y sin la clave', () => {
    const combo = referenceCombo()
    const read = migrateSavedCombo(JSON.parse(JSON.stringify(combo)) as SavedCombo)
    expect(read).toEqual(combo)
    expect('notes' in read).toBe(false)
  })

  it('una nota rara se descarta y el combo (con las demás) sigue', () => {
    const combo = referenceCombo()
    const stored = JSON.parse(JSON.stringify({ ...combo, notes: { 0: 'Bien', 1: 42, 999: 'Fuera', '-1': 'x', 2: ' \n ', 3: 'Con\nsalto', ['__proto__']: 'x' } })) as SavedCombo
    expect(migrateSavedCombo(stored).notes).toEqual({ 0: 'Bien', 3: 'Con salto' })
    expect('notes' in migrateSavedCombo({ ...combo, notes: 'no' as unknown as Record<string, string> })).toBe(false)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

/**
 * Un enlace v3 de verdad: el combo de referencia con dos notas, escrito con el código del primer v3. **No se regenera para que pase** (como `V2_LINK` en `combo-share-v2.test.ts`):
 * si falla, el formato cambió y los enlaces con notas ya compartidos dejaron de abrir.
 */
const V3_PAYLOAD =
  'zhZQ7b9swFIX_isD5uOV98aGxRQsUfSwdBQ2KYwRuHDswkiBBkB_TOejUMVvyx4or1YGNDOZ0zhV5PvJS4H0YLi9DG-7ONterq-2wGk4CwvlyfRraMN9cnGwCwk1oBWEe2i58e_mzXgxt8_z4cz2cL2af7hbPT837hpr5Znu1CAiv9ebzcrtovi7XZwGUq3A2jj7QdZ0pmabCkB5d4pilVplMrVUk6mhyrsSJbDTFilDlNJoq2Yglj4YipRxNy39XrdRiFeyOssVKOU5OzQrxtIxZc1aZVkmUmrLWyRShFFMcjSYWk0xuapyGC2LR7II1VXUhOSq50CqluEiUxVxkjYVdlKRcXdSSc0KNREQsLjzPk0mskCeTFkqeTCkaeTJlLlZ6dGG7vBlW7-bD9nS2O9SMAvbrVlVKlTij0PfoughBQgUxyEAFTGABJ3CFMMQgBQRFBkWQgBKoghms8KZFiEASpIJhKCACKSiDo3cqQgnKUIEq1KAJmqEFWmERRjCGCUy9_wYuEIIoJPsOzWCpR9eP-_VY81iwQRDhexqv1Avr69UK5Jflp6n-60AjOHpwD_X5DiF0nUBBcZpbXXk-Gczj45jC8P5bysWj9tAFAtpHlwN02aFpQpc36LxDMx9B13iA9s6A99BC-2imHZpHtNAbtN_if7YeY9MhWyFjz1_ZesCWHVsmtr5lyys7H2PzITtDxrRXdj5gpx1bJ3Z-y047tsRjbOn7Kf0-xNCGH5vtxbBqThfNami-nK2X8-XL33XbDCfbRbNYNfPh4tIfRdXQhg_Ddvj18rsdX7_BP38fbm-b58ePz0_hoX_4Bw'

describe('notas por paso: en el enlace', () => {
  it('un enlace v3 que ya se compartió sigue abriendo igual, con sus notas', async () => {
    const reference = withNotes({ 0: 'Normal de la Ignición: abre el campo', 44: 'Barajá: corta el Maxx «C»' })
    expect(await decodeComboPayload(V3_PAYLOAD)).toEqual({ ok: true, combo: { ...withoutId(reference), names: {} } })
  })

  it('ida y vuelta con notas, en v3; al guardarlo vienen con él', async () => {
    const combo = withNotes({ 0: 'Normal de la Ignición', 44: 'Barajá: corta el Maxx' })
    const payload = await encodeComboPayload(combo)
    expect(compactEnvelope(combo)).toMatchObject({ v: 3 })
    const result = await decodeComboPayload(payload)
    expect(result).toEqual({ ok: true, combo: { ...withoutId(combo), names: {} } })
    if (result.ok) expect(toSavedCombo(result.combo, []).notes).toEqual(combo.notes)
    // Con `auto` también: el lugar de `auto` va siempre en v3 (`null` sin él).
    const auto = { ...combo, auto: true as const }
    expect(parseComboText(JSON.stringify(compactEnvelope(auto)))).toEqual({ ok: true, combo: { ...withoutId(auto), names: {} } })
  })

  it('sin notas (o con ninguna) sigue en v2, igual que antes', () => {
    const combo = referenceCombo()
    const plain = JSON.stringify(compactEnvelope(combo))
    expect(JSON.parse(plain)).toMatchObject({ v: 2 })
    expect(JSON.stringify(compactEnvelope({ ...combo, notes: {} }))).toBe(plain)
    // v1 no cambia: no lleva notas.
    expect(JSON.stringify(comboEnvelope(withNotes({ 0: 'x' })))).toBe(JSON.stringify(comboEnvelope(combo)))
  })

  it('140 caracteres en cada paso de un combo de 45 jugadas todavía entran en un enlace', async () => {
    const combo = withNotes(Object.fromEntries(Array.from({ length: 10 }, (_, n) => [n * 4, `Paso ${n}: ${'a b c d e '.repeat(13)}`.slice(0, MAX_NOTE)])))
    const link = buildComboLink('https://ygoultralab.app', '/', await encodeComboPayload(combo))
    expect(link.length).toBeLessThan(MAX_LINK_LENGTH)
  })

  it('lo de adentro es texto: HTML en una nota vuelve tal cual, como texto', () => {
    const html = '<img src=x onerror=alert(1)> <a href="javascript:alert(1)">ver</a>'
    expect(parseComboText(v3({ 0: html }))).toMatchObject({ ok: true, combo: { notes: { 0: html } } })
  })

  it('una nota enorme, con salto, vacía, o una clave basura: roto', () => {
    const hostile = [
      v3({ 0: 'x'.repeat(MAX_NOTE + 1) }),
      v3({ 0: 'con\nsalto' }),
      v3({ 0: ' borde' }),
      v3({ 0: 'doble  espacio' }),
      v3({ 0: '' }),
      v3({ 0: 42 }),
      v3({ 45: 'fuera de las jugadas' }),
      v3({ '-1': 'x' }),
      v3({ '01': 'x' }),
      v3({ x: 'x' }),
      v3('{"__proto__":"x"}'),
      '{"app":"ygoultralab","kind":"combo","v":3,"c":["a"]}',
      v3([]),
      v3('texto'),
      // v3 sin el lugar de las notas, y v2 con notas.
      JSON.stringify({ ...compactEnvelope(referenceCombo()), v: 3 }),
      JSON.stringify({ ...compactEnvelope(referenceCombo()), c: [...compactEnvelope(referenceCombo()).c, null, { 0: 'x' }] }),
    ]
    for (const text of hostile) expect(parseComboText(text), text.slice(-80)).toEqual({ ok: false, error: 'broken' })
    // Un `__proto__` como clave de verdad (JSON.parse lo deja como propia): roto, y nada se contamina.
    const proto = v3({ 0: 'x' }).replace('{"0":"x"}', '{"__proto__":"x"}')
    expect(parseComboText(proto)).toEqual({ ok: false, error: 'broken' })
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    // Bien armado, sí abre: las de arriba fallan por lo que cambian.
    expect(parseComboText(v3({ 0: 'x' })).ok).toBe(true)
  })
})
