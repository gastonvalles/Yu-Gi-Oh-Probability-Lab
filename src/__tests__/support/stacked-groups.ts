/** Un grupo de opciones: pestañas, pastillas de una sola opción (`Segmented`) o chips que se prenden (`FilterChips`). */
const isGroup = (element: Element) =>
  element.matches('[role=tablist], [role=radiogroup]') || (element.matches('[role=group]') && element.querySelector('[aria-pressed]') !== null)

const insideGroup = (element: Element | null) => {
  for (let node = element; node; node = node.parentElement) if (isGroup(node)) return true

  return false
}

/** Dos grupos hermanos en una fila `flex` (como los de `ScrollRow`) son una sola barra, uno al lado del otro: no se apilan. */
const sameRow = (a: Element, b: Element) => {
  const row = b.parentElement

  return a.parentElement === row && row !== null && row.classList.contains('flex') && !row.classList.contains('flex-col')
}

/**
 * Los pares de grupos de opciones que van seguidos en el documento sin ningún texto propio entre ellos (un rótulo o un título), fuera de los diálogos:
 * dos barras de pastillas apiladas sin nada que las nombre (regla 12 de `docs/design-system.md`). jsdom no mide: esto ve el orden, no la distancia
 * (la fila la lee de las clases: hermanos en un `flex` sin `flex-col`).
 */
export function stackedGroups(root: HTMLElement): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  const stacked: string[] = []
  let previous: Element | null = null
  let textSince = false

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Element) {
      if (isGroup(node) && !node.closest('[role=dialog], [role=alertdialog], dialog')) {
        if (previous && !textSince && !sameRow(previous, node)) stacked.push(`${previous.getAttribute('aria-label')} + ${node.getAttribute('aria-label')}`)
        previous = node
        textSince = false
      }
    } else if (node.textContent?.trim() && !insideGroup(node.parentElement)) {
      textSince = true
    }
  }

  return stacked
}
