import { Toaster } from 'react-hot-toast'

import { useShellInsets } from '../../app/shell-layout'
import { TOAST_DURATION_MS } from '../../app/use-toast-message'

/** Contenedor de avisos: abajo y centrado (en el celular, sobre la barra de abajo si la hay). */
export function AppToaster() {
  const { bottom } = useShellInsets()

  return (
    <Toaster
      containerStyle={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom}px + 0.75rem)` }}
      containerClassName="app-toaster z-300! min-[1101px]:bottom-4! **:[animation-delay:0s]! **:[animation-duration:var(--motion-duration)]! **:[transition-duration:var(--motion-duration)]! motion-reduce:**:[animation-duration:1ms]! motion-reduce:**:transition-none!"
      position="bottom-center"
      gutter={8}
      toastOptions={{ duration: TOAST_DURATION_MS }}
    />
  )
}
