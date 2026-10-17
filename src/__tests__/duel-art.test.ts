import { describe, expect, it } from 'vitest'

import { artOfDrawId, passcodeOfDrawId } from '../components/duel/duel-art'

describe('el número de YGOPRODeck de lo que el rival mostró', () => {
  it('sale del id de una carta real, y de nada más (una ficha, un id opaco o nada no son una carta que se pueda nombrar)', () => {
    expect(passcodeOfDrawId('card-14558127-2')).toBe(14558127)
    expect(passcodeOfDrawId('token-3')).toBeNull()
    expect(passcodeOfDrawId('c12')).toBeNull()
    expect(passcodeOfDrawId('cualquier cosa')).toBeNull()
  })

  it('el arte usa el mismo número; sin él (una carta que no mostró) no hay arte', () => {
    expect(artOfDrawId('card-14558127-2')).toBe('https://images.ygoprodeck.com/images/cards_small/14558127.jpg')
    expect(artOfDrawId(undefined)).toBeNull()
    expect(artOfDrawId('c12')).toBeNull()
  })
})
