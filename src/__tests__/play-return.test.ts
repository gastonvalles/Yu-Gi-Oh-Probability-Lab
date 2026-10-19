// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearPlayReturn, openBuilderFromPlay, readPlayReturn } from '../app/play-return'

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel?room=ABCD2345')
})

afterEach(() => {
  window.history.replaceState(null, '', '#duel')
})

describe('ir al builder desde Jugar', () => {
  it('abre el builder y recuerda la sala o el lobby de donde se salió', () => {
    openBuilderFromPlay()

    expect(window.location.hash).toBe('#deck-builder')
    expect(readPlayReturn()).toBe('#duel?room=ABCD2345')
  })

  it('sin dirección guardada vuelve al lobby de Jugar', () => {
    window.history.replaceState(null, '', window.location.pathname)
    openBuilderFromPlay()

    expect(readPlayReturn()).toBe('#duel')
  })

  it('al volver se borra el recuerdo', () => {
    openBuilderFromPlay()
    clearPlayReturn()

    expect(readPlayReturn()).toBeNull()
  })
})
