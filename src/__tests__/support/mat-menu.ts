import { fireEvent, screen } from '@testing-library/react'

/** El ⋯ de la barra de la mesa (`MatMoreMenu`): el botón «Más opciones» que abre un menú. */
export const matMenuButton = () => screen.getAllByRole('button', { name: 'Más opciones' }).find((button) => button.getAttribute('aria-haspopup') === 'menu')!

/** Las filas del ⋯ abierto (`menuitem` y, los ajustes, `menuitemcheckbox`). */
const rows = () => [...screen.getByRole('menu').querySelectorAll<HTMLElement>('[role^="menuitem"]')]

const matcher = (name: string | RegExp) => (typeof name === 'string' ? (text: string) => text.startsWith(name) : (text: string) => name.test(text))

/**
 * Abre el ⋯ de la barra de la mesa (si no está abierto) y devuelve la fila cuyo texto empieza con `name` (el texto suma el dato chico de la derecha: «Handtraps del rivalapagadas»). Sin ⋯ (Solo y Online
 * llevan todo en ⚙), la fila de Opciones (`optionRow`).
 */
export function menuRow(name: string | RegExp): HTMLElement {
  if (!screen.queryByRole('menu') && !screen.queryAllByRole('button', { name: 'Más opciones' }).some((button) => button.getAttribute('aria-haspopup') === 'menu')) return optionRow(name)
  if (!screen.queryByRole('menu')) fireEvent.click(matMenuButton())
  const match = matcher(name)
  const row = rows().find((element) => match(element.textContent ?? ''))

  if (!row) throw new Error(`El ⋯ de la mesa no tiene «${String(name)}»: ${rows().map((element) => element.textContent).join(' · ')}`)
  return row
}

/** Toca una fila del ⋯ de la mesa (lo abre si hace falta). */
export const tapMenu = (name: string | RegExp) => fireEvent.click(menuRow(name))

/** Abre Opciones, el ⚙ de abajo a la derecha de un duelo automático (si no está abierto), y devuelve su diálogo. */
export function openOptions(): HTMLElement {
  if (!screen.queryByRole('dialog', { name: 'Opciones' })) fireEvent.click(screen.getByRole('button', { name: 'Opciones' }))
  return screen.getByRole('dialog', { name: 'Opciones' })
}

/** Abre Opciones (si hace falta) y devuelve lo que se toca de una fila: el botón de una acción («Nueva mano ›») o el interruptor de un ajuste («Sonidos»), por su nombre. */
export function optionRow(name: string | RegExp): HTMLElement {
  const dialog = openOptions()
  const match = matcher(name)
  const controls = [...dialog.querySelectorAll<HTMLElement>('button, [role="switch"]')]
  const row = controls.find((element) => match(element.getAttribute('aria-label') ?? element.textContent ?? ''))

  if (!row) throw new Error(`Opciones no tiene «${String(name)}»: ${controls.map((element) => element.getAttribute('aria-label') ?? element.textContent).join(' · ')}`)
  return row
}
