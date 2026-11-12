import { useState } from 'react'

import { PHASES, type MatPhase } from '../../app/practice-mat'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import type { MenuItem } from './MatDialogs'

const BATTLE = PHASES.find((phase) => phase.id === 'battle')!.name

/**
 * La acción del turno en el pulgar (duelo automático, celular): «Ir a Batalla» si el núcleo ofrece la Battle Phase; si no (el primer turno, la Battle o la Main Phase 2), «Terminar turno».
 * `onSelect` null: no hay nada que tocar ahora (el núcleo piensa o la mesa cuenta).
 */
export function turnActionOf(items: readonly MenuItem[], endTurn: (() => void) | null): { kind: 'battle' | 'end'; onSelect: (() => void) | null } {
  const battle = items.find((item) => item.label === BATTLE && !item.disabled && !item.current)

  return battle ? { kind: 'battle', onSelect: battle.onSelect } : { kind: 'end', onSelect: endTurn }
}

/**
 * La pista de fases (lámina 4, «A»): en la línea del celular cuando no hay cadena ni aviso. Las seis fases en cajas (la de ahora en lima, a las que podés ir en blanco y las pasadas punteadas) y su
 * nombre. Es un solo botón («Fases: Main Phase 1») que abre las fases del automático, como el botón de la fase del campo, que en el automático del celular ya no está.
 */
export function PhaseTrack({ phase, items, disabled, onOpen }: { phase: MatPhase; items: readonly MenuItem[]; disabled: boolean; onOpen: (rect: DOMRect) => void }) {
  const now = PHASES.findIndex((entry) => entry.id === phase)
  const name = PHASES[now]?.name ?? ''

  return (
    <button
      type="button"
      data-phase-track=""
      aria-label={`${t('practice.mat.phases')}: ${name}`}
      aria-haspopup="menu"
      disabled={disabled}
      className="flex h-full w-full min-w-0 items-center gap-2 border border-border-subtle bg-card-background/88 px-2 text-left focus-visible:outline-none focus-visible:shadow-focus"
      onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}
    >
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
        {PHASES.map((entry, index) => {
          const can = items.some((item) => item.label === entry.name && !item.disabled && !item.current)

          return (
            <span
              key={entry.id}
              data-now={index === now ? '' : undefined}
              className={cx(
                'grid size-8 place-items-center border text-micro font-extrabold leading-none min-[380px]:size-9',
                index === now ? 'border-info bg-info text-background' : can ? 'border-foreground text-foreground' : cx('border-tint/25 text-soft', index < now && 'border-dashed'),
              )}
            >
              {entry.short}
            </span>
          )
        })}
      </span>
      <span className="min-w-0 truncate text-micro font-semibold text-foreground">{name}</span>
    </button>
  )
}

/**
 * El botón del turno, abajo entre tu chapa y la botonera (Fitts: lo que más se usa, al alcance del pulgar). Un toque: en «Jugar solo» se deshace como cualquier jugada. En el turno del rival o con
 * una cadena (`live` falso) el lugar queda, apagado. Mientras el núcleo piensa conserva la última forma: no parpadea entre «Ir a Batalla» y «Terminar turno».
 */
export function TurnAction({ items, endTurn, live }: { items: readonly MenuItem[]; endTurn: (() => void) | null; live: boolean }) {
  const action = turnActionOf(items, endTurn)
  const ready = live && action.onSelect !== null
  const [kind, setKind] = useState(action.kind)

  if (ready && kind !== action.kind) setKind(action.kind)
  const battle = kind === 'battle'

  return (
    <Button
      variant={battle ? 'primary' : 'outline'}
      color={battle ? 'brand' : 'danger'}
      data-turn-action={kind}
      disabled={!ready}
      className="h-full min-w-0 flex-1 whitespace-nowrap rounded-none px-2"
      onClick={action.onSelect ?? undefined}
      {...(battle ? { iconEnd: 'arrow-right' as const } : {})}
    >
      <span className="min-w-0 truncate">{t(battle ? 'practice.mat.toBattle' : 'practice.mat.endTurnConfirm')}</span>
    </Button>
  )
}
