// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { loadState } from '../app/persistence'

beforeEach(() => localStorage.clear())

describe('datos de funciones que ya no existen', () => {
  it('al cargar, se borra lo que dejó el calificador de manos y no se toca el resto', () => {
    localStorage.setItem('ygo-lab:hand-samples:v1', '{"rated":3}')
    localStorage.setItem('ygo-lab:locale', 'es')

    loadState()

    expect(localStorage.getItem('ygo-lab:hand-samples:v1')).toBeNull()
    expect(localStorage.getItem('ygo-lab:locale')).toBe('es')
  })
})
