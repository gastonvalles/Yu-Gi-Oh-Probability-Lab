import type { ChainLink } from '../app/auto/adapter'
import type { AskCard } from '../app/auto/ask-ui'
import { askWhy, askWhyText } from '../app/auto/ask-why'
import { formatMessage } from '../i18n'
import { auto as en } from '../i18n/en/auto'

const ASH = 14558127
const link = (code: number, state: ChainLink['state'] = 'chained'): ChainLink => ({ card: { side: 'mine', id: `c${code}` }, code, description: String(code * 16), state })
const hand: AskCard = { ref: { side: 'mine', id: 'h1' }, code: 1, place: 'hand' }
const grave: AskCard = { ref: { side: 'theirs', id: 'g1' }, code: 2, place: 'pile', pile: 'gy' }
const field: AskCard = { ref: { side: 'theirs', id: 'f1' }, code: 3, place: 'field' }

describe('askWhy: de qué carta es lo que se pregunta (sólo lo que se sabe)', () => {
  it('activándose, elegir de la mano es el costo; del campo o del Cementerio, «al activar» (puede ser un objetivo)', () => {
    const overlay = { chain: [link(ASH)], activating: true as const }

    expect(askWhy('select_card', overlay, [hand])).toEqual({ role: 'cost', code: ASH, ref: { side: 'mine', id: `c${ASH}` }, link: 1 })
    expect(askWhy('select_card', overlay, [grave, field])?.role).toBe('activation')
    expect(askWhy('select_option', overlay)?.role).toBe('activation')
  })

  it('con un eslabón resolviéndose, es su efecto aunque se elija de la mano', () => {
    const overlay = { chain: [link(1), link(ASH, 'solving')] }

    expect(askWhy('select_card', overlay, [hand])).toMatchObject({ role: 'effect', code: ASH, link: 2 })
    expect(askWhy('select_place', overlay)?.role).toBe('effect')
  })

  it('nunca inventa: sin cadena, con la cadena armada y sin activarse nada, o en las preguntas que ya dicen su carta, nada', () => {
    expect(askWhy('select_tribute', { chain: [] }, [field])).toBeNull()
    expect(askWhy('select_place', { chain: [link(ASH)] })).toBeNull()
    expect(askWhy('select_effectyn', { chain: [link(ASH)], activating: true })).toBeNull()
    expect(askWhy('select_chain', { chain: [link(ASH, 'solving')] })).toBeNull()
  })

  it('la línea, en los dos idiomas', () => {
    expect(askWhyText('cost', 'Ash Blossom')).toBe('Costo de Ash Blossom')
    expect(askWhyText('effect', 'Ash Blossom')).toBe('Efecto de Ash Blossom')
    expect(formatMessage(en['auto.askWhy.activation'], { name: 'Ash Blossom' }, 'en')).toBe('Activating Ash Blossom')
  })
})
