import { useEffect, useRef, useState, type RefObject } from 'react'

import type { FoilFrame, FoilKind } from '../../app/card-foil'

/**
 * La imagen de la carta que está al lado del brillo (el escaneo o la carta de YGOPRODeck que dibuja `CardArt`): el relieve de la Ultimate la necesita para marcar los bordes del dibujo. Se vuelve a leer cuando
 * la imagen carga o cambia (la chica se cambia por la grande). Sólo corre si hace falta (`enabled`).
 */
function useFaceImage(ref: RefObject<HTMLElement | null>, enabled: boolean): string | null {
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    const face = ref.current?.parentElement

    if (!enabled || !face) {
      return
    }

    const read = () => {
      const image = face.querySelector('img')

      setSource(image?.currentSrc || image?.src || null)
    }

    read()
    face.addEventListener('load', read, true)

    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(read)

    observer?.observe(face, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })

    return () => {
      face.removeEventListener('load', read, true)
      observer?.disconnect()
    }
  }, [ref, enabled])

  return enabled ? source : null
}

/**
 * El brillo de la rareza de una impresión sobre la carta grande: capas de CSS (`foil.css`) que van encima de la imagen y simulan el papel de verdad —arcoíris que se mueve en el arte, rayas, vidrio roto, estrellas,
 * oro, plata, el nombre de lámina y el borde—. Va **adentro del frente de la carta** (`CardFlip`), pegado a ella: gira con la carta y se esconde con el dorso. Cada efecto usa las capas que necesita: `rf-glare` (el reflejo
 * de la lámpara), `rf-art` (la textura principal), `rf-detail` (el dibujo fino), `rf-text` (la caja del texto), `rf-sparkle` (el polvo brillante), `rf-title` (el nombre), `rf-border` (el borde) y, sólo en la Ultimate,
 * `rf-relief` (el grabado: la imagen de la carta en grises con un filtro de relieve).
 *
 * Sigue al puntero (`--foil-px`, `--foil-py` y `--foil-d`, que escribe `card-tilt.tsx` mientras la carta se inclina) y, mientras nadie la toca, se mueve sola despacio para que se vea también en el
 * celular; con movimiento reducido queda quieta. Es sólo decoración: `aria-hidden`, sin eventos, y la rareza ya la dice el texto de la impresión.
 */
export function RarityFoil({ kind, frame = 'monster' }: { kind: FoilKind; frame?: FoilFrame }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const relief = kind === 'ultimate'
  const image = useFaceImage(ref, relief)

  return (
    <span ref={ref} aria-hidden="true" data-foil={kind} data-frame={frame} className="rarity-foil">
      <span className="rf-glare" />
      <span className="rf-art" />
      <span className="rf-detail" />
      <span className="rf-text" />
      <span className="rf-sparkle" />
      <span className="rf-title" />
      <span className="rf-border" />
      {relief ? (
        <>
          {/* El grabado: grises, y una matriz que suma 0 (resta lo de arriba a la izquierda y suma lo de abajo a la derecha) con 0,5 de más: lo liso queda en gris medio y sólo los bordes del dibujo se levantan o se hunden. */}
          <svg width="0" height="0" focusable="false" className="pointer-events-none absolute">
            <filter id="rf-emboss" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feColorMatrix type="saturate" values="0" />
              <feConvolveMatrix order="3" kernelMatrix="-2 -1 0 -1 0 1 0 1 2" divisor="1" bias="0.5" edgeMode="duplicate" preserveAlpha="true" />
            </filter>
          </svg>
          <span className="rf-relief" style={image ? { backgroundImage: `url("${image}")` } : undefined} />
        </>
      ) : null}
    </span>
  )
}
