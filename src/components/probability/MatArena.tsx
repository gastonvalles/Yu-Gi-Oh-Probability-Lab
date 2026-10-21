import { useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { coverArtUrl } from '../../app/meta'
import type { Placed } from '../../app/practice-mat'
import { cx } from '../ui/cx'

/**
 * La arena de la mesa (Gastón, 2026-10-20: «comparado con la imagen que te envié, el nuestro es totalmente simplón»; sólo estética). Cuatro piezas que no cambian el tamaño ni el lugar de nada, todas decoración (`aria-hidden`, sin toques):
 * - `MatScene`: el fondo de la mesa, con luz y viñeta (en vez del color liso del resto de la app).
 * - `MatPlate`: la placa que está debajo del campo, con su marco de esquinas y rombos; toma la perspectiva del campo.
 * - `FieldArt`: el arte de la magia de campo activada, de fondo de la mitad de quien la activó.
 * - `PickMarks`: las esquinas (y el rombo) de una casilla que se puede elegir.
 * Los estilos están en `index.css` (`mat-scene`, `mat-plate`, `mat-field-art`, `mat-corner`, `mat-stud`, `mat-pick-marks`) y se ven en `/playground`.
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
      <span className="mat-stud left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 max-[1101px]:hidden" />
      <span className="mat-stud right-0 top-1/2 -translate-y-1/2 translate-x-1/2 max-[1101px]:hidden" />
    </span>
  )
}

/** Una imagen de carta de YGOPRODeck (la entera, la chica o la recortada): su número da el arte solo. */
const CARD_IMAGE = /^https:\/\/images\.ygoprodeck\.com\/images\/cards(?:_small|_cropped)?\/(\d+)\.jpg$/

/**
 * El fondo del campo de un jugador: el arte recortado (sin marco ni texto, `cards_cropped`, achicado a 512 px por el proxy) de lo que tiene **boca arriba** en su Zona de campo, a partir de la imagen
 * con que se dibuja esa carta (`artOf`). `null` si la zona está vacía, la carta está boca abajo o no se sabe cuál es (una del rival que no mostró). No mira el tipo de carta: la mesa no valida reglas.
 */
export function fieldArtSrc(field: Placed | null, artOf: (id: string) => string | null): string | null {
  if (!field || field.pos === 'set') return null

  const passcode = CARD_IMAGE.exec(artOf(field.id) ?? '')?.[1]
  return passcode ? cardImageSrc(coverArtUrl(Number(passcode)), 512) : null
}

/**
 * La mitad de cada jugador, por las líneas con nombre de las áreas de la grilla: de su fila de monstruos a la de sus pilas y de punta a punta. Las mismas líneas valen en la práctica, en el duelo y en el
 * celular de cinco columnas (cambia dónde cae cada casilla, no su nombre), así que no se mide nada. La fila del medio (las Zonas Extra y las fases) no es de nadie.
 */
const FIELD_HALF = {
  mine: 'm1-start / extra-start / extra-end / deck-end',
  theirs: 'tdeck-start / tdeck-start / tm1-end / textra-end',
} as const

/**
 * El arte de la magia de campo activada, de fondo de la mitad de quien la activó (Gastón, 2026-10-21: «si se activa una magia de campo el arte de la carta debe aparecer como background del campo
 * de quien la activó, pero solo de su campo»). Va adentro del campo, como la placa (el campo es `isolate`): queda encima de ella y debajo de las casillas, y en la vista 3D se inclina con el campo. Entra con un
 * fundido cuando la imagen llegó y, si la carta se va o se da vuelta, se apaga con otro (se queda con la última imagen mientras tanto); con movimiento reducido, sin fundido. Va derecho para los dos:
 * las cartas del rival miran hacia él, su fondo no. El estilo es `mat-field-art` (`index.css`).
 */
export function FieldArt({ src, side }: { src: string | null; side: keyof typeof FIELD_HALF }) {
  const [shown, setShown] = useState(src)
  const [loaded, setLoaded] = useState<string | null>(null)

  if (src !== null && src !== shown) setShown(src)
  if (shown === null) return null

  return (
    <span aria-hidden="true" data-side={side} data-shown={src !== null && loaded === src ? 'true' : 'false'} className="mat-field-art" style={{ gridArea: FIELD_HALF[side] }}>
      <img src={shown} alt="" decoding="async" draggable={false} onLoad={() => setLoaded(shown)} />
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
