import { useLayoutEffect, useRef, useState } from 'react'

import { cancelWhenDone, EASE_OUT, prefersReducedMotion } from '../../app/motion'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { VOIDED_ART } from '../probability/MatFx'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import type { Tone } from '../ui/tone'
import { CHIP_ICON, colorOf, STATE_TONE, stateLabel, type ChainNoticeRow } from './chain-parts'

/** Un eslabón de un escenario: el de la pila de la cadena, más la línea de su efecto y, si se sabe más que el estado, su consecuencia. */
export interface ChainOrderLink extends ChainNoticeRow {
  /** Qué hace, en una frase corta. Sólo acá: en el duelo en vivo y en el registro no va (Gastón, 2026-10-26). */
  effect: string
  /** No hizo nada (apagado). Por defecto, el negado o sin efecto. */
  idle?: boolean
}

export interface ChainOrderScenario {
  /** «A», «B». */
  letter: string
  /** El consejo, corto: «Esperá», «No dispares primero». */
  title: string
  /** Sale bien (verde, ✓) o mal (rojo, ✕): lo dicen el ícono y el texto, no sólo el color. */
  good: boolean
  /** Por qué, en una línea. */
  note?: string
  /** Del CL1 en adelante (se muestran en el orden en que se resuelven: el último arriba). */
  links: readonly ChainOrderLink[]
}

/** Lo que tarda en entrar cada eslabón después del anterior (el `--stagger-step` del catálogo). */
const STAGGER_MS = 70

/**
 * Dos órdenes de una misma cadena, comparados: cada escenario en su tarjeta (un solo borde, del color del veredicto) con el veredicto escrito arriba («A · Esperá · Sale bien») y la pila en el orden
 * en que se resuelve (el último eslabón arriba): número en el color del dueño, arte, nombre, de quién, la línea del efecto y el chip de su consecuencia; el que no hizo nada, apagado (negado: gris
 * latiendo, `VOIDED_ART`). Lado a lado si el contenedor alcanza (`@container`), apilados en el celular. Al montarse y con «Repetir», cada pila se arma de abajo hacia arriba (CL1 primero, de a
 * 70 ms y desde abajo: `opacity` y `transform`); con movimiento reducido, quieta. Es la única pieza de la cadena con el «qué hace» de cada eslabón. La usa la hoja «Cómo se resuelve» (`ChainLesson`).
 */
export function ChainOrderCompare({ scenarios }: { scenarios: readonly ChainOrderScenario[] }) {
  const [round, setRound] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current

    if (!root || typeof root.animate !== 'function' || prefersReducedMotion()) return
    const animations = [...root.querySelectorAll<HTMLOListElement>('[data-chain-order]')].flatMap((list) => {
      const rows = [...list.children]

      // El CL1 (abajo) entra primero: la pila se arma como se armó la cadena.
      return rows.map((row, at) =>
        cancelWhenDone(row.animate([{ opacity: 0, transform: 'translateY(0.75rem)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: (rows.length - 1 - at) * STAGGER_MS, easing: EASE_OUT, fill: 'backwards' })),
      )
    })

    return () => animations.forEach((animation) => animation.cancel())
  }, [round])

  return (
    <div ref={rootRef} className="@container grid gap-2">
      {/* `grid-cols-1` (minmax(0, 1fr)): con la pista automática, un nombre largo ensanchaba la columna y la pila se salía de la muestra. */}
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.letter} scenario={scenario} />
        ))}
      </div>
      <Button variant="tertiary" size="sm" icon="refresh" className="justify-self-end" onClick={() => setRound((value) => value + 1)}>
        {t('auto.chainOrder.replay')}
      </Button>
    </div>
  )
}

function ScenarioCard({ scenario }: { scenario: ChainOrderScenario }) {
  const tone: Tone = scenario.good ? 'success' : 'danger'
  const verdict = t(scenario.good ? 'auto.chainOrder.good' : 'auto.chainOrder.bad')

  return (
    // El veredicto lo dice el borde de toda la tarjeta (G.1), el ícono y el texto: nunca sólo el color.
    <Card as="section" padding="sm" aria-label={t('auto.chainOrder.scenario', { letter: scenario.letter, title: scenario.title, verdict })} className={cx('grid content-start gap-2', scenario.good ? 'border-success/60!' : 'border-danger/60!')}>
      <header className="grid gap-0.5">
        <p className="m-0 flex items-center gap-2 text-body font-semibold">
          <Badge tone={tone} solid shape="tag" icon={scenario.good ? 'check' : 'x'} aria-hidden="true">
            {scenario.letter}
          </Badge>
          <span className="min-w-0 flex-1 truncate">{scenario.title}</span>
          <span className={cx('shrink-0 text-micro font-bold', scenario.good ? 'text-success-soft' : 'text-danger-soft')}>{verdict}</span>
        </p>
        {scenario.note ? <p className="m-0 text-micro text-soft">{scenario.note}</p> : null}
      </header>
      <ol data-chain-order="" aria-label={t('auto.chain.list')} className="-mx-3 -mb-3 grid list-none divide-y divide-border-subtle border-t border-border-subtle p-0">
        {[...scenario.links].reverse().map((link) => (
          <LinkRow key={link.number} link={link} />
        ))}
      </ol>
    </Card>
  )
}

function LinkRow({ link }: { link: ChainOrderLink }) {
  const color = colorOf(link.mine)
  const voided = link.state === 'negated' || link.state === 'disabled'
  const idle = link.idle ?? voided
  const chip = { label: stateLabel(link), tone: link.outcome?.tone ?? STATE_TONE[link.state] }

  return (
    <li data-link={link.number} className="flex items-start gap-2.5 px-3 py-2">
      {/* Lo que lee el lector de pantalla, entero: lo de la fila es lo mismo, dicho con color y lugar. */}
      <span className="sr-only">{t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: chip.label })}</span>
      <span aria-hidden="true" className={cx('mt-0.5 w-9 shrink-0 rounded-tag border py-0.5 text-center text-micro font-bold tabular-nums text-white', color.border, color.bubble, idle && 'opacity-60')}>{`CL${link.number}`}</span>
      <span aria-hidden="true" className={cx('relative block aspect-[421/614] w-9 shrink-0 overflow-hidden bg-input', idle && !voided && 'opacity-50')}>
        <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', voided && VOIDED_ART)} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
        <span aria-hidden="true" className="flex min-w-0 items-baseline gap-2">
          <span className={cx('min-w-0 flex-1 truncate text-body font-semibold', idle ? 'text-muted' : 'text-foreground', voided && 'line-through')}>{link.name}</span>
          <span className={cx('shrink-0 text-micro font-semibold', color.text)}>{link.who}</span>
        </span>
        <span className="text-micro text-soft">{link.effect}</span>
        <Badge aria-hidden="true" tone={chip.tone} size="sm" icon={CHIP_ICON[chip.tone]} className="mt-0.5 justify-self-start">
          {chip.label}
        </Badge>
      </span>
    </li>
  )
}
