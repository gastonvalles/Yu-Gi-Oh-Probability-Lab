import { useState } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { GOOD_MESSAGE, thinkingMessage } from './signals'

/**
 * Los mensajes rápidos del duelo, sólo con su emoji (🤔 pensando, 👍 continuá): sin texto, grandes y al alcance del pulgar.
 * Al apretarlos rebotan y el emoji sube y se desvanece (`animate-reaction-press` y `animate-reaction-rise`; con movimiento reducido quedan quietos).
 * Viajan como mensajes de chat (ver `DuelChat`).
 */
const REACTIONS = {
  thinking: { emoji: '🤔', label: () => t('duel.signal.thinking'), text: thinkingMessage },
  good: { emoji: '👍', label: () => t('duel.signal.good'), text: () => GOOD_MESSAGE },
} as const

/** La botonera de abajo lleva sólo lo que se necesita ya (continuá); el chat, la sala y la mesa, las dos. Sin ✋ Esperá (Gastón, 2026-10-18 y 2026-10-19: «elimina totalmente esto»). */
const SETS = {
  dock: ['good'],
  chat: ['thinking', 'good'],
} as const satisfies Record<string, readonly (keyof typeof REACTIONS)[]>

interface ReactionButtonsProps {
  onSend: (text: string) => void
  /** Sin el rival en la sala no hay a quién avisarle. */
  disabled?: boolean
  className?: string
  set?: keyof typeof SETS
}

export function ReactionButtons({ onSend, disabled = false, className, set = 'chat' }: ReactionButtonsProps) {
  // Cuántas veces se apretó cada una: cambiar la clave de los dos spans vuelve a correr su animación.
  const [bursts, setBursts] = useState<Record<string, number>>({})

  return (
    <span role="group" aria-label={t('duel.chat.quickTitle')} className={cx('flex items-center gap-1', className)}>
      {SETS[set].map((key) => {
        const { emoji, label, text } = REACTIONS[key]

        return (
          <button
            key={key}
            type="button"
            aria-label={label()}
            title={label()}
            disabled={disabled}
            className={cx(
              'relative grid cursor-pointer place-items-center border px-0 leading-none transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-40',
              // La botonera de abajo: cajas oscuras de 44 px con el emoji a 24 px (como el resto de la botonera); el chat, grandes (56 px, emoji de 33).
              set === 'dock' ? 'size-11 rounded-card bg-card-background text-title hover:border-tint/40' : 'h-14 w-14 rounded-control bg-input text-stat hover:bg-surface-hover',
              set === 'dock' ? 'border-border-subtle' : 'border-border',
            )}
            onClick={() => {
              setBursts((current) => ({ ...current, [emoji]: (current[emoji] ?? 0) + 1 }))
              onSend(text())
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
