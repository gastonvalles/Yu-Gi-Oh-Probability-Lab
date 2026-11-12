import { afterEach, describe, expect, it } from 'vitest'

import { cardTypeLabel } from '../app/card-frame'
import { applyLocale } from '../i18n'

describe('cardTypeLabel: el tipo del chip de la ficha, en el idioma de la app', () => {
  afterEach(() => applyLocale('es'))

  it('en español usa los nombres que ya tienen los filtros del buscador; lo que no tiene traducción queda como el juego lo llama', () => {
    applyLocale('es')
    expect(cardTypeLabel({ frameType: 'normal', cardType: 'Normal Monster' })).toBe('Normal')
    expect(cardTypeLabel({ frameType: 'effect', cardType: 'Effect Monster' })).toBe('Efecto')
    expect(cardTypeLabel({ frameType: 'xyz_pendulum', cardType: 'XYZ Pendulum Effect Monster' })).toBe('Xyz · Péndulo')
    expect(cardTypeLabel({ frameType: 'spell', cardType: 'Spell Card', race: 'Quick-Play' })).toBe('Mágica de Juego Rápido')
    expect(cardTypeLabel({ frameType: 'trap', cardType: 'Trap Card', race: 'Normal' })).toBe('Trampa Normal')
    expect(cardTypeLabel({ frameType: 'spell', cardType: 'Spell Card', race: null })).toBe('Mágica')
    expect(cardTypeLabel({ frameType: 'token', cardType: 'Token' })).toBe('Token')
    expect(cardTypeLabel({ frameType: 'skill', cardType: 'Skill Card' })).toBe('Skill Card')
  })

  it('en inglés queda el nombre del juego tal cual', () => {
    applyLocale('en')
    expect(cardTypeLabel({ frameType: 'normal', cardType: 'Normal Monster' })).toBe('Normal Monster')
    expect(cardTypeLabel({ frameType: 'spell', cardType: 'Spell Card', race: 'Quick-Play' })).toBe('Spell Card')
  })
})
