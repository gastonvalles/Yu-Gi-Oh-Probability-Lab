import { createElement, useCallback } from 'react'
import { toast } from 'react-hot-toast'

import { AppToast } from '../components/ui/AppToast'

/** info: avisos neutros · success: se hizo · warning: se quitó/vació algo o falta algo · error: falló. */
export type ToastTone = 'info' | 'success' | 'warning' | 'error'

/** Cuánto dura un aviso en pantalla (se puede descartar antes deslizándolo). */
export const TOAST_DURATION_MS = 4000

export function useToastMessage(): {
  showToast: (message: string, tone?: ToastTone) => void
} {
  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    // Un solo aviso a la vez: el nuevo reemplaza al anterior.
    toast.dismiss()
    toast.custom((instance) => createElement(AppToast, { id: instance.id, visible: instance.visible, message, tone }), {
      duration: TOAST_DURATION_MS,
    })
  }, [])

  return { showToast }
}
