// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { SidebarLegal } from '../components/shell/SidebarLegal'
import { SOURCE_URL } from '../components/ui/SocialLinks'

/**
 * La app es software libre bajo la AGPL-3.0 o posterior y eso se cumple: el texto de la licencia, el paquete y el aviso dicen lo mismo, y la app le ofrece su código a quien la usa en línea
 * (cláusula 13). Si alguien cambia la licencia o saca el enlace, esta prueba lo frena: un cambio así es una decisión de quien es dueño del proyecto, no un detalle.
 */
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('la licencia', () => {
  it('es la AGPL-3.0 o posterior: el texto, el paquete y el aviso lo dicen igual', () => {
    expect(read('LICENSE')).toMatch(/^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/)
    expect(JSON.parse(read('package.json')).license).toBe('AGPL-3.0-or-later')
    expect(read('NOTICE.md')).toContain('AGPL-3.0-or-later')
  })

  it('la app ofrece el código fuente a quien la usa en línea: un enlace en el pie del menú', () => {
    render(<SidebarLegal />)

    expect(screen.getByRole('link', { name: 'Código fuente' })).toHaveAttribute('href', SOURCE_URL)
  })

  it('las páginas legales no dicen «todos los derechos reservados» y enlazan el código', () => {
    for (const page of ['public/privacidad.html', 'public/privacy.html']) {
      const html = read(page)

      expect(html, page).not.toMatch(/derechos reservados|all rights reserved/i)
      expect(html, page).toContain(SOURCE_URL)
    }
  })
})
