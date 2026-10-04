import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { toast } from 'react-hot-toast'

import type { ToastTone } from '../../app/use-toast-message'

const SWIPE_DISMISS_PX = 70

const TONE_ICON: Record<ToastTone, string> = {
  info: 'M12 8v.01M11 12h1v5h1',
  success: 'm6 12.5 4 4 8-9',
  warning: 'M12 7v6M12 16.5v.01',
  error: 'm8 8 8 8M16 8l-8 8',
}

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

  const direction = offset < 0 ? -1 : 1
  const gone = dismissed ? direction * 140 : offset

  return (
    <div
      role="status"
      className="app-toast"
      data-tone={tone}
      data-visible={visible && !dismissed ? 'true' : 'false'}
      data-dragging={startRef.current !== null ? 'true' : 'false'}
      style={{ transform: `translateX(${gone}px)`, opacity: dismissed ? 0 : Math.max(0.25, 1 - Math.abs(offset) / 220) }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <svg className="app-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" strokeWidth="1.6" />
        <path d={TONE_ICON[tone]} />
      </svg>
      <span>{message}</span>
    </div>
  )
}
