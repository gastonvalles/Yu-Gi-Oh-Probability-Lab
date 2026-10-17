import { useState } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { GOOD_MESSAGE, HOLD_MESSAGE, thinkingMessage } from './signals'

/**
 * Los mensajes rápidos del duelo, sólo con su emoji (🤔 pensando, ✋ esperá, 👍 continuá): sin texto, grandes y al alcance del pulgar.
 * Al apretarlos rebotan y el emoji sube y se desvanece (`animate-reaction-press` y `animate-reaction-rise`; con movimiento reducido quedan quietos).
 * Viajan como mensajes de chat (ver `DuelChat`).
 *
 * ✋ es un pedido de atención y no una reacción: queda apretado mientras la espera sigue pedida y tocarlo otra vez la suelta (manda 👍, "continuá").
 */
const REACTIONS = {
  thinking: { emoji: '🤔', label: () => t('duel.signal.thinking'), text: thinkingMessage },
  hold: { emoji: '✋', label: () => t('duel.signal.hold'), text: () => HOLD_MESSAGE },
  good: { emoji: '👍', label: () => t('duel.signal.good'), text: () => GOOD_MESSAGE },
} as const

/** La botonera de abajo lleva sólo lo que se necesita ya (esperá y continuá); el chat, los tres. */
const SETS = {
  dock: ['hold', 'good'],
  chat: ['thinking', 'hold', 'good'],
} as const satisfies Record<string, readonly (keyof typeof REACTIONS)[]>

interface ReactionButtonsProps {
  onSend: (text: string) => void
  /** Sin el rival en la sala no hay a quién avisarle. */
  disabled?: boolean
  className?: string
  set?: keyof typeof SETS
  /** Pediste esperar y sigue pedido: ✋ queda apretado y tocarlo lo suelta. */
  holding?: boolean
}

export function ReactionButtons({ onSend, disabled = false, className, set = 'chat', holding = false }: ReactionButtonsProps) {
  // Cuántas veces se apretó cada una: cambiar la clave de los dos spans vuelve a correr su animación.
  const [bursts, setBursts] = useState<Record<string, number>>({})

  return (
    <span role="group" aria-label={t('duel.chat.quickTitle')} className={cx('flex items-center gap-1', className)}>
      {SETS[set].map((key) => {
        const { emoji, label, text } = REACTIONS[key]
        const pressed = key === 'hold' ? holding : undefined

        return (
          <button
            key={key}
            type="button"
            aria-label={label()}
            aria-pressed={pressed}
            title={pressed ? t('duel.hold.release') : label()}
            disabled={disabled}
            className={cx(
              'relative grid h-14 w-14 cursor-pointer place-items-center rounded-control border bg-input px-0 text-stat leading-none transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-40',
              pressed ? 'border-accent bg-accent/20' : 'border-border',
            )}
            onClick={() => {
              setBursts((current) => ({ ...current, [emoji]: (current[emoji] ?? 0) + 1 }))
              // Pedida la espera, tocar ✋ otra vez la suelta: 👍 es el "continuá".
              onSend(pressed ? GOOD_MESSAGE : text())
            }}
          >
            <span key={`press-${bursts[emoji] ?? 0}`} aria-hidden="true" className={cx('block', (bursts[emoji] ?? 0) > 0 && 'motion-safe:animate-reaction-press')}>
              {emoji}
            </span>
            {(bursts[emoji] ?? 0) > 0 ? (
              <span key={`rise-${bursts[emoji]}`} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-display leading-none opacity-0 motion-safe:animate-reaction-rise">
                {emoji}
              </span>
            ) : null}
          </button>
        )
      })}
    </span>
  )
}
