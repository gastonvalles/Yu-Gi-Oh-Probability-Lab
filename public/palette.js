/*
 * La paleta elegida (Índigo), puesta en el html antes del primer pintado: sin esto, con Índigo guardado se vería un cuadro en Carbón hasta que arranca la app.
 * Es lo mismo que hace `applyPalette` (src/app/palette.ts); la clave es la misma. Va en el head, sin `defer`, y es un archivo propio (la CSP no deja scripts en línea).
 * Ojo si lo tocás: la prueba src/__tests__/palette.test.ts lo ejecuta tal cual está.
 */
;(function (d) {
  try {
    if (localStorage.getItem('ygo-lab:palette') === 'indigo') d.documentElement.setAttribute('data-palette', 'indigo')
  } catch (e) {
    // Sin almacenamiento: Carbón.
  }
})(document)
