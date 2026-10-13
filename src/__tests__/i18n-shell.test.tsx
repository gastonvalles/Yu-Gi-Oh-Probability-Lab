// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { parseBackup } from '../app/backup'
import { duelistName } from '../app/life-calculator'
import { formatInteger } from '../app/utils'
import { buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { navToneLabel } from '../components/shell/nav-model'
import { CopiesBadge } from '../components/ui/CopiesBadge'
import { applyLocale } from '../i18n'

afterEach(() => {
  applyLocale('es')
})

describe('el armazón de la app en inglés', () => {
  it('la barra de pasos dice lo que falta en cada idioma', () => {
    const snapshot = { mainDeckCount: 28, roleCardCount: 28, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 }

    expect(buildDeckWorkflowNavigationItems(snapshot)[0]).toMatchObject({ label: 'Deck', detail: '12 para llegar a 40.', tone: 'progress' })
    expect(navToneLabel('complete')).toBe('Listo')

    applyLocale('en')

    expect(buildDeckWorkflowNavigationItems(snapshot).map((item) => item.label)).toEqual(['Deck', 'Roles', 'Lab', 'Compare', 'Export', 'Meta', 'Replays'])
    expect(buildDeckWorkflowNavigationItems(snapshot)[0]).toMatchObject({ detail: '12 more to reach 40.' })
    expect(buildDeckWorkflowNavigationItems(snapshot)[1]).toMatchObject({ detail: '3 still open.' })
    expect(navToneLabel('complete')).toBe('Done')
  })

  it('los números llevan el separador de cada idioma y las copias, su plural', () => {
    expect(formatInteger(12345)).toBe('12.345')

    applyLocale('en')

    expect(formatInteger(12345)).toBe('12,345')

    const { rerender } = render(<CopiesBadge copies={1} />)
    expect(screen.getByLabelText('1 copy')).toBeInTheDocument()

    rerender(<CopiesBadge copies={3} />)
    expect(screen.getByLabelText('3 copies')).toBeInTheDocument()
  })

  it('los avisos y nombres que arma la lógica salen en inglés', () => {
    expect(() => parseBackup('no es json')).toThrow('El archivo no es un JSON válido.')
    expect(duelistName(1)).toBe('Duelista 2')

    applyLocale('en')

    expect(() => parseBackup('no es json')).toThrow('The file is not valid JSON.')
    expect(() => parseBackup('{}')).toThrow('The file is not a backup of this app.')
    expect(duelistName(1)).toBe('Duelist 2')
  })
})
