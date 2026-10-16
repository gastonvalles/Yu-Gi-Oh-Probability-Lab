import { describe, expect, it } from 'vitest'

import { isYdkeLink, pastedDeckAsYdk } from '../app/deck-import'
import { buildYdkeUrl } from '../app/ydke'
import { createInitialState } from '../app/model'

describe('importar un enlace ydke:// (o un .ydk pegado)', () => {
  const LINK = 'ydke://o6lXBa70zAJKcEkD7iX+BBLZoAKjqVcFrvTMAkpwSQPuJf4EEtmgAg==!!!'

  it('reconoce el enlace y lo vuelve el texto de un .ydk con los números de las cartas de cada zona', () => {
    expect(isYdkeLink(`  ${LINK}  `)).toBe(true)
    expect(isYdkeLink('3 Ash Blossom & Joyous Spring')).toBe(false)

    const ydk = pastedDeckAsYdk(LINK)

    expect(ydk).toBe(['#main', 89631139, 46986414, 55144522, 83764718, 44095762, 89631139, 46986414, 55144522, 83764718, 44095762, '#extra', '!side'].join('\n'))
  })

  it('el enlace que arma la exportación del deck se vuelve a leer (ida y vuelta)', () => {
    const state = createInitialState().deckBuilder

    // Vacío no es un deck: el Main tiene que tener cartas.
    expect(pastedDeckAsYdk(buildYdkeUrl(state))).toBeNull()
  })

  it('un enlace roto da null, y un .ydk pegado pasa tal cual', () => {
    expect(pastedDeckAsYdk('ydke://esto-no-es-base64!!!')).toBeNull()
    expect(pastedDeckAsYdk('#created by Ana\n#main\n14558127\n#extra\n!side')).toContain('#main')
    expect(pastedDeckAsYdk('3 Ash Blossom & Joyous Spring\n3 Maxx "C"')).toBeNull()
  })
})
