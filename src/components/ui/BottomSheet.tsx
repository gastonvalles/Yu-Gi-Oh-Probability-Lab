import { createContext, useCallback, useContext, useMemo, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'

import { useEscapeKey } from '../../app/use-overlay'
import { useSheetDrag } from '../../app/use-sheet-drag'
import { useSwipeFold } from '../../app/use-swipe-fold'
import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'

/** El asa sola, como tira con su título (bajada, o cediendo el lugar): 44 px. */
const TAB_PX = 44

/** Qué le pide la mesa a sus hojas: `grip`, reducirse a su asa (se elige en la mesa o en la mano: que se vea lo que se toca); `hide`, esconderse (otra hoja, el visor de una pila, ocupa el lugar). */
export type SheetYield = 'grip' | 'hide' | null

interface SheetHostValue {
  yieldTo: SheetYield
  /** En un marco del catálogo: las hojas van adentro (`absolute`, sin portal) y las preguntas se dibujan como en el celular en cualquier ancho. */
  phone: boolean
}

const SheetHostContext = createContext<SheetHostValue | null>(null)

/**
 * Las hojas de abajo de una mesa (la cadena, las preguntas) ceden el lugar unas a otras (`yieldTo`) en vez de apilarse.
 * `yieldTo` lo decide la mesa (`PracticeMat`); `phone`, el catálogo (un marco con su mesa de mentira). Sin `SheetHost` (otra pantalla), cada hoja es la suya.
 */
export function SheetHost({ yieldTo = null, phone = false, children }: { yieldTo?: SheetYield; phone?: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ yieldTo, phone }), [yieldTo, phone])

  return <SheetHostContext.Provider value={value}>{children}</SheetHostContext.Provider>
}

export function useSheetHost(): SheetHostValue | null {
  return useContext(SheetHostContext)
}

interface BottomSheetProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** El nombre de la hoja: lo dice el asa («Subir la hoja: Cadena») y, como tira, se lee en ella. */
  label: string
  /** Subida, debajo del asa: el título (también arrastra). */
  head?: ReactNode
  /** Lo que se decide (las candidatas, los botones): debajo de todo y a la vista en las dos alturas; sólo se va mientras la hoja cede el lugar. */
  footer?: ReactNode
  /** Lo de abajo, sólo subida: se desplaza y, bajada, queda inerte. */
  children?: ReactNode
  /** Cada vez que cambia, la hoja sube entera (un eslabón que se suma a la cadena, otra pila). */
  raiseKey?: unknown
  /** Escape la baja (si Escape no hace otra cosa). */
  escape?: boolean
  /** Por encima de la mesa y sus carteles (`z-180`): el visor de una pila. Si no, `z-[135]`, debajo del menú de una carta. */
  over?: boolean
  /** Cede el lugar cuando la mesa lo pide (`SheetHost.yieldTo`): la cadena y las preguntas, no el visor. */
  yields?: boolean
  /** Un toque afuera la cierra (el visor de una pila): un fondo sin velo que, bajada, deja pasar los toques a la mesa. */
  onDismiss?: () => void
  ref?: Ref<HTMLDivElement>
}

/**
 * La hoja de abajo del celular, una sola para todo (Gastón, 2026-11-02: «uno estandarizado que se use siempre», sin espacios vacíos y que se arrastre): las preguntas de la
 * mesa (`MatPrompt` hasta 1101 px) y el visor de una pila (`PileViewer`). Muestras: «Hoja de abajo» en Diálogos y la hoja de la cadena en Auto.
 * - **Se arrastra siempre** desde su franja de arriba (el asa y `head`/`peek`: `useSheetDrag`, sigue al dedo y decide un tirón o 64 px) o se toca; el asa es un `button` con `aria-expanded`.
 * - **Dos alturas:** subida, todo; bajada, la tira del asa (44 px) con el título. `footer` va debajo en las dos. Arranca subida y `raiseKey` la vuelve a subir.
 * - **Sin huecos:** de borde a borde y apoyada abajo, abraza lo que lleva (hasta 55 dvh) y el borde del sistema (`safe-area`) va adentro, en su pie. Lo que baja se recorta en el borde del pie.
 * - **Una sola a la vez** (`SheetHost`): cediendo (`grip`) queda su asa sobre la línea de estado y sin pie (un toque o arrastrarla la muestra igual); escondida (`hide`), no está.
 * - **Recta y opaca** (Gastón, 2026-11-10 y 2026-11-11): todas sus hojas son de la mesa, así que va siempre con `mat-square` y el fondo entero (nada de la mano se lee a través), y el asa también es recta.
 * - Sólo `transform`/`translate`: entra con `animate-sheet-up` y sale al revés (dentro de un `Presence`). Bajada, lo tapado es inerte y el foco pasa al asa.
 */
export function BottomSheet({ label, head, footer, children, raiseKey, escape = false, over = false, yields = false, onDismiss, ref, className, hidden = false, ...props }: BottomSheetProps) {
  const host = useSheetHost()
  const inline = host?.phone === true
  const yieldTo = yields ? (host?.yieldTo ?? null) : null
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Cediendo, un toque en el asa la muestra igual, hasta que la mesa deje de pedirlo (y lo vuelva a pedir).
  const [shown, setShown] = useState(false)
  const [lastYield, setLastYield] = useState(yieldTo)

  if (lastYield !== yieldTo) {
    setLastYield(yieldTo)
    setShown(false)
  }
  const tab = yieldTo === 'grip' && !shown
  const drag = useSheetDrag(panelRef, TAB_PX)
  const lowered = drag.lowered || tab
  const [lastRaise, setLastRaise] = useState(raiseKey)

  if (lastRaise !== raiseKey) {
    setLastRaise(raiseKey)
    drag.setLowered(false)
  }
  useEscapeKey(() => drag.setLowered(true), escape && !lowered)

  const toggle = () => (tab ? setShown(true) : drag.toggle())
  // Cediendo, arrastrarla para arriba también la muestra.
  const swipe = useSwipeFold({ dir: 'up', onFold: toggle })
  // El fondo de `onDismiss` cierra sólo si el toque empezó ahí (como el del `Modal`): el clic que sigue al toque que la abrió no la cierra.
  const pressed = useRef(false)
  // El alto del pie, en la hoja como `--sheet-foot`: lo baja la tira. Se escribe sin volver a dibujar.
  const footerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => node.parentElement?.style.setProperty('--sheet-foot', `${node.offsetHeight}px`))

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const sheet = (
    <div
      ref={ref}
      {...props}
      data-lowered={lowered ? '' : undefined}
      hidden={hidden || yieldTo === 'hide'}
      className={cx(
        // `mat-square`: es una hoja de la mesa, con sus esquinas rectas (sale por un portal: no hereda los radios en 0 de la raíz de la mesa).
        'mat-square pointer-events-none inset-x-0 bottom-0 flex flex-col motion-safe:animate-sheet-up',
        inline ? 'absolute top-0' : 'fixed h-[55dvh]',
        over ? 'z-180' : 'z-[135]',
        // Cediendo, el asa se apoya sobre la línea de estado de la mesa (44 px a 8 del borde): «Cancelar» y «Listo» quedan a la vista. Sube y baja deslizándose, como la hoja de adentro. Como tira,
        // el pie sigue en su lugar (transparente, `--sheet-foot` de alto): la hoja baja ese alto en vez de que el pie se esconda y el asa salte.
        'motion-safe:transition-[translate] motion-safe:duration-200 motion-safe:ease-snap',
        tab ? 'translate-y-[calc(var(--sheet-foot,0px)-3.25rem-env(safe-area-inset-bottom,0px))]' : yieldTo === 'grip' && '-translate-y-[calc(3.25rem+env(safe-area-inset-bottom,0px))]',
        className,
      )}
    >
      {/* Lo que la hoja deja abajo al bajar se recorta en el borde de arriba del pie. `overflow-clip` y no `hidden`: una caja `hidden` se deja desplazar (un `scrollIntoView` de adentro la subía). */}
      <div className="flex min-h-0 flex-1 items-end overflow-clip">
        <div ref={panelRef} style={tab ? { ...drag.style, translate: `0 calc(100% - ${TAB_PX}px)` } : drag.style} className="pointer-events-auto flex max-h-full w-full flex-col rounded-t-panel border border-b-0 border-border bg-card-background shadow-overlay">
          <div
            {...(tab ? swipe : drag.handlers)}
            className="flex-none touch-none select-none"
            onClick={(event) => {
              const control = (event.target as Element).closest('a, button, input, [role="listbox"]')

              if (control === null || control === drag.gripRef.current) toggle()
            }}
          >
            <button
              ref={drag.gripRef}
              type="button"
              aria-expanded={!lowered}
              aria-label={lowered ? t('common.sheet.raise', { title: label }) : t('common.sheet.lower')}
              className={cx('group flex w-full items-center justify-center px-4 outline-none', lowered ? 'h-11' : 'h-7')}
            >
              {/* El aro del foco va en la pastilla de adentro: el de todo el botón lo cortaría el borde de la hoja. Como un botón de ícono, se enciende en lima al apuntarla. */}
              <span className={cx('flex min-w-0 items-center gap-1.5 px-3 text-foreground group-hover:text-info group-focus-visible:shadow-focus', lowered ? 'h-8' : 'h-5')}>
                {lowered ? (
                  <>
                    <Icon name="chevron-up" size={14} strokeWidth={2} className="shrink-0" />
                    <span aria-hidden="true" className="truncate text-micro font-semibold">
                      {label}
                    </span>
                  </>
                ) : (
                  <span aria-hidden="true" className="block h-1 w-10 bg-primary-soft/50 group-hover:bg-info" />
                )}
              </span>
            </button>
            {head ? (
              // Como tira sigue en su lugar (inerte, recortado debajo del asa): esconderlo achicaba la hoja y el asa saltaba antes de deslizarse.
              <div hidden={lowered && !tab} inert={lowered}>
                {head}
              </div>
            ) : null}
          </div>
          {children ? (
            // Bajada queda fuera de la pantalla, inerte y transparente: lo que asoma (el borde de abajo del celular) no repite lo de arriba.
            <div inert={lowered} className={cx('flex min-h-0 flex-1 flex-col motion-safe:transition-opacity', lowered && 'opacity-0')}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
      {/* El pie: lo que se decide y el borde del sistema. Sigue a la hoja sin borde de arriba ni radio: es la misma superficie. */}
      <div
        ref={footerRef}
        inert={tab}
        className={cx(
          'flex-none border-x border-border bg-card-background pb-[env(safe-area-inset-bottom,0px)] transition-opacity duration-200 motion-reduce:transition-none',
          tab ? 'pointer-events-none opacity-0' : 'pointer-events-auto',
        )}
      >
        {footer}
      </div>
    </div>
  )
  // Escondida (`hidden`: otra hoja le ganó el lugar), sigue montada como estaba (bajada, si lo estaba) y su fondo no ataja toques.
  const view = onDismiss ? (
    <>
      <div
        aria-hidden="true"
        hidden={hidden}
        className={cx('inset-0', inline ? 'absolute' : 'fixed', over ? 'z-180' : 'z-[135]', lowered && 'pointer-events-none')}
        onPointerDown={(event) => {
          pressed.current = event.target === event.currentTarget
        }}
        onClick={(event) => {
          if (pressed.current && event.target === event.currentTarget) onDismiss()
        }}
      />
      {sheet}
    </>
  ) : (
    sheet
  )

  return inline ? view : createPortal(view, document.body)
}
