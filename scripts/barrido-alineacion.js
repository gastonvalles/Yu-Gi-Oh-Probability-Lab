// Barrido de contenedores desparejos: pegalo en la consola del navegador (F12) con una pantalla abierta, o corrélo con Playwright (`page.evaluate`).
// Recorre los contenedores `grid` y `flex` que tienen dos o más cajas (borde y esquinas redondeadas: tarjetas, paneles, columnas) lado a lado en una misma
// fila y avisa las que no empiezan en el mismo borde de arriba o no miden lo mismo de alto: es lo que se ve como «un desfasaje» (el chat de la sala que
// terminaba a la mitad de la columna de al lado, un cajón que asomaba por el costado de otro). Ver «Contenedores hermanos» en docs/design-system.md.
//
// No todo lo que avisa es un error: una columna que a propósito se queda corta (algo `sticky`, una lista que crece sin tope) está bien si lo dice un
// comentario en el código. Probalo con la pantalla en sus estados (vacía y con datos, el menú abierto y contraído) y a 390, 1100 y 1440 px.
;(() => {
  const isBox = (el) => {
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()

    return box.width >= 120 && box.height >= 48 && parseFloat(style.borderTopWidth) > 0 && parseFloat(style.borderTopLeftRadius) >= 6 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const nameOf = (el) => (el.getAttribute('data-testid') || el.getAttribute('aria-label') || `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')}`).slice(0, 70)
  const found = []

  for (const parent of document.querySelectorAll('body *')) {
    const style = getComputedStyle(parent)

    if (!['grid', 'flex', 'inline-grid', 'inline-flex'].includes(style.display)) continue

    const boxes = [...parent.children]
      .filter(isBox)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)

    // Las filas son las que comparten franja vertical.
    const rows = []

    for (const box of boxes) {
      const row = rows.find((candidate) => box.rect.top < candidate.bottom - 4 && box.rect.bottom > candidate.top + 4)

      if (row) {
        row.boxes.push(box)
        row.top = Math.min(row.top, box.rect.top)
        row.bottom = Math.max(row.bottom, box.rect.bottom)
      } else {
        rows.push({ boxes: [box], top: box.rect.top, bottom: box.rect.bottom })
      }
    }

    for (const row of rows) {
      if (row.boxes.length < 2) continue

      const tops = row.boxes.map((box) => box.rect.top)
      const heights = row.boxes.map((box) => box.rect.height)
      const topDelta = Math.max(...tops) - Math.min(...tops)
      const heightDelta = Math.max(...heights) - Math.min(...heights)

      if (topDelta > 2 || heightDelta > 2) {
        found.push({ contenedor: nameOf(parent), cajas: row.boxes.length, desfaseArriba: Math.round(topDelta), diferenciaDeAlto: Math.round(heightDelta), altos: heights.map(Math.round).slice(0, 6), alineacion: style.alignItems, y: Math.round(row.top + scrollY) })
      }
    }
  }

  console.table(found)

  return found
})()
