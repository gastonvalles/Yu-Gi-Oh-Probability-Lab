/**
 * La geometría del menú lateral, para que contraerlo no mueva nada: el ícono de cada fila (y la marca, y la flecha de contraer) vive en una
 * columna de 52 px que es lo que queda a la vista contraído (76 px de menú menos los 12 px de relleno de cada lado), así que el ícono está en
 * el mismo lugar abierto y cerrado; el rótulo va a su derecha y el menú, que recorta lo que sobra, lo va tapando o mostrando al cambiar de
 * ancho. Las filas miden lo mismo en los dos estados, así tampoco se corre nada hacia arriba o hacia abajo.
 */
export const RAIL_SLOT = 'grid h-full w-13 shrink-0 place-items-center'

/** Alto de una fila del menú (destino o flecha de contraer). */
export const RAIL_ROW = 'h-10.5'

/** Un rótulo del menú: ancho fijo (nada se reacomoda ni se trunca mientras el menú cambia de ancho) y se desvanece al contraer, rápido, y vuelve un poco después de que el menú empezó a abrirse. */
export const RAIL_LABEL =
  'transition-opacity duration-200 delay-100 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:delay-0 group-data-[collapsed=true]/sidebar:duration-100 motion-reduce:transition-none'

/** En el menú lateral el rótulo mide siempre lo mismo (el cajón del celular lo deja crecer); lo que sobra lo recorta el menú. */
export const RAIL_LABEL_WIDTH = 'group-data-[collapsed]/sidebar:w-36 group-data-[collapsed]/sidebar:flex-none'
