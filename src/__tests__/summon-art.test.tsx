// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SUMMON_ART_KEY, setSummonArt, summonArtOn } from '../app/summon-art'
import { MatMoreMenu } from '../components/probability/MatBarActions'

// «Imagen de la carta al invocar (beta)» (`app/summon-art.ts`): apagada de fábrica, se prende desde «La mesa» y se recuerda tras recargar.
describe('el interruptor de la irrupción al invocar', () => {
  afterEach(() => {
    cleanup()
    setSummonArt(false)
    localStorage.removeItem(SUMMON_ART_KEY)
  })

  it('viene apagado, se prende desde «La mesa» y se guarda', () => {
    expect(summonArtOn()).toBe(false)
    render(<MatMoreMenu items={[]} defaultOpen />)
    const row = screen.getByRole('menuitemcheckbox', { name: /^Imagen de la carta al invocar \(beta\)/ })

    expect(row).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(row)
    expect(summonArtOn()).toBe(true)
    expect(localStorage.getItem(SUMMON_ART_KEY)).toBe('on')
  })

  it('al recargar se lee lo guardado; apagarla borra la clave', async () => {
    localStorage.setItem(SUMMON_ART_KEY, 'on')
    vi.resetModules()
    const fresh = await import('../app/summon-art')

    expect(fresh.summonArtOn()).toBe(true)
    fresh.setSummonArt(false)
    expect(localStorage.getItem(SUMMON_ART_KEY)).toBeNull()
  })
})
