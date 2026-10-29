/**
 * La tarjeta del escenario de la sala (los dos jugadores y lo que toca hacer), la misma con y sin el rival adentro: sobre la arena de la mesa (`MatScene`, que va adentro como primer hijo), con lo de adentro centrado
 * y, en escritorio, a todo el alto que queda (es uno de los tres paneles iguales de la sala: poco margen, para que los dos jugadores entren con el menú lateral abierto). Las medidas con `@[46rem]` son las del contenedor de la sala (no las de la pantalla): con el menú lateral abierto la sala cambia de forma antes.
 */
export const STAGE_CARD = 'relative isolate grid content-center overflow-hidden rounded-panel border border-border-subtle p-3 @[46rem]:p-4'

/** El ancho de lo que va adentro del escenario: no se estira a todo el ancho de una pantalla grande. */
export const STAGE_INNER = 'mx-auto grid w-full max-w-xl gap-3 @[46rem]:gap-6'
