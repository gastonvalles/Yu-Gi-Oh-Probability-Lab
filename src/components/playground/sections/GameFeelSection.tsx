import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, cancelWhenDone } from '../../../app/motion'
import { setEffects, useEffects } from '../../../app/effects'
import { useMediaQuery } from '../../../app/use-media-query'
import { PANEL_LIME } from '../../auto/AutoPanel'
import { CardArt } from '../../CardArt'
import { Button } from '../../ui/Button'
import { Callout } from '../../ui/Callout'
import { Heading } from '../../ui/Heading'
import { Segmented } from '../../ui/Segmented'
import { ShineFrame } from '../../ui/ShineFrame'
import { Switch } from '../../ui/Switch'
import { cx } from '../../ui/cx'
import { supportText } from '../../ui/typography'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

/*
 * «Impacto Ligero»: el prototipo de sensación de juego que pidió Gastón (botones y cartas con peso, cadenas, flipbooks, cortes), para tocarlo antes de llevar nada a las
 * pantallas. Todo DOM y compositor: transiciones y `@keyframes` de index.css («Impacto Ligero», al final) y la Web Animations API, sólo `transform`/`translate`/`scale`/`rotate`
 * y `opacity`. Las perillas de arriba valen para todas las muestras.
 */

interface Feel {
  /** «Efectos completos»: destellos aditivos, chispas y sacudida. Con «livianos», lo mismo a la misma velocidad, sin eso. */
  full: boolean
  shake: boolean
  bounce: 'soft' | 'hard'
  reduced: boolean
}

const FeelContext = createContext<Feel>({ full: true, shake: true, bounce: 'hard', reduced: false })
const useFeel = () => useContext(FeelContext)

/** Un token de movimiento de index.css, leído en el momento: la Web Animations API no resuelve `var()`. */
const token = (name: string, fallback = EASE_OUT) => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()) || fallback
/** Lo que entra entero: con «Rebote marcado» se pasa y vuelve; con «suave», se asienta sin pasarse. */
const entryEase = (feel: Feel) => (feel.bounce === 'hard' ? token('ease-out-back', EASE_SNAP) : EASE_SNAP)
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const animate = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => cancelWhenDone(element.animate(frames, options))

/** La sacudida del tablero: 4 px que vuelven exactos a su lugar (sólo `translate` del contenedor). */
const SHAKE: Keyframe[] = [{ translate: '0 0' }, { translate: '4px -3px' }, { translate: '-4px 2px' }, { translate: '3px 2px' }, { translate: '-2px -1px' }, { translate: '0 0' }]
const shake = (element: HTMLElement | null) => element && animate(element, SHAKE, { duration: 200, easing: EASE_OUT })

/** Arte de las muestras, del CDN de YGOPRODeck como en las otras muestras del catálogo (no se guarda en el repo). */
const small = (id: string) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`
const HAND = ['89631139', '46986414', '57554544', '14558127', '23434538']

export function GameFeelSamples() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // El ajuste de verdad (☰ «Efectos», `app/effects.ts`): cambiarlo acá lo cambia en toda la app.
  const effects = useEffects()
  const [shakeOn, setShakeOn] = useState(true)
  const [bounce, setBounce] = useState<'soft' | 'hard'>('hard')
  const full = effects === 'full'
  const feel = useMemo<Feel>(() => ({ full, shake: shakeOn && full && !reduced, bounce, reduced }), [full, shakeOn, bounce, reduced])
  const style = { '--feel-rebote': bounce === 'hard' ? 'var(--ease-rebote-marcado)' : 'var(--ease-rebote-suave)' } as CSSProperties

  return (
    <FeelContext.Provider value={feel}>
      <div id="sensacion" style={style} className="col-span-full grid min-w-0 scroll-mt-28 gap-4">
        <div className="grid gap-1">
          <Heading level="section" as="h3">
            Sensación de juego (prototipo)
          </Heading>
          <p className={cx(supportText, 'max-w-prose')}>
            «Impacto Ligero»: botones y cartas con peso, la cadena, flipbooks y cortes, para tocar y decidir antes de llevar nada a las pantallas. Todo con DOM y CSS en el compositor, sin
            librerías. Los efectos van con sus tres colores (dorado, cian y rojo, los del documento: <Tag>fx-destello</Tag>, <Tag>fx-energia</Tag> y <Tag>fx-impacto</Tag>); la cadena, en blanco y celeste. El rebote de los botones ya es de todo <Tag>Button</Tag>. Archivos: <Tag>playground/sections/GameFeelSection.tsx</Tag> y el bloque «Impacto Ligero» de{' '}
            <Tag>index.css</Tag>
          </p>
        </div>

        <Specimen title="Perillas (valen para todo)" layout="column" note="«Efectos» es el ajuste de verdad del ☰ (se guarda): «Livianos» es el interruptor de calidad del documento, menos destellos a la vez, sin sacudida ni mezcla aditiva, y la misma velocidad de respuesta.">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Knob label="Efectos">
              <Segmented label="Efectos" size="sm" value={effects} onChange={setEffects} options={[{ value: 'full', label: 'Completos' }, { value: 'lite', label: 'Livianos' }]} />
            </Knob>
            <Knob label="Rebote">
              <Segmented label="Rebote" size="sm" value={bounce} onChange={setBounce} options={[{ value: 'soft', label: 'Suave' }, { value: 'hard', label: 'Marcado' }]} />
            </Knob>
            <Knob label="Sacudida">
              <Switch label="Sacudida" checked={feel.shake} disabled={!full || reduced} onChange={setShakeOn} />
              {!full ? <span className="text-micro text-soft">apagada con efectos livianos</span> : null}
            </Knob>
          </div>
          {reduced ? (
            <Callout tone="warning" title="Tu sistema pide movimiento reducido">
              Nada rebota, se inclina ni se sacude; los cambios de pantalla van con un fundido y los flipbooks no corren.
            </Callout>
          ) : (
            <p className="text-micro text-soft">Tu sistema no pide movimiento reducido (si lo pidiera, nada rebotaría ni se sacudiría).</p>
          )}
        </Specimen>

        <SpecimenGrid min="22rem">
          <CurvesSample />
          <PressSample />
          <WeightSample />
          <ChainSample />
          <FlipbookSample />
          <ScreenSample />
          <LayersSample />
        </SpecimenGrid>
      </div>
    </FeelContext.Provider>
  )
}

function Knob({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-micro font-semibold text-muted">{label}</span>
      {children}
    </div>
  )
}

// ——— 1. Curvas y tiempos ———

interface Curve {
  name: string
  ms: number
  use: string
  fresh?: boolean
  /** `scale`: se mira como un botón que se achica y vuelve (las curvas por tramos se pasan un 80 %: en un recorrido se saldrían de la pista). */
  look?: 'move' | 'scale'
}

const CURVES: Curve[] = [
  { name: '--ease-out', ms: 240, use: 'Lo que entra o se queda.' },
  { name: '--ease-in-out', ms: 380, use: 'Lo que viaja: los vuelos de las cartas.' },
  { name: '--ease-snap', ms: 300, use: 'Lo que suelta un gesto; la carta que vuelve a la mano.' },
  { name: '--ease-gravedad-caida', ms: 90, use: 'El estampado: la carta cae acelerando, después de la pausa.' },
  { name: '--ease-out-back', ms: 220, use: 'Cambiar de pantalla y el número que golpea: se pasa un 10 % y vuelve.', fresh: true },
  { name: '--ease-rebote-marcado', ms: 280, use: 'Soltar un botón: de 90 a 100 % pasando por 108 %.', fresh: true, look: 'scale' },
  { name: '--ease-rebote-suave', ms: 280, use: 'Lo mismo, hasta 104 %.', fresh: true, look: 'scale' },
  { name: 'steps(10)', ms: 333, use: 'Flipbooks: 10 cuadros a 30 por segundo.' },
]

function CurvesSample() {
  const [values] = useState(() => Object.fromEntries(CURVES.map((curve) => [curve.name, curve.name.startsWith('--') ? token(curve.name.slice(2), '') : curve.name])))
  const chips = useRef<Array<HTMLSpanElement | null>>([])

  const play = (index: number) => {
    const curve = CURVES[index]!
    const chip = chips.current[index]
    const easing = values[curve.name] || EASE_OUT

    if (!chip) return
    if (curve.look === 'scale') {
      animate(chip, [{ scale: '0.9' }, { scale: '1' }], { duration: curve.ms, easing })
      return
    }
    const room = (chip.parentElement?.clientWidth ?? 0) - chip.offsetWidth
    chip.getAnimations().forEach((running) => running.cancel())
    chip.style.translate = ''
    // Queda al final de la pista (se ve dónde asienta la curva), escrito en el estilo: una animación terminada con `fill` dejaría la ficha como capa compuesta.
    const run = chip.animate([{ translate: '0 0' }, { translate: `${room}px 0` }], { duration: curve.ms, easing, fill: 'forwards' })
    run.finished.then(
      () => {
        run.commitStyles()
        run.cancel()
      },
      () => {},
    )
  }

  return (
    <Specimen
      title="1 · Curvas y tiempos"
      layout="column"
      className="col-span-full"
      note={<>Tocá una fila para ver su curva en una ficha (o «Tocar todas»). Las de la casa siguen; las tres nuevas son tokens en <Tag>index.css</Tag>. La pausa del estampado (hitstop) no es una curva: 2 o 3 cuadros quietos (33 a 50 ms).</>}
    >
      <Button size="sm" variant="secondary" icon="play" className="justify-self-start" onClick={() => CURVES.forEach((_, index) => play(index))}>
        Tocar todas
      </Button>
      <ul className="grid gap-2">
        {CURVES.map((curve, index) => (
          <li key={curve.name}>
            <button
              type="button"
              onClick={() => play(index)}
              className="grid w-full gap-x-4 gap-y-1 rounded-control border border-border-subtle px-3 py-2 text-left transition-colors hover:bg-tint/6 focus-visible:outline-none focus-visible:shadow-focus min-[1101px]:grid-cols-[14rem_minmax(0,1fr)_minmax(0,16rem)] min-[1101px]:items-center"
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-body font-semibold text-foreground">{curve.name}</span>
                <span className="text-micro tabular-nums text-muted">{curve.ms} ms</span>
                {curve.fresh ? <span className="text-micro font-semibold text-info-soft">nuevo</span> : null}
              </span>
              <span className="grid gap-1">
                <span className="text-micro text-soft">{curve.use}</span>
                <span className="text-micro text-muted [overflow-wrap:anywhere]">{values[curve.name] || '—'}</span>
              </span>
              <span className="relative flex h-8 items-center border-b border-border-subtle">
                <span
                  ref={(element) => void (chips.current[index] = element)}
                  aria-hidden
                  className={cx('block bg-primary', curve.look === 'scale' ? 'mx-auto h-7 w-20 rounded-control' : 'size-6 rounded-tag')}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Specimen>
  )
}

// ——— 2. El botón con rebote ———

function PressSample() {
  return (
    <Specimen
      title="2 · El botón con rebote"
      layout="column"
      note={
        <>
          Ya es de todo <Tag>Button</Tag>, <Tag>IconButton</Tag> y <Tag>TileButton</Tag> (<Tag>feel-press</Tag>): al apretar se achica al 90 % en 50 ms; al soltar vuelve pasando por 108 % (o
          104 % con «Rebote suave») en 280 ms. Sólo <Tag>scale</Tag>: no corre lo de al lado. Los grandes se hunden 94 % y los de ancho completo 96 % (la pasada es proporcional); apagados,
          no rebotan. El brillo en reposo es <Tag>ShineFrame</Tag>, sólo en la acción principal de una pantalla (con «livianos», sin el barrido).
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <ShineFrame>
          <Button variant="primary" color="success" size="lg" icon="play">
            Duelo
          </Button>
        </ShineFrame>
        <Button variant="primary" className={PANEL_LIME}>
          Invocar
        </Button>
        <Button variant="secondary" icon="layers">
          Ver mazo
        </Button>
        <Button variant="secondary" disabled>
          Apagado
        </Button>
      </div>
      <Button variant="primary" fullWidth icon="check">
        De ancho completo
      </Button>
    </Specimen>
  )
}

// ——— 3. La carta con peso ———

interface Drag {
  id: string
  element: HTMLButtonElement
  pointerId: number
  x0: number
  y0: number
  x: number
  y: number
  vx: number
  vy: number
  time: number
  rx: number
  ry: number
  scale: number
  moved: boolean
  frame: number
  over: number | null
  rects: DOMRect[]
}

interface Pose {
  x: number
  y: number
  rx: number
  ry: number
  scale: number
}

const pose = ({ x, y, rx, ry, scale }: Pose) => `translate(${x}px, ${y}px) perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`
const LIFTED: Pose = { x: 0, y: -10, rx: 0, ry: 0, scale: 1.15 }
/** Cuánto se inclina por cada px/ms de velocidad, el tope y cuánto se acerca a esa inclinación por cuadro (la amortiguación). */
const TILT_PER_SPEED = 30
const TILT_MAX = 18
const TILT_FOLLOW = 0.25
const CELLS = 3

function WeightSample() {
  const feel = useFeel()
  const feelRef = useRef(feel)
  const [hand, setHand] = useState(HAND)
  const [cells, setCells] = useState<Array<string | null>>(() => Array(CELLS).fill(null))
  const [armed, setArmed] = useState<string | null>(null)
  const [impact, setImpact] = useState<{ cell: number; n: number } | null>(null)
  const [hitstop, setHitstop] = useState<'0' | '2' | '3'>('3')
  const board = useRef<HTMLDivElement | null>(null)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const drag = useRef<Drag | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    feelRef.current = feel
  }, [feel])

  const markOver = (over: number | null) => cellRefs.current.forEach((cell, index) => cell && (cell.dataset.over = String(index === over)))

  const land = (id: string, cell: number, element: HTMLButtonElement, from: Pose) => {
    const slot = element.parentElement?.getBoundingClientRect()
    const target = cellRefs.current[cell]?.getBoundingClientRect()
    const commit = () => {
      flushSync(() => {
        setHand((current) => current.filter((card) => card !== id))
        setCells((current) => current.map((card, index) => (index === cell ? id : card)))
        setArmed(null)
        setImpact((current) => ({ cell, n: (current?.n ?? 0) + 1 }))
      })
      if (feelRef.current.shake) shake(board.current)
      busy.current = false
    }

    busy.current = true
    if (!slot || !target || feelRef.current.reduced) {
      commit()
      return
    }
    const x = target.left + target.width / 2 - (slot.left + slot.width / 2)
    const y = target.top + target.height / 2 - (slot.top + slot.height / 2)
    const peak = pose({ x, y: y - 22, rx: 0, ry: 0, scale: 1.24 })
    const hold = (Number(hitstop) * 1000) / 60
    const rise = 150
    const fall = 80
    const total = rise + hold + fall

    element.animate(
      [
        { transform: pose(from), easing: EASE_OUT },
        { transform: peak, offset: rise / total, easing: 'linear' },
        { transform: peak, offset: (rise + hold) / total, easing: token('ease-gravedad-caida') },
        { transform: pose({ x, y, rx: 0, ry: 0, scale: 1 }) },
      ],
      { duration: total, fill: 'forwards' },
    ).finished.then(commit, () => (busy.current = false))
  }

  const back = (element: HTMLButtonElement, from: Pose) => {
    element.style.transform = ''
    delete element.dataset.lifted
    if (!feelRef.current.reduced) animate(element, [{ transform: pose(from) }, { transform: 'none' }], { duration: 220, easing: EASE_SNAP })
  }

  const tick = () => {
    const current = drag.current

    if (!current) return
    const limit = feelRef.current.reduced ? 0 : TILT_MAX
    current.ry += (clamp(current.vx * TILT_PER_SPEED, limit) - current.ry) * TILT_FOLLOW
    current.rx += (clamp(-current.vy * TILT_PER_SPEED, limit) - current.rx) * TILT_FOLLOW
    current.scale += (LIFTED.scale - current.scale) * 0.35
    // Sin eventos nuevos (el dedo se frenó), la velocidad se apaga y la carta se endereza.
    current.vx *= 0.85
    current.vy *= 0.85
    current.element.style.transform = pose({ x: current.x, y: current.y + LIFTED.y, rx: current.rx, ry: current.ry, scale: current.scale })
    current.frame = requestAnimationFrame(tick)
  }

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (busy.current || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const lifted = armed === id
    drag.current = {
      id,
      element: event.currentTarget,
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      time: event.timeStamp,
      rx: 0,
      ry: 0,
      scale: lifted ? LIFTED.scale : 1,
      moved: false,
      frame: 0,
      over: null,
      rects: [],
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current

    if (!current || current.pointerId !== event.pointerId) return
    const x = event.clientX - current.x0
    const y = event.clientY - current.y0

    if (!current.moved) {
      if (Math.hypot(x, y) < 6) return
      current.moved = true
      current.rects = cellRefs.current.map((cell) => cell!.getBoundingClientRect())
      current.element.dataset.lifted = 'true'
      setArmed(null)
      current.frame = requestAnimationFrame(tick)
    }
    const elapsed = Math.max(1, event.timeStamp - current.time)
    current.vx = current.vx * 0.5 + ((x - current.x) / elapsed) * 0.5
    current.vy = current.vy * 0.5 + ((y - current.y) / elapsed) * 0.5
    current.x = x
    current.y = y
    current.time = event.timeStamp
    const over = current.rects.findIndex((rect) => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)
    current.over = over < 0 ? null : over
    markOver(current.over)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current

    if (!current || current.pointerId !== event.pointerId) return
    cancelAnimationFrame(current.frame)
    drag.current = null
    markOver(null)
    if (!current.moved) {
      setArmed((value) => (value === current.id ? null : current.id))
      return
    }
    const from = { x: current.x, y: current.y + LIFTED.y, rx: current.rx, ry: current.ry, scale: current.scale }
    if (event.type === 'pointerup' && current.over !== null && !cells[current.over]) land(current.id, current.over, current.element, from)
    else back(current.element, from)
  }

  const onCell = (index: number) => {
    const element = armed ? cardRefs.current.get(armed) : undefined

    if (!armed || !element || cells[index] || busy.current) return
    land(armed, index, element, LIFTED)
  }

  const reset = () => {
    setHand(HAND)
    setCells(Array(CELLS).fill(null))
    setArmed(null)
    setImpact(null)
  }

  return (
    <Specimen
      title="3 · La carta con peso"
      layout="column"
      className="col-span-full"
      note={
        <>
          Arrastrá una carta (mouse o dedo): se eleva, crece 15 % y se inclina según la velocidad (tope de {TILT_MAX}°, se acerca un {TILT_FOLLOW * 100} % por cuadro). Soltala en una
          casilla: sube a su punto más alto, se queda quieta 2 o 3 cuadros (la pausa) y se estampa; al caer, anillo de impacto y sacudida del tablero (4 px, sólo <Tag>translate</Tag>,
          vuelve exacto). Como en el celular: tocá la carta y después la casilla. El JS sólo escribe <Tag>transform</Tag> en un <Tag>requestAnimationFrame</Tag>; el estampado es una Web
          Animation.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Knob label="Pausa">
          <Segmented label="Pausa al estampar" size="sm" value={hitstop} onChange={setHitstop} options={[{ value: '0', label: 'Sin pausa' }, { value: '2', label: '2 cuadros' }, { value: '3', label: '3 cuadros' }]} />
        </Knob>
        <Button size="sm" variant="secondary" icon="refresh" onClick={reset}>
          Repartir de nuevo
        </Button>
      </div>
      <div className="grid justify-items-center gap-6 bg-background/60 px-2 py-5">
        <div ref={board} className="flex gap-3">
          {cells.map((card, index) => (
            <button
              key={index}
              type="button"
              ref={(element) => void (cellRefs.current[index] = element)}
              aria-label={card ? `Casilla ${index + 1}: ocupada` : `Casilla ${index + 1}`}
              data-armed={armed !== null && !card}
              onClick={() => onCell(index)}
              // Sin transición de color: el borde que transiciona repintaba las tres casillas en cada cuadro (docs/movimiento.md, «Cartas en el compositor»).
              className="relative grid aspect-[421/614] w-18 place-items-center rounded-none border border-dashed border-border-subtle focus-visible:outline-none focus-visible:shadow-focus data-[armed=true]:border-solid data-[armed=true]:border-info data-[over=true]:border-solid data-[over=true]:border-info data-[over=true]:bg-info/20"
            >
              {card ? (
                <span className="block aspect-[421/614] w-14 overflow-hidden bg-input">
                  <CardArt instant remoteUrl={small(card)} name={card} className="block h-full w-full object-cover" />
                </span>
              ) : null}
              {impact?.cell === index ? <Impact key={impact.n} onDone={() => setImpact(null)} /> : null}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {hand.map((id) => (
            <div key={id} className="aspect-[421/614] w-14">
              <button
                type="button"
                ref={(element) => void (element ? cardRefs.current.set(id, element) : cardRefs.current.delete(id))}
                aria-label={`Carta ${id}`}
                aria-pressed={armed === id}
                onPointerDown={onPointerDown(id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={(event) => event.detail === 0 && setArmed((value) => (value === id ? null : id))}
                style={{ transform: armed === id ? pose(LIFTED) : undefined }}
                className="relative block h-full w-full touch-none overflow-hidden rounded-none bg-input transition-transform duration-120 focus-visible:outline-none focus-visible:shadow-focus aria-pressed:z-10 aria-pressed:shadow-overlay data-[lifted=true]:z-20 data-[lifted=true]:shadow-overlay data-[lifted=true]:transition-none motion-reduce:transition-none"
              >
                <CardArt instant remoteUrl={small(id)} name={id} className="pointer-events-none block h-full w-full object-cover" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Specimen>
  )
}

/** El golpe en la casilla: el anillo cian de energía (siempre) y el destello dorado aditivo (sólo con «Efectos completos»), capas quietas que sólo cambian escala y opacidad. */
function Impact({ onDone }: { onDone: () => void }) {
  const { full } = useFeel()

  return (
    <>
      <span aria-hidden onAnimationEnd={onDone} className="pointer-events-none absolute inset-0 m-auto size-20 rounded-full border-2 border-fx-energia animate-feel-ring motion-reduce:hidden" />
      {full ? <span aria-hidden className="pointer-events-none absolute inset-0 m-auto size-28 rounded-full bg-radial from-fx-destello/90 to-transparent to-70% mix-blend-plus-lighter animate-feel-flash motion-reduce:hidden" /> : null}
    </>
  )
}

// ——— 4. La conexión de cadena ———

/** Dónde está cada carta (en % de la caja) y en qué orden se encadenan: la tuya, la del rival, la tuya otra vez y la del rival. */
const CHAIN_SPOTS = [
  { id: '14558127', left: 28, top: 74 },
  { id: '23434538', left: 30, top: 26 },
  { id: '57554544', left: 72, top: 74 },
  { id: '89631139', left: 70, top: 26 },
]

interface Link {
  n: number
  x: number
  y: number
  length: number
  angle: number
  tx: number
  ty: number
}

function ChainSample() {
  const feel = useFeel()
  const box = useRef<HTMLDivElement | null>(null)
  const cards = useRef<Array<HTMLDivElement | null>>([])
  const [links, setLinks] = useState<Link[]>([])

  const chain = () => {
    const n = links.length + 1
    const frame = box.current?.getBoundingClientRect()
    const center = (index: number) => {
      const rect = cards.current[index]?.getBoundingClientRect()

      return rect && frame ? { x: rect.left + rect.width / 2 - frame.left, y: rect.top + rect.height / 2 - frame.top } : { x: 0, y: 0 }
    }
    if (n > CHAIN_SPOTS.length) {
      setLinks([])
      return
    }
    const to = center(n - 1)
    const from = n === 1 ? to : center(n - 2)
    setLinks((current) => [...current, { n, x: from.x, y: from.y, length: Math.hypot(to.x - from.x, to.y - from.y), angle: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI, tx: to.x, ty: to.y }])
  }

  const draw = (element: HTMLDivElement | null) => {
    if (!element || element.dataset.drawn || feel.reduced) return
    element.dataset.drawn = 'true'
    animate(element, [{ scale: '0 1' }, { scale: '1 1' }], { duration: 150, easing: EASE_OUT })
  }

  return (
    <Specimen
      title="4 · La conexión de cadena"
      layout="column"
      note={
        <>
          «Encadenar» une la carta anterior con la nueva: una línea que crece desde la de origen en 150 ms (un solo elemento que estira <Tag>scale</Tag> desde un extremo y apunta con{' '}
          <Tag>rotate</Tag>, el «9-slice»), y el número golpea al llegar (<Tag>animate-feel-hit</Tag>, con pasada). Con «completos», una chispa (el flipbook) en la de destino. La escena grande
          de la cadena del duelo es otra pieza.
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon="link" onClick={chain}>
          {links.length >= CHAIN_SPOTS.length ? 'Volver a empezar' : `Encadenar (${links.length + 1})`}
        </Button>
      </div>
      <div ref={box} className="relative h-64 overflow-hidden bg-chain-veil">
        {CHAIN_SPOTS.map((spot, index) => (
          <div
            key={spot.id}
            ref={(element) => void (cards.current[index] = element)}
            style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
            className={cx('absolute aspect-[421/614] w-14 -translate-1/2 overflow-hidden bg-input', links.length > index && 'shadow-chain-halo')}
          >
            <CardArt instant remoteUrl={small(spot.id)} name={spot.id} className="block h-full w-full object-cover" />
          </div>
        ))}
        {links.map((link) => (
          <div key={link.n}>
            {link.n > 1 ? (
              <div
                ref={draw}
                aria-hidden
                style={{ left: link.x, top: link.y - 2, width: link.length, rotate: `${link.angle}deg` }}
                className="pointer-events-none absolute h-1 origin-left bg-white shadow-[0_0_12px_2px_var(--color-chain-glow)]"
              />
            ) : null}
            {feel.full && !feel.reduced ? (
              <div aria-hidden className="pointer-events-none absolute size-16 -translate-1/2" style={{ left: link.tx, top: link.ty }}>
                <Flipbook frames={SPARK_FRAMES} draw={drawSpark} fps={30} autoplay delay={link.n > 1 ? 120 : 0} />
              </div>
            ) : null}
            <span
              aria-hidden
              style={{ left: link.tx, top: link.ty, animationDelay: link.n > 1 ? '120ms' : undefined }}
              className="pointer-events-none absolute -translate-1/2 text-hit font-bold tabular-nums text-white drop-shadow-[0_0_10px_var(--color-chain-glow)] animate-feel-hit motion-reduce:animate-none"
            >
              {link.n}
            </span>
          </div>
        ))}
      </div>
    </Specimen>
  )
}

// ——— 5. Flipbooks ———

type Draw = (index: number, frames: number) => ReactNode

const SPARK_FRAMES = 10
const SLASH_FRAMES = 10
const BURST_FRAMES = 12

/** Chispa: un núcleo blanco y ocho rayos dorados que se abren y se apagan. */
const drawSpark: Draw = (index, frames) => {
  const p = index / (frames - 1)
  const grow = Math.min(1, (index + 1) / 3)

  return (
    <>
      {Array.from({ length: 8 }, (_, ray) => {
        const angle = (ray * Math.PI) / 4 + (ray % 2 ? Math.PI / 8 : 0)
        const inner = 3 + 24 * p
        const outer = inner + ((ray % 2 ? 8 : 14) * (1 - p) + 2) * grow
        return (
          <line
            key={ray}
            x1={32 + Math.cos(angle) * inner}
            y1={32 + Math.sin(angle) * inner}
            x2={32 + Math.cos(angle) * outer}
            y2={32 + Math.sin(angle) * outer}
            strokeWidth={3.5 * (1 - p) + 0.5}
            strokeLinecap="round"
            opacity={1 - p * p}
            className="stroke-fx-destello"
          />
        )
      })}
      <circle cx={32} cy={32} r={9 * (1 - p) ** 2 * grow + 0.5} className="fill-white" />
    </>
  )
}

/** Corte de energía: una línea diagonal que se dibuja, brilla y se parte en dos. */
const drawSlash: Draw = (index, frames) => {
  const [ax, ay, bx, by] = [8, 56, 56, 8]
  const segment = (x1: number, y1: number, x2: number, y2: number, width: number, opacity = 1, key = 'a') => (
    <g key={key} opacity={opacity}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={width * 2.6} strokeLinecap="round" opacity={0.35} className="stroke-fx-energia" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={width} strokeLinecap="round" className="stroke-white" />
    </g>
  )

  if (index < 4) {
    const t = (index + 1) / 4
    return segment(ax, ay, ax + (bx - ax) * t, ay + (by - ay) * t, 2 + index * 0.8)
  }
  if (index < 7) return segment(ax, ay, bx, by, 5 - (index - 4) * 1.2)
  const q = (index - 6) / (frames - 6)
  const gap = 7 * q
  const [mx, my] = [(ax + bx) / 2, (ay + by) / 2]
  return (
    <>
      {segment(ax - gap, ay - gap, mx - gap, my - gap, 2 * (1 - q) + 0.5, 1 - q, 'a')}
      {segment(mx + gap, my + gap, bx + gap, by + gap, 2 * (1 - q) + 0.5, 1 - q, 'b')}
    </>
  )
}

/** Carta que estalla: late, destella en blanco y se parte en seis trozos que salen girando, con un anillo rojo de impacto. */
const drawBurst: Draw = (index, frames) => {
  const [x, y, w, h] = [20, 15, 24, 34]
  if (index < 2) {
    const s = index === 0 ? 1 : 1.08
    return <rect x={32 - (w * s) / 2} y={32 - (h * s) / 2} width={w * s} height={h * s} strokeWidth={1.5} className="fill-primary stroke-white" />
  }
  if (index === 2) {
    return (
      <>
        <circle cx={32} cy={32} r={20} strokeWidth={2} fill="none" opacity={0.8} className="stroke-white" />
        <rect x={x} y={y} width={w} height={h} className="fill-white" />
      </>
    )
  }
  const q = (index - 2) / (frames - 3)
  return (
    <>
      {q < 1 ? <circle cx={32} cy={32} r={18 + 16 * q} strokeWidth={2 * (1 - q) + 0.5} fill="none" opacity={(1 - q) * 0.7} className="stroke-fx-impacto" /> : null}
      {Array.from({ length: 6 }, (_, shard) => {
        const col = shard % 2
        const row = Math.floor(shard / 2)
        const cx0 = x + w / 4 + (col * w) / 2
        const cy0 = y + h / 6 + (row * h) / 3
        const length = Math.hypot(cx0 - 32, cy0 - 32) || 1
        const dx = ((cx0 - 32) / length) * 24 * q
        const dy = ((cy0 - 32) / length) * 24 * q
        return (
          <rect
            key={shard}
            x={cx0 - w / 4}
            y={cy0 - h / 6}
            width={w / 2}
            height={h / 3}
            strokeWidth={1}
            opacity={1 - q * q}
            transform={`translate(${dx} ${dy}) rotate(${(shard % 2 ? 1 : -1) * 100 * q} ${cx0} ${cy0})`}
            className="fill-primary stroke-fx-impacto"
          />
        )
      })}
    </>
  )
}

/** Una tira de cuadros (64 × 64 cada uno, más uno vacío al final: el reposo) que avanza con `steps()` sobre el `translate` de la tira, dentro de una ventana recortada. */
function Flipbook({ frames, draw, fps, autoplay = false, delay = 0, play = 0 }: { frames: number; draw: Draw; fps: number; autoplay?: boolean; delay?: number; play?: number }) {
  const strip = useRef<HTMLDivElement | null>(null)
  const { reduced } = useFeel()

  useEffect(() => {
    if ((!autoplay && play === 0) || reduced || !strip.current) return
    const last = `${(-100 * frames) / (frames + 1)}% 0`
    const running = animate(strip.current, [{ translate: '0 0' }, { translate: last }], { duration: (frames * 1000) / fps, delay, easing: `steps(${frames})`, fill: 'backwards' })

    return () => running.cancel()
  }, [autoplay, play, reduced, frames, fps, delay])

  return (
    <div className="relative size-full overflow-hidden">
      <div ref={strip} className="h-full" style={{ width: `${(frames + 1) * 100}%`, translate: `${(-100 * frames) / (frames + 1)}% 0` }}>
        <FrameStrip frames={frames} draw={draw} />
      </div>
    </div>
  )
}

function FrameStrip({ frames, draw, className = 'block h-full w-full' }: { frames: number; draw: Draw; className?: string }) {
  return (
    <svg viewBox={`0 0 ${(frames + 1) * 64} 64`} className={className} aria-hidden>
      {Array.from({ length: frames }, (_, index) => (
        <g key={index} transform={`translate(${index * 64} 0)`}>
          {draw(index, frames)}
        </g>
      ))}
    </svg>
  )
}

const FLIPBOOKS = [
  { name: 'Chispa', frames: SPARK_FRAMES, draw: drawSpark },
  { name: 'Corte de energía', frames: SLASH_FRAMES, draw: drawSlash },
  { name: 'Carta que estalla', frames: BURST_FRAMES, draw: drawBurst },
]

function FlipbookSample() {
  const [fps, setFps] = useState<'24' | '30'>('30')
  const [plays, setPlays] = useState([0, 0, 0])
  const replay = (which: number | null) => setPlays((current) => current.map((count, index) => (which === null || which === index ? count + 1 : count)))

  return (
    <Specimen
      title="5 · Flipbooks"
      layout="column"
      note={
        <>
          Tres tiras dibujadas por nosotros (SVG, 64 px por cuadro): la tira entera se corre con <Tag>steps()</Tag> sobre su <Tag>translate</Tag> dentro de una ventana recortada (compositor;
          no <Tag>background-position</Tag>). Tocá cada una para repetirla; debajo, la tira completa (el «atlas»).
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" icon="play" onClick={() => replay(null)}>
          Reproducir las tres
        </Button>
        <Knob label="Cuadros por segundo">
          <Segmented label="Cuadros por segundo" size="sm" value={fps} onChange={setFps} options={[{ value: '24', label: '24' }, { value: '30', label: '30' }]} />
        </Knob>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {FLIPBOOKS.map((book, index) => (
          <div key={book.name} className="grid justify-items-center gap-2">
            <button type="button" aria-label={`Reproducir ${book.name}`} onClick={() => replay(index)} className="size-24 rounded-none bg-background focus-visible:outline-none focus-visible:shadow-focus">
              <Flipbook frames={book.frames} draw={book.draw} fps={Number(fps)} play={plays[index]} />
            </button>
            <span className="text-center text-micro text-soft">
              {book.name} · {book.frames} cuadros
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-1 border-t border-border-subtle pt-3">
        {FLIPBOOKS.map((book) => (
          <FrameStrip key={book.name} frames={book.frames} draw={book.draw} className="block h-auto w-full bg-background" />
        ))}
      </div>
    </Specimen>
  )
}

// ——— 6. Transición de pantalla ———

type Swap = 'horizontal' | 'slash'

function FakeScreen({ which }: { which: number }) {
  return which === 0 ? (
    <div className="grid h-full content-start gap-3 bg-card-background p-4">
      <span className="text-micro font-semibold text-muted">INICIO</span>
      <span className="text-title font-bold text-foreground">Hola, duelista</span>
      <span className="grid h-14 place-items-center rounded-control bg-primary text-lead font-semibold text-primary-foreground">Duelo</span>
      <span className="h-10 rounded-control bg-lavender" />
      <span className="h-10 rounded-control bg-lavender" />
    </div>
  ) : (
    <div className="grid h-full content-start gap-3 bg-surface-raised p-4">
      <span className="text-micro font-semibold text-muted">TU DECK</span>
      <span className="text-title font-bold text-foreground">40 cartas</span>
      <span className="grid grid-cols-5 gap-1.5">
        {HAND.concat(HAND).map((id, index) => (
          <span key={index} className="block aspect-[421/614] overflow-hidden bg-input">
            <CardArt instant remoteUrl={small(id)} name={id} className="block h-full w-full object-cover" />
          </span>
        ))}
      </span>
    </div>
  )
}

function ScreenSample() {
  const feel = useFeel()
  const [current, setCurrent] = useState(0)
  const [cut, setCut] = useState<{ screen: number; angle: number; length: number } | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const screens = useRef<Array<HTMLDivElement | null>>([])
  const halves = useRef<Array<HTMLDivElement | null>>([])
  const bar = useRef<HTMLDivElement | null>(null)
  const flash = useRef<HTMLDivElement | null>(null)
  const busy = useRef(false)

  const go = (kind: Swap) => {
    const from = screens.current[current]
    const to = screens.current[1 - current]
    const box = frame.current?.getBoundingClientRect()

    if (busy.current || !from || !to || !box) return
    busy.current = true

    if (kind === 'slash' && !feel.reduced) {
      flushSync(() => {
        setCut({ screen: current, angle: (-Math.atan2(box.height, box.width) * 180) / Math.PI, length: Math.hypot(box.width, box.height) })
        setCurrent(1 - current)
      })
      const ease = token('ease-gravedad-caida')
      const [upper, lower] = halves.current
      if (bar.current) animate(bar.current, [{ scale: '0 1', opacity: 1 }, { scale: '1 1', opacity: 1, offset: 0.35 }, { scale: '1 1', opacity: 0 }], { duration: 260, easing: EASE_OUT })
      if (feel.full && flash.current) animate(flash.current, [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], { duration: 240, delay: 40, easing: EASE_OUT })
      if (upper) upper.animate([{ translate: '0 0' }, { translate: '-50% -50%' }], { duration: 190, delay: 70, easing: ease, fill: 'forwards' })
      if (lower)
        lower.animate([{ translate: '0 0' }, { translate: '50% 50%' }], { duration: 190, delay: 70, easing: ease, fill: 'forwards' }).finished.then(
          () => {
            setCut(null)
            busy.current = false
          },
          () => (busy.current = false),
        )
      return
    }

    to.style.visibility = 'visible'
    const finish = (running: Animation[]) =>
      Promise.all(running.map((animation) => animation.finished)).then(
        () => {
          flushSync(() => setCurrent(1 - current))
          to.style.visibility = ''
          running.forEach((animation) => animation.cancel())
          busy.current = false
        },
        () => (busy.current = false),
      )

    if (feel.reduced) {
      // Con movimiento reducido queda el fundido: la nueva aparece encima.
      finish([to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT, fill: 'forwards' })])
      return
    }
    const timing = { duration: 220, easing: entryEase(feel), fill: 'forwards' } as const
    finish([from.animate([{ translate: '0 0' }, { translate: '-100% 0' }], timing), to.animate([{ translate: '100% 0' }, { translate: '0 0' }], timing)])
  }

  return (
    <Specimen
      title="6 · Transición de pantalla"
      layout="column"
      note={
        <>
          Dos pantallas falsas. El barrido (220 ms, <Tag>--ease-out-back</Tag>; con «Rebote suave», sin pasada) reemplaza al fundido; el corte diagonal dibuja una línea en 90 ms y abre la
          pantalla en dos mitades (copias recortadas con un <Tag>clip-path</Tag> quieto que se corren con <Tag>translate</Tag>). Con movimiento reducido, un fundido de 150 ms. El barrido
          diagonal salió: a Gastón no le gustó.
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => go('horizontal')}>
          Barrido horizontal
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('slash')}>
          Corte diagonal
        </Button>
      </div>
      <div ref={frame} className="relative mx-auto h-72 w-full max-w-xs overflow-hidden border border-border-subtle bg-background">
        {[0, 1].map((which) => (
          <div key={which} ref={(element) => void (screens.current[which] = element)} className={cx('absolute inset-0', which !== current && 'invisible')}>
            <FakeScreen which={which} />
          </div>
        ))}
        {cut ? (
          <>
            <div ref={(element) => void (halves.current[0] = element)} className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]">
              <FakeScreen which={cut.screen} />
            </div>
            <div ref={(element) => void (halves.current[1] = element)} className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
              <FakeScreen which={cut.screen} />
            </div>
            <div ref={bar} aria-hidden style={{ width: cut.length, rotate: `${cut.angle}deg` }} className="pointer-events-none absolute bottom-0 left-0 h-1 origin-left bg-white shadow-[0_0_14px_3px_var(--color-fx-energia)]" />
            {feel.full ? <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 bg-white opacity-0 mix-blend-plus-lighter" /> : null}
          </>
        ) : null}
      </div>
    </Specimen>
  )
}

// ——— 7. Irrupción en capas ———

const LAYER_DEPTH = [4, 10, 18]

function LayersSample() {
  const feel = useFeel()
  const layers = useRef<Array<HTMLDivElement | null>>([])
  const flash = useRef<HTMLDivElement | null>(null)
  const pointer = useRef({ x: 0, y: 0, frame: 0 })

  const burst = () => {
    const [back, mid, front] = layers.current

    if (!back || !mid || !front) return
    if (feel.reduced) {
      layers.current.forEach((layer) => layer && animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT }))
      return
    }
    const ease = entryEase(feel)
    animate(back, [{ translate: '-30% 0' }, { translate: '0 0' }], { duration: 260, easing: ease, fill: 'backwards' })
    animate(mid, [{ translate: '45% 0', scale: '1.2' }, { translate: '0 0', scale: '1' }], { duration: 260, delay: 40, easing: ease, fill: 'backwards' })
    animate(front, [{ translate: '-70% 0' }, { translate: '0 0' }], { duration: 240, delay: 80, easing: ease, fill: 'backwards' })
    if (feel.full && flash.current) animate(flash.current, [{ opacity: 0, scale: '0.8' }, { opacity: 0.9, offset: 0.3 }, { opacity: 0, scale: '1.3' }], { duration: 260, delay: 60, easing: EASE_IN_OUT })
  }

  // Los «huesos 2D»: cada capa sigue al puntero con su profundidad (más lejos, menos), escrito en un solo cuadro.
  const follow = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (feel.reduced) return
    const rect = event.currentTarget.getBoundingClientRect()
    pointer.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.current.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    if (pointer.current.frame) return
    pointer.current.frame = requestAnimationFrame(() => {
      pointer.current.frame = 0
      layers.current.forEach((layer, index) => layer && (layer.style.transform = `translate(${-pointer.current.x * LAYER_DEPTH[index]!}px, ${-pointer.current.y * LAYER_DEPTH[index]!}px)`))
    })
  }
  const rest = () => layers.current.forEach((layer) => layer && (layer.style.transform = ''))

  return (
    <Specimen
      title="7 · Irrupción en capas (beta)"
      layout="column"
      note={
        <>
          <strong>Beta: falta definir cuándo se muestra la imagen grande de una carta y de dónde sale</strong> (qué jugada la merece y qué arte se usa); hasta entonces no va a las pantallas.
          Una ilustración en tres capas (fondo de bandas violetas, el arte recortado en un paralelogramo y los cortes cian adelante) que entra con <Tag>--ease-out-back</Tag>, cada capa con su
          retraso, y un destello aditivo (<Tag>mix-blend-plus-lighter</Tag> quieto; sólo cambia la opacidad, y con «livianos» no está). Mové el puntero encima: cada capa se corre según su
          profundidad (el parallax).
        </>
      }
    >
      <Button size="sm" variant="primary" icon="play" className="justify-self-start" onClick={burst}>
        Irrumpir
      </Button>
      <div onPointerMove={follow} onPointerLeave={rest} className="relative mx-auto h-56 w-full max-w-md overflow-hidden bg-background">
        <div ref={(element) => void (layers.current[0] = element)} className="absolute -inset-8">
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
            <polygon points="0,0 38,0 22,60 0,60" opacity={0.35} className="fill-primary" />
            <polygon points="46,0 70,0 54,60 30,60" opacity={0.22} className="fill-primary" />
            <polygon points="78,0 100,0 100,60 62,60" opacity={0.35} className="fill-primary" />
          </svg>
        </div>
        <div ref={(element) => void (layers.current[1] = element)} className="absolute inset-x-10 inset-y-4 overflow-hidden [clip-path:polygon(16%_0,100%_0,84%_100%,0_100%)]">
          <CardArt instant remoteUrl="https://images.ygoprodeck.com/images/cards_cropped/46986414.jpg" name="46986414" className="block h-full w-full object-cover" />
        </div>
        <div ref={(element) => void (layers.current[2] = element)} className="pointer-events-none absolute -inset-4">
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
            <line x1={4} y1={58} x2={30} y2={2} strokeWidth={1.4} className="stroke-fx-energia" vectorEffect="non-scaling-stroke" />
            <line x1={70} y1={58} x2={96} y2={2} strokeWidth={1.4} className="stroke-fx-energia" vectorEffect="non-scaling-stroke" />
            <line x1={10} y1={58} x2={36} y2={2} strokeWidth={0.6} className="stroke-white" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {feel.full ? <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 bg-radial from-white to-transparent to-75% opacity-0 mix-blend-plus-lighter" /> : null}
      </div>
    </Specimen>
  )
}
