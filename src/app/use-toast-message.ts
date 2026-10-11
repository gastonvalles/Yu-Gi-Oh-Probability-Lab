import { createElement, useCallback } from 'react'
import { toast } from 'react-hot-toast'

import { AppToast } from '../components/ui/AppToast'
import { reactMascot } from './mascot'

/** info: avisos neutros · success: se hizo · warning: se quitó/vació algo o falta algo · error: falló. */
export type ToastTone = 'info' | 'success' | 'warning' | 'error'

/** Cuánto dura un aviso en pantalla (se puede descartar antes deslizándolo). */
export const TOAST_DURATION_MS = 4000

/** Muestra un aviso desde cualquier lado (también fuera de React, p. ej. la alarma de la ronda). */
export function showToastMessage(message: string, tone: ToastTone = 'info'): void {
  // Un solo aviso a la vez: el nuevo reemplaza al anterior.
  toast.dismiss()
  toast.custom((instance) => createElement(AppToast, { id: instance.id, visible: instance.visible, message, tone }), {
    duration: TOAST_DURATION_MS,
  })

  // Cupsy acompaña el aviso: festeja lo que salió bien y se frustra con lo que falló.
  if (tone === 'success') {
    reactMascot('jumping', 2500)
  } else if (tone === 'error') {
    reactMascot('failed', 3000)
  }
}

export function useToastMessage(): {
  showToast: (message: string, tone?: ToastTone) => void
} {
  const showToast = useCallback(showToastMessage, [])

  return { showToast }
}
