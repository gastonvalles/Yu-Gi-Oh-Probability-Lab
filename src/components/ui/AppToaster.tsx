import { Toaster } from 'react-hot-toast'

import { useShellInsets } from '../../app/shell-layout'
import { useToastBox } from '../../app/toast-box'
import { TOAST_DURATION_MS } from '../../app/use-toast-message'
import { cx } from './cx'

/** Contenedor de avisos: abajo y centrado (en el celular, sobre la barra de abajo si la hay); en el duelo de escritorio ancho, adentro del lateral izquierdo del campo (`useHostToasts`), donde no tapan nada. */
export function AppToaster() {
  const { bottom } = useShellInsets()
  const box = useToastBox()

  return (
    <Toaster
      containerStyle={box ? { top: box.top, left: box.left, width: box.width, height: box.height, right: 'auto', bottom: 'auto' } : { bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom}px + 0.75rem)` }}
      containerClassName={cx('app-toaster z-300! **:[animation-delay:0s]! **:[animation-duration:var(--motion-duration)]! **:[transition-duration:var(--motion-duration)]! motion-reduce:**:[animation-duration:1ms]! motion-reduce:**:transition-none!', !box && 'min-[1101px]:bottom-4!')}
      position={box ? 'bottom-left' : 'bottom-center'}
      gutter={8}
      toastOptions={{ duration: TOAST_DURATION_MS }}
    />
  )
}
