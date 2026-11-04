import { describe, expect, it } from 'vitest'

import { presenceNotice } from '../app/duel-presence'

const snap = ({ peerPresent = true, lp = [8000, 8000], match = false, winner = null as 0 | 1 | null } = {}) => ({
  peerPresent,
  life: { lp } as never,
  conceded: null,
  series: { match, winner } as never,
})

describe('el aviso de presencia de la mesa: uno solo', () => {
  it('mi conexión caída manda sobre todo', () => {
    expect(presenceNotice(snap({ peerPresent: false, lp: [0, 8000] }), 'reconnecting')).toBe('offline')
  })

  it('con el rival en la sala no hay aviso', () => {
    expect(presenceNotice(snap(), 'open')).toBeNull()
  })

  it('el rival se cae en pleno duelo: puede volver', () => {
    expect(presenceNotice(snap({ peerPresent: false }), 'open')).toBe('away')
  })

  it('el duelo terminó y el rival no está: se fue (la sala se cierra), no «se desconectó»', () => {
    expect(presenceNotice(snap({ peerPresent: false, lp: [0, 8000] }), 'open')).toBe('left')
  })

  it('entre dos duelos de un Match todavía abierto, el rival puede volver', () => {
    expect(presenceNotice(snap({ peerPresent: false, lp: [0, 8000], match: true }), 'open')).toBe('away')
    expect(presenceNotice(snap({ peerPresent: false, lp: [0, 8000], match: true, winner: 1 }), 'open')).toBe('left')
  })
})
