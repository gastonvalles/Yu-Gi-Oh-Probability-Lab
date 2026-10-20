import type { FoilFrame, FoilKind } from '../../app/card-foil'

/**
 * El brillo de la rareza de una impresión sobre la carta grande: capas de CSS (`index.css`, «Foil de rareza») que van encima de la imagen y simulan el papel de verdad —arcoíris que se mueve en el
 * arte, rayas, polvo brillante, oro, plata—. Va **adentro del frente de la carta** (`CardFlip`), pegado a ella: gira con la carta y se esconde con el dorso.
 *
 * Sigue al puntero (`--foil-px`, `--foil-py` y `--foil-d`, que escribe `card-tilt.tsx` mientras la carta se inclina) y, mientras nadie la toca, se mueve sola despacio para que se vea también en el
 * celular; con movimiento reducido queda quieta. Es sólo decoración: `aria-hidden`, sin eventos, y la rareza ya la dice el texto de la impresión.
 */
export function RarityFoil({ kind, frame = 'monster' }: { kind: FoilKind; frame?: FoilFrame }) {
  return (
    <span aria-hidden="true" data-foil={kind} data-frame={frame} className="rarity-foil">
      <span className="rf-lamp" />
      <span className="rf-card" />
      <span className="rf-art" />
      <span className="rf-spark" />
    </span>
  )
}
