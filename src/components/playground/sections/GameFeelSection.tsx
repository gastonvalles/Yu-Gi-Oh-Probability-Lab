import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, cancelWhenDone } from '../../../app/motion'
import { setEffects, useEffects } from '../../../app/effects'
import { impactOn, sacrificeAt, type ArrivalTone } from '../../../app/field-impact'
import { BURST, CUT, SPARK } from '../../../app/flipbooks'
import { playEntrance, playPendulum, type EntranceKind } from '../../../app/summon-entrance'
import { useMediaQuery } from '../../../app/use-media-query'
import { PANEL_LIME } from '../../auto/AutoPanel'
import { ChainStage, type ChainNoticeRow } from '../../auto/ChainNotice'
import { CardArt } from '../../CardArt'
import type { ChainMedal } from '../../../app/card-glow'
import { AttackFx, measureStrike, type Strike } from '../../probability/AttackFx'
import { ChainBadge, MATERIAL_MARK } from '../../probability/MatFx'
import { Button } from '../../ui/Button'
import { Callout } from '../../ui/Callout'
import { Flipbook, FlipbookFrames } from '../../ui/Flipbook'
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
          <HitSample />
          <SummonSample />
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
  { name: '--ease-golpe', ms: 50, use: 'El golpe («puñetazo», de Master Duel): llega al pico en 50 ms.', fresh: true },
  { name: '--ease-asentar', ms: 260, use: 'Después del pico, el golpe se asienta encogiéndose.', fresh: true },
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

// ——— 3b. El golpe y el ataque ———

/** El ataque de la mesa (`AttackFx`, la pieza real) entre dos cartas de muestra: a la de arriba o directo (sin vidas, llega al borde). Sacude este tablero (`data-field`). */
function HitSample() {
  const board = useRef<HTMLDivElement | null>(null)
  const [strike, setStrike] = useState<Strike | null>(null)
  const attack = (direct: boolean) => setStrike(measureStrike({ from: '[data-card-id="feel-atacante"]', ...(direct ? {} : { to: '[data-card-id="feel-objetivo"]' }), bounds: board.current }))

  return (
    <Specimen
      title="3b · El golpe y el ataque"
      layout="column"
      note={
        <>
          Con los tiempos y los colores medidos en Master Duel: la carta que ataca brilla dorada mientras embiste (300 ms, opaca hasta la mitad) y el polvo converge hacia ella; el golpe es
          dorado, llega al pico en 50 ms con <Tag>--ease-golpe</Tag> y se encoge a la mitad hasta los 560 ms, con una gemela oscura debajo (se lee sobre un arte claro); 200 ms después,
          líneas y polvo. El directo suma la onda que cruza la pantalla (300 ms, lineal). Con «Livianos», sólo el aro. Archivos: <Tag>app/field-impact.ts</Tag> y <Tag>AttackFx.tsx</Tag>.
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon="play" onClick={() => attack(false)}>
          Atacar a la carta
        </Button>
        <Button size="sm" variant="secondary" icon="play" onClick={() => attack(true)}>
          Ataque directo
        </Button>
      </div>
      <div ref={board} data-field className="grid justify-items-center gap-12 bg-background/60 px-2 py-6">
        {(['feel-objetivo', 'feel-atacante'] as const).map((id, index) => (
          <span key={id} data-card-id={id} className="block aspect-[421/614] w-14 overflow-hidden bg-input">
            <CardArt instant remoteUrl={small(HAND[index]!)} name={id} className="block h-full w-full object-cover" />
          </span>
        ))}
      </div>
      {strike ? <AttackFx key={strike.key} strike={strike} onDone={() => setStrike(null)} /> : null}
    </Specimen>
  )
}

// ——— 3c. La invocación ———

const ENTRANCES: ReadonlyArray<readonly [EntranceKind, string, string]> = [
  ['fusion', 'Fusión', '89631139'],
  ['synchro', 'Sincronía', '46986414'],
  ['xyz', 'Xyz', '57554544'],
  ['link', 'Enlace', '14558127'],
  ['ritual', 'Ritual', '23434538'],
]

/**
 * La invocación de la mesa (`arriveAt` y `playEntrance`, las piezas reales) sobre una casilla de muestra: la llegada común (Especial y por Sacrificio) y la entrada larga de cada tipo, con
 * los tiempos de Master Duel. Mientras dura una entrada, los botones no responden (como la mesa). Con «Livianos», la llegada rápida de siempre; con movimiento reducido, nada.
 */
function SummonSample() {
  const board = useRef<HTMLDivElement | null>(null)
  const cell = useRef<HTMLSpanElement | null>(null)
  const left = useRef<HTMLSpanElement | null>(null)
  const right = useRef<HTMLSpanElement | null>(null)
  const [busy, setBusy] = useState<EntranceKind | 'pendulum' | null>(null)
  const [short, setShort] = useState(false)
  const [materials, setMaterials] = useState(2)
  const [marked, setMarked] = useState(false)
  const [art, setArt] = useState(HAND[0]!)
  const arrive = (tone: ArrivalTone, strong = false) => impactOn(cell.current, board.current, strong ? 'strong' : 'light', 0, tone)
  // La Invocación por Péndulo: una sola escena con las tres casillas; con «Livianos», la llegada blanca en cada una.
  const pendulum = () => {
    const cells = [left.current, cell.current, right.current].filter((target): target is HTMLSpanElement => target !== null)
    if (busy || cells.length === 0) return
    const played = playPendulum({ cards: cells.map((target, index) => ({ cell: target.getBoundingClientRect(), art: small(HAND[index % HAND.length]!), hide: [target] })), field: board.current, onDone: () => setBusy(null) })
    if (played) setBusy('pendulum')
    else for (const target of cells) impactOn(target, board.current, 'light', 0, 'pendulum')
  }
  const sacrifice = () => {
    const rect = left.current?.getBoundingClientRect()
    if (rect) sacrificeAt(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width)
  }
  const enter = (kind: EntranceKind, id: string) => {
    const target = cell.current
    if (!target || busy) return
    setArt(id)
    const played = playEntrance({ kind, short, cell: target.getBoundingClientRect(), art: small(id), materials, hide: [target], field: board.current, onDone: () => setBusy(null) })
    if (played) setBusy(kind)
    else arrive(kind, true)
  }

  return (
    <Specimen
      title="3c · La invocación"
      layout="column"
      note={
        <>
          Como en Master Duel. La llegada: un anillo del color de su tipo (de 1,7 a 3,5 cartas en 144 ms con <Tag>--ease-llegada</Tag> y a 4,2 en 1 s) con su cruz y su brillo; la fuerte, tres
          anillos y una onda. La entrada del Extra Deck y del Ritual: el velo, la figura del tipo, los materiales que convergen, la carta que cae grande (<Tag>--ease-revelar</Tag>), el golpe
          fuerte y el brillo del marco; el duelo sigue a los ms de Master Duel (Fusión 2583, Xyz 3467, Enlace 4117, Sincronía 4600 o 3483 la corta, Ritual 5200 o 2833). Con «Livianos», la
          llegada rápida. El Péndulo (sólo el de la mesa manual: en el automático el núcleo no lo dice): una sola escena con todas sus cartas, las escalas a los 417 ms, la luz a los 667, el
          péndulo a los 1117 y las cartas que tocan a los 2333 (de a una cada 67); sigue a los 3684. El Sacrificio: el disco violeta, el círculo de 1,7 cartas y la columna, en 450 ms, dentro del
          vuelo al Cementerio. El material elegido late a 1,25 Hz (Master Duel, 8 Hz: pasa los tres destellos por segundo). Archivos: <Tag>app/summon-entrance.ts</Tag> y{' '}
          <Tag>app/field-impact.ts</Tag>.
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon="play" disabled={busy !== null} onClick={() => arrive('special')}>
          Llegada
        </Button>
        <Button size="sm" variant="secondary" icon="play" disabled={busy !== null} onClick={() => arrive('tribute')}>
          Por Sacrificio
        </Button>
        {ENTRANCES.map(([kind, label, id]) => (
          <Button key={kind} size="sm" variant="secondary" icon="play" disabled={busy !== null} data-entrance={kind} onClick={() => enter(kind, id)}>
            {label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" icon="play" disabled={busy !== null} data-entrance="pendulum" onClick={pendulum}>
          Péndulo (3)
        </Button>
        <Button size="sm" variant="secondary" icon="play" disabled={busy !== null} data-sample="sacrifice" onClick={sacrifice}>
          Sacrificio
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Knob label="Materiales">
          <Segmented label="Materiales" size="sm" value={String(materials)} onChange={(value) => setMaterials(Number(value))} options={['1', '2', '4', '6'].map((value) => ({ value, label: value }))} />
        </Knob>
        <Knob label="Corta (Sincronía y Ritual)">
          <Switch label="Corta" checked={short} onChange={setShort} />
        </Knob>
        <Knob label="Material elegido (latido)">
          <Switch label="Material elegido" checked={marked} onChange={setMarked} />
        </Knob>
      </div>
      <div ref={board} data-field className="flex justify-center gap-3 bg-background/60 px-2 py-10">
        <span ref={left} className="block aspect-[421/614] w-14 overflow-hidden bg-input">
          <CardArt instant remoteUrl={small(HAND[1]!)} name="feel-izquierda" className="block h-full w-full object-cover" />
        </span>
        <span ref={cell} className="relative block aspect-[421/614] w-14 bg-input">
          <span className="block size-full overflow-hidden">
            <CardArt instant remoteUrl={small(art)} name="feel-invocada" className="block h-full w-full object-cover" />
          </span>
          {marked ? <span aria-hidden="true" data-material="" className={MATERIAL_MARK} /> : null}
        </span>
        <span ref={right} className="block aspect-[421/614] w-14 overflow-hidden bg-input">
          <CardArt instant remoteUrl={small(HAND[2]!)} name="feel-derecha" className="block h-full w-full object-cover" />
        </span>
      </div>
      <p aria-live="polite" className="text-micro text-soft">
        {busy === 'pendulum' ? 'Invocación por Péndulo en curso. Nada responde hasta que termina.' : busy ? `Entrada en curso: ${ENTRANCES.find(([kind]) => kind === busy)?.[1]}. Nada responde hasta que termina.` : 'Tocá un tipo para ver su entrada.'}
      </p>
    </Specimen>
  )
}

// ——— 4. La conexión de cadena ———

/** Las cartas que se encadenan, en orden: la tuya, la del rival, la tuya otra vez y la del rival. */
const CHAIN_CARDS = [
  { id: '46986414', name: 'Dark Magician' },
  { id: '14558127', name: 'Ash Blossom & Joyous Spring' },
  { id: '89631139', name: 'Blue-Eyes White Dragon' },
  { id: '23434538', name: 'Maxx "C"' },
]

function ChainSample() {
  const [count, setCount] = useState(0)
  // Cuántos eslabones ya se resolvieron (-1: se arma; 0: resuelve el último) y si el 2 niega al 1 al resolverse (como Ash Blossom).
  const [solved, setSolved] = useState(-1)
  const [negate, setNegate] = useState(true)
  const current = count - Math.max(solved, 0)
  const rows: ChainNoticeRow[] = CHAIN_CARDS.slice(0, count).map((card, index) => ({ number: index + 1, mine: index % 2 === 0, name: card.name, art: small(card.id), state: solved < 0 ? 'chained' : index + 1 > current ? 'solved' : index + 1 === current ? 'solving' : 'chained' }))
  const medals: ChainMedal[] = solved < 0 ? [] : rows.filter((row) => row.number <= current).map((row) => ({ number: row.number, mine: row.mine, voided: negate && row.number === 1 && current <= 2 && count > 1, resolving: row.number === current }))
  const restart = () => {
    setCount(0)
    setSolved(-1)
  }

  return (
    <Specimen
      title="4 · La conexión de cadena"
      layout="column"
      note={
        <>
          La pieza real (<Tag>ChainStage</Tag>, la escena de la cadena del duelo): al encadenar, una línea de energía (<Tag>fx-energia</Tag>, núcleo blanco) une la carta anterior con la nueva de
          un trazo en 150 ms (<Tag>animate-chain-energy</Tag>: un solo elemento que estira <Tag>scale</Tag> desde su punta y apunta con <Tag>rotate</Tag>), salta la chispa donde toca (el
          flipbook) y recién después asienta la cadena de metal; todo dentro de los 0,7 s del eslabón. Con «livianos», la línea queda y la chispa no; con movimiento reducido, ninguna.
          Los gestos de Master Duel (<Tag>CHAIN_BEAT_MS</Tag>), sin alargar nada: la carta que espera respuesta late (su marco celeste, de 1 a 0,5 cada 1333 ms); al resolver, los
          medallones (<Tag>ChainBadge</Tag>) que esperan su turno laten, el que resuelve crece 0,75 → 0,87 → 1 en 517 ms con un brillo de 100 ms y el negado parpadea cuatro veces en
          450 ms tras un destello celeste de 50 ms. Con «livianos», sin el brillo ni el destello; con movimiento reducido, nada (la tacha sigue diciendo que se negó).
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon="link" disabled={solved >= 0} onClick={() => (count >= CHAIN_CARDS.length ? restart() : setCount(count + 1))}>
          {count >= CHAIN_CARDS.length ? 'Volver a empezar' : `Encadenar (${count + 1})`}
        </Button>
        <Button size="sm" variant="secondary" disabled={count === 0} onClick={() => (solved >= count - 1 ? restart() : setSolved(solved + 1))}>
          {solved >= count - 1 && count > 0 ? 'Terminar la cadena' : `Resolver el ${solved < 0 ? count : current - 1}`}
        </Button>
        <Switch label="El 2 niega al 1" checked={negate} onChange={setNegate} />
      </div>
      <div className="relative flex h-96 items-center justify-center overflow-hidden bg-card-background p-4">
        {rows.length ? <ChainStage rows={rows} current={solved < 0 ? -1 : current - 1} /> : <p className="m-0 text-micro text-muted">Sin cadena: tocá «Encadenar».</p>}
        {/* Los medallones, en una casilla de muestra (en la mesa van donde se activó cada eslabón). */}
        {medals.length ? (
          <span className="absolute bottom-4 left-1/2 h-16 w-40 -translate-x-1/2 bg-input">
            <ChainBadge medals={medals} />
          </span>
        ) : null}
      </div>
    </Specimen>
  )
}

// ——— 5. Flipbooks ———

/** Los tres de la app (`app/flipbooks.ts`), con dónde va cada uno. */
const FLIPBOOKS = [
  { name: 'Chispa', book: SPARK, where: 'Donde la línea de energía toca la carta que se encadena (activar).' },
  { name: 'Corte', book: CUT, where: 'Sobre el medallón del eslabón que queda negado o sin efecto (negar).' },
  { name: 'Estallido', book: BURST, where: 'Donde estaba el monstruo que se va del campo al Cementerio (destruir o mandar).' },
]

function FlipbookSample() {
  const [plays, setPlays] = useState([0, 0, 0])
  const replay = (which: number | null) => setPlays((current) => current.map((count, index) => (which === null || which === index ? count + 1 : count)))

  return (
    <Specimen
      title="5 · Flipbooks"
      layout="column"
      note={
        <>
          Las piezas reales (<Tag>ui/Flipbook</Tag>, dibujos en <Tag>app/flipbooks.ts</Tag>): tiras dibujadas por nosotros (SVG, 64 px por cuadro, 30 por segundo) que se corren con{' '}
          <Tag>steps()</Tag> sobre su <Tag>translate</Tag> dentro de una ventana recortada (compositor). Pocos y con sentido: el color dice qué pasa (dorado, activar; rojo, se rompe). Con
          «Efectos: Livianos» o movimiento reducido no corren. Tocá cada una para repetirla; debajo, la tira completa (el «atlas»).
        </>
      }
    >
      <Button size="sm" variant="secondary" icon="play" className="justify-self-start" onClick={() => replay(null)}>
        Reproducir los tres
      </Button>
      <div className="grid grid-cols-3 gap-3">
        {FLIPBOOKS.map(({ name, book, where }, index) => (
          <div key={name} className="grid content-start justify-items-center gap-2">
            <button type="button" aria-label={`Reproducir ${name}`} onClick={() => replay(index)} className="size-24 rounded-none bg-background focus-visible:outline-none focus-visible:shadow-focus">
              <Flipbook book={book} play={plays[index]} className="size-full" />
            </button>
            <span className="text-center text-micro text-soft">
              {name} · {book.frames} cuadros. {where}
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-1 border-t border-border-subtle pt-3">
        {FLIPBOOKS.map(({ name, book }) => (
          <FlipbookFrames key={name} book={book} className="block h-auto w-full bg-background" />
        ))}
      </div>
    </Specimen>
  )
}

// ——— 6. Transición de pantalla ———

type Swap = 'next' | 'prev' | 'down' | 'up'

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

/** Desde dónde barre la pantalla nueva: los dos sentidos de cada eje, como en la app (`DeckModeScreen`, `SWEEP`). Nada en diagonal. */
const SAMPLE_SWEEP: Record<Swap, string> = {
  next: '[--barrido-x:2rem]',
  prev: '[--barrido-x:-2rem]',
  down: '[--barrido-y:2rem]',
  up: '[--barrido-y:-2rem]',
}

function ScreenSample() {
  const [shown, setShown] = useState<{ which: number; from: Swap | null; key: number }>({ which: 0, from: null, key: 0 })
  const go = (from: Swap) => setShown((current) => ({ which: 1 - current.which, from, key: current.key + 1 }))

  return (
    <Specimen
      title="6 · Entrar y salir"
      layout="column"
      note={
        <>
          La pantalla nueva barre 2 rem desde el lado del destino (<Tag>animate-screen-in</Tag>, 220 ms, <Tag>--ease-entrada</Tag>): de costado en el celular, de arriba o de abajo con el menú
          lateral, nunca en diagonal; sin fundido y sin rebote que se note (~3 px). El resto, con la misma curva: un modal crece desde el centro (del 90 %, <Tag>dialog-enter</Tag>), un menú
          desde su botón (del 85 %, <Tag>menu-in</Tag>, 160 ms), lo que flota sube 1,5 rem (<Tag>sheet-in</Tag>, el aviso) y las hojas y los cajones entran por su borde sin pasarse
          (<Tag>sheet-up</Tag>, <Tag>side-drawer</Tag>). Todo sale por donde vino en 150 ms. Con «Efectos: Livianos», sin pasada; con movimiento reducido, un fundido corto.
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => go('prev')}>
          Anterior (celular)
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('next')}>
          Siguiente (celular)
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('up')}>
          Anterior (menú lateral)
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('down')}>
          Siguiente (menú lateral)
        </Button>
      </div>
      <div className="relative mx-auto h-72 w-full max-w-xs overflow-hidden border border-border-subtle bg-background">
        <div key={shown.key} className={cx('absolute inset-0 animate-screen-in motion-reduce:animate-none', shown.from && SAMPLE_SWEEP[shown.from])}>
          <FakeScreen which={shown.which} />
        </div>
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
