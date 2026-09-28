import { describe, expect, it } from 'vitest'

import { sanitizeFilename } from '../app/deck-image-export-download'

describe('sanitizeFilename', () => {
  it('conserva las letras con tilde o ñ sin acento en vez de cortarlas', () => {
    expect(sanitizeFilename('Dragón Blanco de Ojos Azules')).toBe('dragon-blanco-de-ojos-azules')
    expect(sanitizeFilename('Niño Ñandú')).toBe('nino-nandu')
  })

  it('reemplaza símbolos por guiones y recorta los extremos', () => {
    expect(sanitizeFilename('  Snake-Eye / Fire King!!  ')).toBe('snake-eye-fire-king')
  })

  it('usa un nombre por defecto si no queda nada válido', () => {
    expect(sanitizeFilename('¿?¡!')).toBe('deck-export')
  })
})
