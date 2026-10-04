import { Toaster } from 'react-hot-toast'

import { TOAST_DURATION_MS } from '../../app/use-toast-message'

/** Contenedor de avisos: abajo, centrado, por encima de la barra de pasos en mobile. */
export function AppToaster() {
  return (
    <Toaster
      containerClassName="app-toaster"
      position="bottom-center"
      gutter={8}
      toastOptions={{ duration: TOAST_DURATION_MS }}
    />
  )
}
