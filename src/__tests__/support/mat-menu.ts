import { fireEvent, screen } from '@testing-library/react'

/** El ⋯ de la barra de la mesa (`MatMoreMenu`): el botón «Más opciones» que abre un menú. */
export const matMenuButton = () => screen.getAllByRole('button', { name: 'Más opciones' }).find((button) => button.getAttribute('aria-haspopup') === 'menu')!

/** Las filas del ⋯ abierto (`menuitem` y, los ajustes, `menuitemcheckbox`). */
const rows = () => [...screen.getByRole('menu').querySelectorAll<HTMLElement>('[role^="menuitem"]')]

/** Abre el ⋯ de la barra de la mesa (si no está abierto) y devuelve la fila cuyo texto empieza con `name` (el texto suma el dato chico de la derecha: «Handtraps del rivalapagadas»). */
export function menuRow(name: string | RegExp): HTMLElement {
  if (!screen.queryByRole('menu')) fireEvent.click(matMenuButton())
  const match = typeof name === 'string' ? (text: string) => text.startsWith(name) : (text: string) => name.test(text)
  const row = rows().find((element) => match(element.textContent ?? ''))

  if (!row) throw new Error(`El ⋯ de la mesa no tiene «${String(name)}»: ${rows().map((element) => element.textContent).join(' · ')}`)
  return row
}

/** Toca una fila del ⋯ de la mesa (lo abre si hace falta). */
export const tapMenu = (name: string | RegExp) => fireEvent.click(menuRow(name))
