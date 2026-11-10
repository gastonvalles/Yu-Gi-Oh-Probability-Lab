// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { isOnline, useOnline } from '../app/use-online'

/** Lo que dice el navegador (`navigator.onLine`) y el evento que lo anuncia, como al perder y recuperar la red. */
function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

function Probe() {
  return <p>{useOnline() ? 'con red' : 'sin red'}</p>
}

afterEach(() => {
  act(() => setNavigatorOnline(true))
  cleanup()
})

describe('use-online', () => {
  it.each([
    [{ onLine: true }, true],
    [{ onLine: false }, false],
    [{}, true],
    [undefined, true],
  ])('con %o el navegador está en línea: %s', (nav, expected) => {
    expect(isOnline(nav)).toBe(expected)
  })

  it('sigue los eventos offline y online de la ventana', () => {
    render(<Probe />)
    expect(screen.getByText('con red')).toBeInTheDocument()

    act(() => setNavigatorOnline(false))
    expect(screen.getByText('sin red')).toBeInTheDocument()

    act(() => setNavigatorOnline(true))
    expect(screen.getByText('con red')).toBeInTheDocument()
  })
})
