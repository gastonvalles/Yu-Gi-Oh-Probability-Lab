/** Textos que sirven en cualquier parte (botones genéricos, el sitio, el idioma). Cada área tiene su propio archivo y prefijo. */
export const common = {
  'common.scrollBack': 'Ver lo anterior',
  'common.scrollForward': 'Ver lo que sigue',
  // El carrusel (`ui/Carousel`): lo que dice un lector de pantalla del carril, de cada tarjeta y de cada punto.
  'common.carousel': 'carrusel',
  'common.carousel.slide': '{index} de {count}',
  'common.carousel.goTo': 'Ver la {index} de {count}',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  // El asa de una hoja de abajo del celular (`SheetHandle`): la baja sin cerrarla y la vuelve a subir.
  'common.sheet.lower': 'Bajar la hoja',
  'common.sheet.raise': 'Subir la hoja: {title}',
  'common.delete': 'Borrar',
  'common.save': 'Guardar',
  'common.language': 'Idioma',
  'common.selectPlaceholder': 'Elegir',
  'common.selectCount': { one: '{count} elegido', other: '{count} elegidos' },
  'common.siteDescription': 'Deck builder y calculadora exacta de probabilidades para Yu-Gi-Oh!: armá tu deck, clasificá cartas y medí su consistencia.',
  'common.siteImageAlt': 'YGOUltraLab: deck builder y calculadora exacta de probabilidades para Yu-Gi-Oh!',
} as const
