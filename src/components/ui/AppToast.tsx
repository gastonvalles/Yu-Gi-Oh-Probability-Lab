import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { toast } from 'react-hot-toast'

import type { ToastTone } from '../../app/use-toast-message'
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
  'flex max-w-[min(26rem,calc(100vw-2rem))] cursor-grab touch-pan-y select-none items-center gap-3 rounded-card border border-white/10 bg-surface-raised py-2.5 pl-3 pr-4 text-body font-medium text-foreground shadow-overlay transition-[transform,opacity] animate-toast-in data-[dragging=true]:cursor-grabbing data-[dragging=true]:transition-none data-[visible=false]:animate-toast-out'

interface AppToastProps {
  id: string
  visible: boolean
  message: string
  tone: ToastTone
}

/** Aviso único de la app: con color según el tipo y se descarta deslizándolo hacia un costado. */
export function AppToast({ id, visible, message, tone }: AppToastProps) {
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
      role="status"
      className={TOAST_BASE}
      data-visible={visible && !dismissed ? 'true' : 'false'}
      data-dragging={startRef.current !== null ? 'true' : 'false'}
      style={{ transform: `translateX(${gone}px)`, opacity: dismissed ? 0 : Math.max(0.25, 1 - Math.abs(offset) / 220) }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border', TONE[look.tone].tint, TONE[look.tone].text)}>
        <Icon name={look.icon} size={16} strokeWidth={2} />
      </span>
      <span>{message}</span>
    </div>
  )
}
