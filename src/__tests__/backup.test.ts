// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { collectBackup, parseBackup, restoreBackup } from '../app/backup'

beforeEach(() => {
  localStorage.clear()
})

describe('la copia de seguridad', () => {
  it('junta lo nuestro (sin las cachés ni lo de otros) y se restaura igual después de borrar todo', () => {
    localStorage.setItem('ygo-probability-lab:v2', '{"deck":1}')
    localStorage.setItem('ygo-lab:saved-builds', '[1,2]')
    localStorage.setItem('ygo-lab:practice-combos', '[]')
    localStorage.setItem('ygo-probability-lab:api-cache:v2', '{"big":true}')
    localStorage.setItem('ygo-lab-cache:v1', '{"big":true}')
    localStorage.setItem('ygo-lab:chunk-reload', '1')
    localStorage.setItem('otra-app', 'x')

    const backup = collectBackup(localStorage, new Date('2026-10-12T10:00:00Z'))

    expect(backup).toEqual({
      app: 'ygo-probability-lab',
      version: 1,
      savedAt: '2026-10-12T10:00:00.000Z',
      entries: { 'ygo-probability-lab:v2': '{"deck":1}', 'ygo-lab:saved-builds': '[1,2]', 'ygo-lab:practice-combos': '[]' },
    })

    localStorage.clear()
    expect(restoreBackup(parseBackup(JSON.stringify(backup)))).toBe(3)
    expect(localStorage.getItem('ygo-probability-lab:v2')).toBe('{"deck":1}')
    expect(localStorage.getItem('ygo-lab:saved-builds')).toBe('[1,2]')
    expect(localStorage.getItem('otra-app')).toBeNull()
  })

  it('un duelo en curso (su mesa guardada y quién lo creó) no entra en la copia ni se restaura desde un archivo ajeno', () => {
    localStorage.setItem('ygo-lab:saved-builds', '[1]')
    localStorage.setItem('ygo-lab:duel-save:ABCDEFG2:host', '{"v":1}')
    localStorage.setItem('ygo-lab:duel-role:ABCDEFG2', 'host')
    // El duelo automático guardado lleva la clave del duelo: tampoco viaja.
    localStorage.setItem('ygo-lab:auto-save:ABCDEFG2', '{"v":2}')

    expect(Object.keys(collectBackup(localStorage).entries)).toEqual(['ygo-lab:saved-builds'])

    const file = '{"app":"ygo-probability-lab","entries":{"ygo-lab:saved-builds":"[2]","ygo-lab:duel-save:HJKMNPQ3:guest":"{}","ygo-lab:duel-role:HJKMNPQ3":"guest","ygo-lab:auto-save:HJKMNPQ3":"{}"}}'

    expect(parseBackup(file).entries).toEqual({ 'ygo-lab:saved-builds': '[2]' })
  })

  it('rechaza lo que no es una copia de esta app, y de una copia sólo toma lo nuestro', () => {
    expect(() => parseBackup('no es json')).toThrow('El archivo no es un JSON válido.')
    expect(() => parseBackup('{"app":"otra","entries":{}}')).toThrow('no es una copia de seguridad de esta app')
    expect(() => parseBackup('[]')).toThrow('no es una copia de seguridad de esta app')
    expect(() => parseBackup('{"app":"ygo-probability-lab","entries":{"otra-app":"x","ygo-lab:chunk-reload":"1"}}')).toThrow('La copia está vacía.')

    const parsed = parseBackup('{"app":"ygo-probability-lab","entries":{"ygo-lab:saved-builds":"[]","otra-app":"x","ygo-lab:mal":5}}')
    expect(parsed.entries).toEqual({ 'ygo-lab:saved-builds': '[]' })
    expect(parsed.savedAt).toBe('')
  })

  it('restaurar escribe encima de lo que hay y deja lo que la copia no trae', () => {
    localStorage.setItem('ygo-lab:saved-builds', '[old]')
    localStorage.setItem('ygo-lab:practice-combos', '[mine]')

    restoreBackup({ app: 'ygo-probability-lab', version: 1, savedAt: '', entries: { 'ygo-lab:saved-builds': '[new]' } })

    expect(localStorage.getItem('ygo-lab:saved-builds')).toBe('[new]')
    expect(localStorage.getItem('ygo-lab:practice-combos')).toBe('[mine]')
  })
})
