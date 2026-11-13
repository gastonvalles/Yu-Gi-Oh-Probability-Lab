import { cardMatchesOpcode } from 'ocgcore-wasm'
import { announceEntries, announceMatches } from '../app/auto/announce'
import type { ApiCardSearchResult } from '../ygoprodeck/types'

/** Declarar cualquier carta: el catálogo del armador, buscado por nombre (sin mayúsculas ni tildes, parcial), con el filtro de la carta que la declara. */
const card = (ygoprodeckId: number, name: string, cardType: string, extra: Partial<ApiCardSearchResult> = {}): ApiCardSearchResult =>
  ({ ygoprodeckId, name, cardType, frameType: '', description: null, race: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, ...extra }) as ApiCardSearchResult
const CATALOG = announceEntries([
  card(46986414, 'Dark Magician', 'Normal Monster', { race: 'Spellcaster', attribute: 'DARK', level: 7, atk: '2500', def: '2100' }),
  card(38033121, 'Dark Magician Girl', 'Effect Monster', { race: 'Spellcaster', attribute: 'DARK', level: 6, atk: '2000', def: '1700' }),
  card(44095762, 'Mirror Force', 'Trap Card', { race: 'Normal' }),
  card(15259703, 'Toon World', 'Spell Card', { race: 'Continuous' }),
  card(73915052, 'Sheep Token', 'Token', { race: 'Beast', attribute: 'EARTH', level: 1 }),
])
const OPCODE_ISTYPE = '4611687126528950272'
const OPCODE_NOT = '4611686048492158976'
const TYPE_NORMAL = '16'
const find = (query: string, opcodes: string[] = [], skip: number[] = []) => announceMatches(CATALOG, query, opcodes, cardMatchesOpcode, new Set(skip)).map((entry) => entry.name)

describe('declarar una carta del catálogo', () => {
  it('escribir parte del nombre la encuentra, sin mayúsculas ni tildes; las que empiezan así, primero; sin texto, ninguna; las fichas, nunca', () => {
    expect(find('magician')).toEqual(['Dark Magician', 'Dark Magician Girl'])
    expect(find('MÍRROR')).toEqual(['Mirror Force'])
    expect(find('to')).toEqual(['Toon World'])
    expect(find('  ')).toEqual([])
    expect(find('sheep')).toEqual([])
    expect(CATALOG.find((entry) => entry.name === 'Mirror Force')!.code).toBe(44095762)
  })

  it('el filtro de la carta deja afuera la que no vale (Mind Scan: «que no sea un Monstruo Normal»); las que ya ofrece el anfitrión no se repiten', () => {
    expect(find('magician', [TYPE_NORMAL, OPCODE_ISTYPE, OPCODE_NOT])).toEqual(['Dark Magician Girl'])
    expect(find('magician', [], [46986414])).toEqual(['Dark Magician Girl'])
  })

  it('un filtro de arquetipo (el catálogo no trae `setcode`) no se juzga acá: valen sólo las que ofrece el anfitrión', () => {
    expect(find('magician', ['4611687122233982976'])).toEqual([])
  })
})
