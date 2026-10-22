import { createElement, useCallback } from 'react'
import { toast } from 'react-hot-toast'

import { AppToast, type ToastAction } from '../components/ui/AppToast'
import { reactMascot } from './mascot'

/** info: avisos neutros · success: se hizo · warning: se quitó/vació algo o falta algo · error: falló. */
export type ToastTone = 'info' | 'success' | 'warning' | 'error'

/** Cuánto dura un aviso en pantalla (se puede descartar antes deslizándolo). */
export const TOAST_DURATION_MS = 4000
/** Un aviso con un botón («Deshacer») dura el doble: hay que llegar a leerlo y a tocarlo. */
const ACTION_TOAST_DURATION_MS = 8000

interface ToastOptions {
  /** Un botón para lo que se acaba de hacer («Deshacer»): tocarlo hace la acción y cierra el aviso. */
  action?: ToastAction
}

/** Muestra un aviso desde cualquier lado (también fuera de React, p. ej. la alarma de la ronda). */
export function showToastMessage(message: string, tone: ToastTone = 'info', { action }: ToastOptions = {}): void {
  // Un solo aviso a la vez: el nuevo reemplaza al anterior.
  toast.dismiss()
  toast.custom((instance) => createElement(AppToast, { id: instance.id, visible: instance.visible, message, tone, action }), {
    duration: action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS,
  })

  // Cupsy acompaña el aviso: festeja lo que salió bien y se frustra con lo que falló.
  if (tone === 'success') {
    reactMascot('jumping', 2500)
  } else if (tone === 'error') {
    reactMascot('failed', 3000)
  }
}

/** El mensaje que escribió el rival (con el chat cerrado, en el celular): con su nombre, su color y más grande que un aviso común, en la esquina de abajo a la derecha. */
export function showRivalToast(name: string, message: string): void {
  toast.dismiss()
  toast.custom((instance) => createElement(AppToast, { id: instance.id, visible: instance.visible, message, tone: 'info', rival: name }), {
    duration: TOAST_DURATION_MS,
    position: 'bottom-right',
  })
}

export function useToastMessage(): {
  showToast: (message: string, tone?: ToastTone, options?: ToastOptions) => void
} {
  const showToast = useCallback(showToastMessage, [])

  return { showToast }
}
