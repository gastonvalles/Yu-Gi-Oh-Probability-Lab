import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { toast } from 'react-hot-toast'

import type { ToastTone } from '../../app/use-toast-message'
import { PLAYER_COLOR } from '../duel/player-color'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { TONE, type Tone } from './tone'

const SWIPE_DISMISS_PX = 70

const TOAST_TONE: Record<ToastTone, { tone: Tone; icon: IconName }> = {
  info: { tone: 'brand', icon: 'info' },
  success: { tone: 'success', icon: 'check-circle' },
  warning: { tone: 'warning', icon: 'alert' },
  error: { tone: 'danger', icon: 'alert' },
}

const TOAST_BASE =
  'flex max-w-[min(26rem,calc(100vw-2rem))] cursor-grab touch-pan-y select-none items-center gap-3 rounded-card border border-tint/10 bg-surface-raised py-2.5 pl-3 pr-4 text-body font-medium text-foreground shadow-overlay transition-[transform,opacity] animate-toast-in data-[dragging=true]:cursor-grabbing data-[dragging=true]:transition-none data-[visible=false]:animate-toast-out'

/** Un mensaje del rival: más grande y con su color (el celeste del rival), el mismo de sus vidas y de su globo en el chat. */
const TOAST_RIVAL =
  'flex max-w-[min(30rem,calc(100vw-1.5rem))] cursor-grab touch-pan-y select-none items-center gap-3.5 rounded-card border-2 border-info/70 bg-surface-raised py-3 pl-4 pr-5 text-lead font-semibold text-foreground shadow-[0_0_30px_rgb(var(--info-rgb)/0.45),0_14px_30px_rgba(0,0,0,0.5)] transition-[transform,opacity] animate-toast-in data-[dragging=true]:cursor-grabbing data-[dragging=true]:transition-none data-[visible=false]:animate-toast-out'

/** Un mensaje que es sólo emojis (una reacción) se ve todavía más grande. */
const onlyEmoji = (text: string) => /^[\p{Extended_Pictographic}\s]+$/u.test(text)

interface AppToastProps {
  id: string
  visible: boolean
  message: string
  tone: ToastTone
  /** De quién es el mensaje (el nombre del rival): lo muestra con su color y más grande, sin el ícono de un aviso común. */
  rival?: string
}

/** Aviso único de la app: con color según el tipo y se descarta deslizándolo hacia un costado. */
export function AppToast({ id, visible, message, tone, rival }: AppToastProps) {
  const [offset, setOffset] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const startRef = useRef<number | null>(null)

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    startRef.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startRef.current !== null) {
      setOffset(event.clientX - startRef.current)
    }
  }

  const handleUp = () => {
    startRef.current = null

    if (Math.abs(offset) >= SWIPE_DISMISS_PX) {
      setDismissed(true)
      window.setTimeout(() => toast.remove(id), 160)
      return
    }

    setOffset(0)
  }

  const look = TOAST_TONE[tone]
  const direction = offset < 0 ? -1 : 1
  const gone = dismissed ? direction * 140 : offset

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={rival === undefined ? TOAST_BASE : TOAST_RIVAL}
      data-visible={visible && !dismissed ? 'true' : 'false'}
      data-dragging={startRef.current !== null ? 'true' : 'false'}
      style={{ transform: `translateX(${gone}px)`, opacity: dismissed ? 0 : Math.max(0.25, 1 - Math.abs(offset) / 220) }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {rival === undefined ? (
        <>
          <Icon name={look.icon} size={20} strokeWidth={2} className={cx('shrink-0', TONE[look.tone].text)} />
          <span>{message}</span>
        </>
      ) : (
        <>
          <Icon name="chat" size={26} strokeWidth={2} className={cx('shrink-0', PLAYER_COLOR.theirs.text)} />
          <span className="grid min-w-0 gap-0.5">
            <span className={cx('truncate text-micro font-extrabold uppercase tracking-[0.08em]', PLAYER_COLOR.theirs.text)}>{rival}</span>
            <span className={cx('break-words', onlyEmoji(message) ? 'text-stat leading-tight' : 'leading-snug')}>{message}</span>
          </span>
        </>
      )}
    </div>
  )
}
