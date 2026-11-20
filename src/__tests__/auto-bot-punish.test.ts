import { describe, expect, it } from 'vitest'
import type { BotCard, BotSide, BotView, PublicEvent } from '../app/auto/bot/bot'
import { createPunishments, reach } from '../app/auto/bot/punish'

/** Los castigos del rival (`punish.ts`): el precio de una clase de acción se aprende por las vidas que pierde después de hacerla y se olvida cuando deja tu campo lo que estaba. */

const card = (code: number, attack = 0): BotCard => ({ ref: { side: 'theirs', id: `c${code}` }, code, place: null, pos: 'atk', stats: { attack, defense: 0, level: 4 } })
const side = (monsters: (BotCard | null)[] = [], spells: (BotCard | null)[] = []): BotSide => ({ hand: [], monsters: [...monsters, ...Array(7 - monsters.length).fill(null)], spells: [...spells, ...Array(6 - spells.length).fill(null)], grave: [], banished: [], extraFaceUp: [], extraFaceDown: 0, deckCount: 30 })
const view = (lp: number, them: BotSide, history: PublicEvent[] = [], me: BotSide = side()): BotView => ({ seat: 1, me, them, lp: { me: lp, them: 8000 }, turn: 2, turnPlayer: 'me', phase: 0x4, chain: [], limits: { me: [], them: [] }, history })

describe('los castigos del rival', () => {
  const dragon = card(73218989, 3000)

  it('aprende el precio de activar un efecto de monstruo, no lo paga si lo deja al alcance de tu ataque y lo olvida cuando la carta deja tu campo', () => {
    const punish = createPunishments()
    const field = side([dragon])

    punish.observe(view(8000, field))
    punish.acted(view(8000, field), 'monster')
    punish.observe(view(7300, field))
    expect(punish.price('monster')).toBe(700)
    expect(punish.price('spell')).toBe(0)
    // Con 3500 vidas, otro efecto lo deja en 2800: al alcance de tus 3000 de ATK.
    expect(punish.allows(view(3500, field), 'monster', false)).toBe(false)
    expect(punish.allows(view(3500, field), 'spell', false)).toBe(true)
    punish.observe(view(7300, side()))
    expect(punish.price('monster')).toBe(0)
  })

  it('no aprende si en el medio hubo un ataque (es daño de batalla) y respeta el tope del turno salvo sin monstruos propios', () => {
    const punish = createPunishments()
    const field = side([card(1)])

    punish.observe(view(8000, field))
    punish.acted(view(8000, field), 'special')
    punish.observe(view(7000, field, [{ kind: 'attack', side: 'them', code: 1, target: null }]))
    expect(punish.price('special')).toBe(0)
    punish.acted(view(7000, field, [{ kind: 'attack', side: 'them', code: 1, target: null }]), 'special')
    punish.observe(view(6000, field, [{ kind: 'attack', side: 'them', code: 1, target: null }]))
    expect(punish.price('special')).toBe(1000)
    // Ya pagó 1000 de 2000 (un cuarto de 8000): otros 1000 entran justo, con un monstruo suyo no más.
    expect(punish.allows(view(6000, field, [], side([card(2, 1000)])), 'special', false)).toBe(true)
  })

  it('lo que te puede pegar: tus ATK menos los que frena un monstruo suyo igual o más fuerte', () => {
    expect(reach(view(8000, side([card(1, 3000), card(2, 1500)]), [], side([card(3, 2000)])))).toBe(3000)
  })
})
