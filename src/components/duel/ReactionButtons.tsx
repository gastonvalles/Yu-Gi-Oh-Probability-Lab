import { useEffect, useState } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { GOOD_MESSAGE, thinkingMessage } from '../../app/duel-signals'

/**
 * Los mensajes rápidos del duelo, sólo con su emoji (🤔 pensando, 👍 continuá): sin texto, grandes y al alcance del pulgar.
 * Al apretarlos rebotan y el emoji sube y se desvanece (`animate-reaction-press` y `animate-reaction-rise`; con movimiento reducido quedan quietos).
 * Viajan como mensajes de chat (ver `DuelChat`).
 */
const REACTIONS = {
  thinking: { emoji: '🤔', label: () => t('duel.signal.thinking'), text: thinkingMessage },
  good: { emoji: '👍', label: () => t('duel.signal.good'), text: () => GOOD_MESSAGE },
} as const

/** Las dos, en el chat (el panel de escritorio y la hoja del celular: Gastón, 2026-10-27, la botonera de abajo se fue) y en la sala. Sin ✋ Esperá (Gastón, 2026-10-18 y 2026-10-19: «elimina totalmente esto»). */
const KEYS = ['thinking', 'good'] as const satisfies readonly (keyof typeof REACTIONS)[]

interface ReactionButtonsProps {
  onSend: (text: string) => void
  /** Sin el rival en la sala no hay a quién avisarle. */
  disabled?: boolean
  /** Cuándo se puede mandar la próxima (`DuelSnapshot.emoteReadyAt`): hasta entonces las dos quedan apagadas (una señal cada 3 segundos, así no se spamean). */
  readyAt?: number
  className?: string
}

export function ReactionButtons({ onSend, disabled = false, readyAt = 0, className }: ReactionButtonsProps) {
  // Cuántas veces se apretó cada una: cambiar la clave de los dos spans vuelve a correr su animación.
  const [bursts, setBursts] = useState<Record<string, number>>({})
  const [, repaint] = useState(0)
  const waiting = readyAt > Date.now()

  // Al cumplirse el plazo las botoneras se vuelven a encender solas.
  useEffect(() => {
    if (readyAt <= Date.now()) return

    const id = setTimeout(() => repaint((count) => count + 1), readyAt - Date.now())

    return () => clearTimeout(id)
  }, [readyAt])

  return (
    <span role="group" aria-label={t('duel.chat.quickTitle')} className={cx('flex items-center gap-1', className)}>
      {KEYS.map((key) => {
        const { emoji, label, text } = REACTIONS[key]

        return (
          <button
            key={key}
            type="button"
            aria-label={label()}
            title={label()}
            disabled={disabled || waiting}
            // Grandes: 56 px, con el emoji de 33.
            className="relative grid h-14 w-14 cursor-pointer place-items-center rounded-control border border-border bg-input px-0 text-stat leading-none transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-40"
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
