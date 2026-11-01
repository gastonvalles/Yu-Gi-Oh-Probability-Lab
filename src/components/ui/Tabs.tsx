import { useRef, type KeyboardEvent } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface TabOption<T extends string> {
  value: T
  label: string
  /** Un número al lado del rótulo (las cartas de «La tuya»). */
  count?: number
  icon?: IconName
  disabled?: boolean
  /** El nombre para el lector, si la pestaña dice más que su rótulo («La tuya, con 12 cartas»). */
  ariaLabel?: string
}

interface TabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<TabOption<T>>
  /** El nombre del grupo para el lector de pantalla. */
  label: string
  /** Partes iguales a todo el ancho (el celular); sin él, cada pestaña a su ancho. */
  fullWidth?: boolean
  /** El `id` del `tabpanel` que cambian: cada pestaña lo nombra en `aria-controls` y se llama `tabId(panelId, value)` (para el `aria-labelledby` del panel). */
  panelId?: string
  className?: string
}

/** El `id` de una pestaña cuando hay `panelId`: el panel lo usa en `aria-labelledby`. */
export const tabId = (panelId: string, value: string) => `${panelId}-tab-${value}`

/**
 * La vista: lo que cambia la pantalla entera (otra lista, otra cosa que ver). Texto con un subrayado ámbar de 3 px, como la navegación, sin píldora: no se confunde con un
 * `Segmented` ni con una fila de filtros.
 *
 * - **Props:** `value`, `onChange`, `options` (`value`, `label`, `count?`, `icon?`, `disabled?`, `ariaLabel?`), `label`, `fullWidth?`, `panelId?`.
 * - **Variantes:** a su ancho (escritorio) o `fullWidth` (partes iguales, el celular). Si no entran, la fila se desliza de costado sin barra, como `ScrollRow`.
 * - **Estados:** normal · hover (tinte) · foco (`shadow-focus`) · elegida (texto y subrayado ámbar, rótulo en negrita) · apagada (`disabled`, tenue y sin hover).
 * - **Accesibilidad:** `tablist` con su nombre; cada `tab` con `aria-selected` y *roving tabindex* (sólo la elegida entra con Tab); ← → mueven y eligen (saltando las apagadas) e
 *   Inicio/Fin van a la primera y la última; `aria-controls` cuando hay `panelId`. 44 px de alto. La elegida no cambia de ancho: el rótulo reserva el de la negrita (regla 7).
 * - **Hacer:** una por pantalla, arriba de todo lo que aparece o desaparece al cambiar de pestaña. **No hacer:** usarla para un filtro (va `Segmented scroll` o `FilterChips`)
 *   ni apilar otra barra de pastillas pegada abajo.
 * - **Usos:** Tier lists (Hand traps · Boardbreakers · La tuya), la tarjeta de Banlists (Cambios · Lista completa) y la muestra de `/playground` (Navegación).
 */
export function Tabs<T extends string>({ value, onChange, options, label, fullWidth = false, panelId, className }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const enabled = options.filter((option) => !option.disabled)
  // La que entra con Tab: la elegida o, si está apagada, la primera que se puede usar.
  const focusable = enabled.some((option) => option.value === value) ? value : enabled[0]?.value

  const select = (next: T) => {
    if (next === value) return

    const hadFocus = listRef.current?.contains(document.activeElement) ?? false

    onChange(next)
    // Si la pantalla cambia de árbol al elegir (Tier lists → «La tuya»), estas pestañas se desmontan y el foco se perdería: pasa a la misma pestaña de las nuevas.
    if (hadFocus) {
      requestAnimationFrame(() => {
        if (!listRef.current) document.querySelector<HTMLElement>(`[role=tablist][aria-label=${JSON.stringify(label)}] [data-value=${JSON.stringify(next)}]`)?.focus()
      })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = enabled.findIndex((option) => option.value === (event.target as HTMLElement).dataset.value)
    const last = enabled.length - 1
    const next = { ArrowRight: at + 1 > last ? 0 : at + 1, ArrowLeft: at - 1 < 0 ? last : at - 1, Home: 0, End: last }[event.key]

    if (at < 0 || next === undefined) return

    event.preventDefault()
    const target = enabled[next] as TabOption<T>

    listRef.current?.querySelector<HTMLElement>(`[data-value="${target.value}"]`)?.focus()
    select(target.value)
  }

  return (
    <div className={cx('min-w-0 border-b border-border-subtle', className)}>
      {/* El aro de foco (4 px por fuera) cabe en el relleno; el margen negativo lo compensa: la fila no cambia de alto y el subrayado queda sobre la línea. */}
      <div className="-m-1 overflow-x-auto overscroll-x-contain p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          className={cx(fullWidth ? 'grid min-w-full grid-flow-col auto-cols-[minmax(max-content,1fr)]' : 'flex', 'w-max')}
          onKeyDown={onKeyDown}
        >
          {options.map((option) => {
            const selected = option.value === value

            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                id={panelId ? tabId(panelId, option.value) : undefined}
                aria-selected={selected}
                aria-controls={panelId}
                aria-label={option.ariaLabel}
                tabIndex={option.value === focusable ? 0 : -1}
                disabled={option.disabled}
                data-value={option.value}
                className={cx(
                  // `px-2` en el celular: las tres de Tier lists («La tuya 12» incluida) entran en 390 px sin deslizarse.
                  'relative flex min-h-11 items-center justify-center gap-1.5 px-2 text-body min-[1101px]:px-3 transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
                  selected ? 'text-nav-active' : 'text-foreground/85 enabled:hover:bg-tint/10 enabled:hover:text-foreground',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
                onClick={() => select(option.value)}
              >
                {option.icon ? <Icon name={option.icon} size={18} variant={selected ? 'bold' : 'bulk'} className="shrink-0" /> : null}
                {/* La copia invisible en negrita reserva el ancho: al elegirla, ninguna pestaña se corre. */}
                <span className="grid whitespace-nowrap">
                  <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">
                    {option.label}
                  </span>
                  <span className={cx('col-start-1 row-start-1', selected ? 'font-semibold' : 'font-medium')}>{option.label}</span>
                </span>
                {option.count !== undefined ? (
                  <span className={cx('rounded-tag px-1.5 text-micro font-semibold tabular-nums', selected ? 'bg-nav-active/15' : 'bg-lavender')}>{option.count}</span>
                ) : null}
                {selected ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.75 bg-nav-active" /> : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
