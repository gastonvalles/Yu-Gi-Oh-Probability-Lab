import { Toaster } from 'react-hot-toast'

import { TOAST_DURATION_MS } from '../../app/use-toast-message'

/** Contenedor de avisos: abajo y centrado. */
export function AppToaster() {
  return (
    <Toaster
      containerClassName="bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]! z-300! min-[1101px]:bottom-4! **:[animation-delay:0s]! **:[animation-duration:var(--motion-duration)]! **:[transition-duration:var(--motion-duration)]! motion-reduce:**:[animation-duration:1ms]! motion-reduce:**:transition-none!"
      position="bottom-center"
      gutter={8}
      toastOptions={{ duration: TOAST_DURATION_MS }}
    />
  )
}
