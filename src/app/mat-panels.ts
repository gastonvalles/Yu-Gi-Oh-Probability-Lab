import { useMemo, useState, type CSSProperties, type RefObject } from 'react'

import { useElementWidth } from './use-element-width'
import { isRecord } from './utils'

/**
 * Los paneles de los costados de la mesa de escritorio (Gastón, 2026-10-22: «que el panel izquierdo con la carta y el panel derecho con los combos y pasos se puedan agrandar o achicar haciendo hover
 * sobre los bordes y arrastrando»): el detalle de la carta a la izquierda (desde 1440 px) y los pasos y combos —o el chat de un duelo— a la derecha (desde 1101 px). Cada uno mide 20 rem hasta que se
 * arrastra su borde; lo elegido se recuerda en el navegador (uno para la práctica y el duelo: es cómo se ve la mesa) y la mesa del medio nunca queda más angosta que `MAT_MIN_PX`.
 *
 * Lo guardado es lo que se eligió y no se pisa al achicar la ventana: lo que se usa sale de recortarlo a lo que entra (`fitPanels`), así que si la ventana vuelve a crecer, vuelve el ancho elegido.
 */

const REM_PX = 16

/** El ancho de siempre de los dos paneles (20 rem): sin elegir otro, la mesa queda como era. */
export const PANEL_DEFAULT_PX = 20 * REM_PX
/** Lo más angosto: 16 rem (medido: a 14 la fila de un combo guardado —Cargar, renombrar y borrar— no entra y la lista se corre de costado; a 15 se corta la fecha del combo). */
export const PANEL_MIN_PX = 16 * REM_PX
/** Lo más ancho: 36 rem (más que eso es un panel que le quita la mesa a la mesa). */
export const PANEL_MAX_PX = 36 * REM_PX
/**
 * Lo que la mesa del medio no pierde nunca: apenas menos de lo más angosta que ya era (1101 px con el menú abierto y el panel de 20 rem: 531 px), porque la barra del duelo no achica sus vidas ni sus
 * íconos. Medido en la práctica: la barra de arriba pide 480 px (más con un turno de dos cifras) y el campo, la mano y la del rival del simulador entran enteros, en 3D y en 2D.
 */
export const MAT_MIN_PX = 33 * REM_PX

export const MAT_PANELS_KEY = 'ygo-lab:mat-panels:v1'

export type PanelSide = 'left' | 'right'

/** Lo elegido para cada panel, en px; `null` es el ancho de siempre. */
export interface MatPanels {
  left: number | null
  right: number | null
}

/** Qué paneles hay ahora (el detalle sólo desde 1440 px; el de la derecha, en un duelo sólo con el chat). */
export type PanelsShown = Record<PanelSide, boolean>

/** El ancho de cada panel en la grilla de la mesa (`--mat-left` / `--mat-right`, con 20 rem si no se eligió otro). */
const PANEL_VAR = { left: '--mat-left', right: '--mat-right' } as const satisfies Record<PanelSide, string>

const OTHER = { left: 'right', right: 'left' } as const satisfies Record<PanelSide, PanelSide>

/** Lo más ancho que puede ir un panel junto al otro (`other`: lo que mide; 0 si no está) sin dejar la mesa con menos de su mínimo: nunca más de 36 rem ni menos de 16. */
export const panelMax = (section: number, other: number): number => Math.max(PANEL_MIN_PX, Math.min(PANEL_MAX_PX, section - other - MAT_MIN_PX))

/** Un ancho entre el mínimo y `max`, en px enteros. */
export const clampPanel = (width: number, max: number = PANEL_MAX_PX): number => Math.min(Math.max(PANEL_MIN_PX, max), Math.max(PANEL_MIN_PX, Math.round(width)))

/**
 * Lo que mide cada panel en una sección de ese ancho: lo elegido (o el de siempre), recortado a lo que entra. Si no entran los dos con la mesa, cede primero el de la derecha (hasta su mínimo) y
 * después el detalle. Un panel que no está mide 0.
 */
export function fitPanels(chosen: MatPanels, section: number, shown: PanelsShown): Record<PanelSide, number> {
  const left = shown.left ? clampPanel(chosen.left ?? PANEL_DEFAULT_PX, panelMax(section, shown.right ? PANEL_MIN_PX : 0)) : 0
  const right = shown.right ? clampPanel(chosen.right ?? PANEL_DEFAULT_PX, panelMax(section, left)) : 0

  return { left, right }
}

/** Un ancho guardado que se entiende (un número; lo de afuera del rango se acota) o el de siempre. */
const parsePanel = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? clampPanel(value) : null)

/** Lo guardado, o los anchos de siempre si no hay o no se entiende (cada panel por su lado). */
export function readMatPanels(storage: () => Storage = () => localStorage): MatPanels {
  let stored: unknown = null

  try {
    stored = JSON.parse(storage().getItem(MAT_PANELS_KEY) ?? 'null')
  } catch {
    // Sin almacenamiento o lo guardado no se entiende: valen los de siempre.
  }

  return isRecord(stored) && !Array.isArray(stored) ? { left: parsePanel(stored.left), right: parsePanel(stored.right) } : { left: null, right: null }
}

export function writeMatPanels(panels: MatPanels, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(MAT_PANELS_KEY, JSON.stringify({ left: panels.left, right: panels.right }))
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

/** Lo que necesita el agarre del borde de un panel (`ResizeHandle`): su ancho, sus topes y qué hacer al arrastrarlo, al soltarlo y con el doble clic. */
export interface PanelHandle {
  value: number
  min: number
  max: number
  /** Mientras se arrastra: el ancho nuevo directo en la sección, sin volver a dibujar la mesa; `null` vuelve al de antes. */
  onPreview: (width: number | null) => void
  onCommit: (width: number) => void
  onReset: () => void
}

/**
 * Los anchos de los paneles de la mesa (`sectionRef`: la sección con la grilla, que lleva las variables): `style` va en la sección y `left` / `right` en los agarres de cada borde. Mientras se
 * arrastra se escribe la variable directo en la sección (la mesa es enorme: no se vuelve a dibujar en cada cuadro); al soltar queda el estado y se guarda.
 */
export function useMatPanels(sectionRef: RefObject<HTMLElement | null>, shown: PanelsShown): { style: CSSProperties; left: PanelHandle; right: PanelHandle } {
  const [chosen, setChosen] = useState(() => readMatPanels())
  const measured = useElementWidth(sectionRef)
  // Sin medir todavía (o en las pruebas, sin diseño), la sección no recorta nada.
  const section = measured > 0 ? measured : Number.POSITIVE_INFINITY
  const fitted = fitPanels(chosen, section, shown)
  // Un panel lleva su variable si se eligió su ancho o si no le entra el de siempre; si no, queda el de la clase (20 rem): quien nunca toca un borde ve la mesa como siempre.
  const widthOf = (side: PanelSide) => (shown[side] && (chosen[side] !== null || fitted[side] !== PANEL_DEFAULT_PX) ? `${fitted[side]}px` : undefined)
  const left = widthOf('left')
  const right = widthOf('right')
  const style = useMemo(() => ({ ...(left ? { [PANEL_VAR.left]: left } : {}), ...(right ? { [PANEL_VAR.right]: right } : {}) }) as CSSProperties, [left, right])

  const save = (next: MatPanels) => {
    setChosen(next)
    writeMatPanels(next)
  }

  const handle = (side: PanelSide): PanelHandle => {
    const other = OTHER[side]

    return {
      value: fitted[side],
      min: PANEL_MIN_PX,
      max: panelMax(section, fitted[other]),
      onPreview: (width) => {
        const element = sectionRef.current
        const value = width === null ? widthOf(side) : `${width}px`

        if (!element) return
        if (value) element.style.setProperty(PANEL_VAR[side], value)
        else element.style.removeProperty(PANEL_VAR[side])
      },
      // Lo que se ve es lo que queda: si el otro panel estaba recortado (la ventana es más chica que cuando se eligió), se guarda como se ve, así no vuelve a crecer mientras se achica este.
      onCommit: (width) => save({ ...chosen, [side]: width, ...(shown[other] && fitted[other] !== (chosen[other] ?? PANEL_DEFAULT_PX) ? { [other]: fitted[other] } : {}) }),
      onReset: () => save({ ...chosen, [side]: null }),
    }
  }

  return { style, left: handle('left'), right: handle('right') }
}
