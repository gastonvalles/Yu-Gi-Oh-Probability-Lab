import { useState } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { GOOD_MESSAGE, thinkingMessage } from './signals'

/**
 * Los dos mensajes rápidos del duelo, sólo con su emoji (🤔 pensando, 👍 todo bien / paso): sin texto, grandes y al alcance del pulgar.
 * Al apretarlos rebotan y el emoji sube y se desvanece (`animate-reaction-press` y `animate-reaction-rise`; con movimiento reducido quedan quietos).
 * Viajan como mensajes de chat (ver `DuelChat`).
 */
const REACTIONS = [
  { emoji: '🤔', label: () => t('duel.signal.thinking'), text: thinkingMessage },
  { emoji: '👍', label: () => t('duel.signal.good'), text: () => GOOD_MESSAGE },
] as const

interface ReactionButtonsProps {
  onSend: (text: string) => void
  /** Sin el rival en la sala no hay a quién avisarle. */
  disabled?: boolean
  className?: string
}

export function ReactionButtons({ onSend, disabled = false, className }: ReactionButtonsProps) {
  // Cuántas veces se apretó cada una: cambiar la clave de los dos spans vuelve a correr su animación.
  const [bursts, setBursts] = useState<Record<string, number>>({})

  return (
    <span role="group" aria-label={t('duel.chat.quickTitle')} className={cx('flex items-center gap-1', className)}>
      {REACTIONS.map(({ emoji, label, text }) => (
        <button
          key={emoji}
          type="button"
          aria-label={label()}
          title={label()}
          disabled={disabled}
          className="relative grid h-11 min-w-10 cursor-pointer place-items-center rounded-control border border-border bg-input px-2 text-title leading-none transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-40"
          onClick={() => {
            setBursts((current) => ({ ...current, [emoji]: (current[emoji] ?? 0) + 1 }))
            onSend(text())
          }}
        >
          <span key={`press-${bursts[emoji] ?? 0}`} aria-hidden="true" className={cx('block', (bursts[emoji] ?? 0) > 0 && 'motion-safe:animate-reaction-press')}>
            {emoji}
          </span>
          {(bursts[emoji] ?? 0) > 0 ? (
            <span key={`rise-${bursts[emoji]}`} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 opacity-0 motion-safe:animate-reaction-rise">
              {emoji}
            </span>
          ) : null}
        </button>
      ))}
    </span>
  )
}
