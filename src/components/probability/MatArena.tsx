import { cx } from '../ui/cx'

/**
 * La arena de la mesa (Gastón, 2026-10-20: «comparado con la imagen que te envié, el nuestro es totalmente simplón»; sólo estética). Tres piezas que no cambian el tamaño ni el lugar de nada, todas decoración (`aria-hidden`, sin toques):
 * - `MatScene`: el fondo de la mesa, con luz y viñeta (en vez del color liso del resto de la app).
 * - `MatPlate`: la placa que está debajo del campo, con su marco de esquinas y rombos; toma la perspectiva del campo.
 * - `PickMarks`: las esquinas (y el rombo) de una casilla que se puede elegir.
 * Los estilos están en `index.css` (`mat-scene`, `mat-plate`, `mat-corner`, `mat-stud`, `mat-pick-marks`) y se ven en `/playground`.
 */
export function MatScene({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('mat-scene', className)} />
}

/** La placa del campo: va como primer hijo del campo, que tiene que ser su propio contexto (`isolate`) para que quede detrás de las casillas. Sobresale un poco del campo por todos lados. */
export function MatPlate() {
  return (
    <span aria-hidden="true" className="mat-plate absolute -inset-x-[1%] -inset-y-[5%] -z-10">
      <span className="mat-corner left-[0.55rem] top-[0.55rem] [--cx:left] [--cy:top]" />
      <span className="mat-corner right-[0.55rem] top-[0.55rem] [--cx:right] [--cy:top]" />
      <span className="mat-corner bottom-[0.55rem] left-[0.55rem] [--cx:left] [--cy:bottom]" />
      <span className="mat-corner bottom-[0.55rem] right-[0.55rem] [--cx:right] [--cy:bottom]" />
      <span className="mat-stud left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" />
      <span className="mat-stud bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
      <span className="mat-stud left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 max-[1100px]:hidden" />
      <span className="mat-stud right-0 top-1/2 -translate-y-1/2 translate-x-1/2 max-[1100px]:hidden" />
    </span>
  )
}

/** Las marcas de una casilla que se puede elegir: cuatro esquinas y, si está libre, un rombo en el medio (una carta que se elige —un Sacrificio, un material— no lleva rombo: taparía la carta). */
export function PickMarks({ diamond }: { diamond: boolean }) {
  return (
    <span aria-hidden="true" className="mat-pick-marks">
      {diamond ? <span className="mat-pick-diamond" /> : null}
    </span>
  )
}
