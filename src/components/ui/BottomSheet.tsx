import { createContext, useContext, useMemo, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'

import { useEscapeKey } from '../../app/use-overlay'
import { useSheetDrag } from '../../app/use-sheet-drag'
import { useSwipeFold } from '../../app/use-swipe-fold'
import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'

/** El asa sola, como tira con su título (bajada sin `peek`, o cediendo el lugar): 44 px. */
const TAB_PX = 44
/** El asa de arriba (la raya, 28 px) más la fila de `peek` (56 px): lo que queda a la vista bajada con `peek`. */
const PEEK_PX = 28 + 56

/** Qué le pide la mesa a sus hojas: `grip`, reducirse a su asa (se elige en la mesa o en la mano: que se vea lo que se toca); `hide`, esconderse (otra hoja, el visor de una pila, ocupa el lugar). */
export type SheetYield = 'grip' | 'hide' | null

interface SheetHostValue {
  yieldTo: SheetYield
  /** Dónde va lo que se decide de otra hoja de la mesa mientras ésta está abierta (el pie de la hoja de la cadena): así hay una sola hoja, con una sola asa. */
  slot: HTMLElement | null
  setSlot: (node: HTMLElement | null) => void
  /** En un marco del catálogo: las hojas van adentro (`absolute`, sin portal) y las preguntas se dibujan como en el celular en cualquier ancho. */
  phone: boolean
}

const SheetHostContext = createContext<SheetHostValue | null>(null)

/**
 * Las hojas de abajo de una mesa (la cadena, las preguntas) comparten una sola superficie: la que lleva `hostsFooter` presta su pie y las demás (`MatPrompt`) van ahí, en vez de apilarse.
 * `yieldTo` lo decide la mesa (`PracticeMat`); `phone`, el catálogo (un marco con su mesa de mentira). Sin `SheetHost` (otra pantalla), cada hoja es la suya.
 */
export function SheetHost({ yieldTo = null, phone = false, children }: { yieldTo?: SheetYield; phone?: boolean; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ yieldTo, slot, setSlot, phone }), [yieldTo, slot, phone])

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
  /** Bajada, en lugar de `head`: una fila de 56 px que sigue a la vista (la cinta de la cadena; se monta al bajarla). Sin ella, bajada queda la tira del asa con su título. */
  peek?: ReactNode
  /** Lo que se lee en voz alta en las dos alturas (un `status` en `sr-only`): va en la franja de arriba, fuera de lo que se esconde. */
  status?: ReactNode
  /** Lo que se decide (las candidatas, los botones): debajo de todo y a la vista en las dos alturas; sólo se va mientras la hoja cede el lugar. */
  footer?: ReactNode
  /** Presta su pie a las otras hojas de la mesa (`SheetHost`): ahí van sus preguntas. */
  hostsFooter?: boolean
  /** Lo de abajo, sólo subida: se desplaza y, bajada, queda inerte. */
  children?: ReactNode
  /** Cada vez que cambia, la hoja sube entera (un eslabón que se suma a la cadena, otra pila). */
  raiseKey?: unknown
  startLowered?: boolean
  /** Escape la baja (si Escape no hace otra cosa). */
  escape?: boolean
  /** Más alta: hasta min(70 dvh, 34 rem) con su pie (la cadena); si no, hasta 55 dvh (el campo se ve arriba). */
  tall?: boolean
  /** Por encima de la mesa y sus carteles (`z-180`): el visor de una pila. Si no, `z-[135]`, debajo del menú de una carta. */
  over?: boolean
  /** Cede el lugar cuando la mesa lo pide (`SheetHost.yieldTo`): la cadena y las preguntas, no el visor. */
  yields?: boolean
  /** Un toque afuera la cierra (el visor de una pila): un fondo sin velo que, bajada, deja pasar los toques a la mesa. */
  onDismiss?: () => void
  ref?: Ref<HTMLDivElement>
}

/**
 * La hoja de abajo del celular, una sola para todo (Gastón, 2026-11-02: «uno estandarizado que se use siempre», sin espacios vacíos y que se arrastre): la cadena (`ChainSheet`), las preguntas de la
 * mesa (`MatPrompt` hasta 1101 px) y el visor de una pila (`PileViewer`). Muestras: «Hoja de abajo» en Diálogos y la hoja de la cadena en Auto.
 * - **Se arrastra siempre** desde su franja de arriba (el asa y `head`/`peek`: `useSheetDrag`, sigue al dedo y decide un tirón o 64 px) o se toca; el asa es un `button` con `aria-expanded`.
 * - **Dos alturas:** subida, todo; bajada, la fila `peek` (o la tira del asa, 44 px, con el título). `footer` va debajo en las dos. Arranca subida y `raiseKey` la vuelve a subir.
 * - **Sin huecos:** de borde a borde y apoyada abajo, abraza lo que lleva (hasta 55 dvh o, `tall`, 70) y el borde del sistema (`safe-area`) va adentro, en su pie. Lo que baja se recorta en el borde del pie.
 * - **Una sola a la vez** (`SheetHost`): el pie de la cadena recibe las preguntas; cediendo (`grip`) queda su asa sobre la línea de estado y sin pie (un toque o arrastrarla la muestra igual); escondida (`hide`), no está.
 * - Sólo `transform`/`translate`: entra con `animate-sheet-up` y sale al revés (dentro de un `Presence`). Bajada, lo tapado es inerte y el foco pasa al asa.
 */
export function BottomSheet({ label, head, peek, status, footer, hostsFooter = false, children, raiseKey, startLowered = false, escape = false, tall = false, over = false, yields = false, onDismiss, ref, className, ...props }: BottomSheetProps) {
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
  const drag = useSheetDrag(panelRef, tab || !peek ? TAB_PX : PEEK_PX, startLowered)
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
  const asTab = lowered && (tab || !peek)

  const sheet = (
    <div
      ref={ref}
      {...props}
      data-lowered={lowered ? '' : undefined}
      hidden={yieldTo === 'hide'}
      className={cx(
        'pointer-events-none inset-x-0 bottom-0 flex flex-col motion-safe:animate-sheet-up',
        inline ? 'absolute top-0' : tall ? 'fixed h-[min(70dvh,34rem)]' : 'fixed h-[55dvh]',
        over ? 'z-180' : 'z-[135]',
        // Cediendo, el asa se apoya sobre la línea de estado de la mesa (44 px a 8 del borde): «Cancelar» y «Listo» quedan a la vista.
        yieldTo === 'grip' && '-translate-y-[calc(3.25rem+env(safe-area-inset-bottom,0px))]',
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
              className={cx('group flex w-full items-center justify-center px-4 outline-none', asTab ? 'h-11' : 'h-7')}
            >
              {/* El aro del foco va en la pastilla de adentro: el de todo el botón lo cortaría el borde de la hoja. Como un botón de ícono, se enciende en ámbar al apuntarla. */}
              <span className={cx('flex min-w-0 items-center gap-1.5 rounded-full px-3 text-foreground group-hover:text-info group-focus-visible:shadow-focus', asTab ? 'h-8' : 'h-5')}>
                {asTab ? (
                  <>
                    <Icon name="chevron-up" size={14} strokeWidth={2} className="shrink-0" />
                    <span aria-hidden="true" className="truncate text-micro font-semibold">
                      {label}
                    </span>
                  </>
                ) : (
                  <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-primary-soft/50 group-hover:bg-info" />
                )}
              </span>
            </button>
            {status}
            {peek && lowered && !tab ? <div className="h-14">{peek}</div> : null}
            {head ? (
              <div hidden={lowered} inert={lowered}>
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
      <div ref={hostsFooter ? host?.setSlot : undefined} hidden={tab} inert={tab} className="pointer-events-auto flex-none border-x border-border bg-card-background pb-[env(safe-area-inset-bottom,0px)]">
        {footer}
      </div>
    </div>
  )
  const view = onDismiss ? (
    <>
      <div
        aria-hidden="true"
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
