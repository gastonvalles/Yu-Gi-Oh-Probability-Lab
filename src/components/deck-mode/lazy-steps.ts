import { lazy } from 'react'

/**
 * Pasos y paneles pesados: se bajan recién cuando se usan (el builder es lo primero que se ve).
 * `preloadHeavySteps` los trae en un momento ocioso para que cambiar de paso sea instantáneo.
 */
const loaders = {
  roles: () => import('../DeckRolesPanel'),
  probability: () => import('../ProbabilityPanel'),
  exportDeck: () => import('../ExportDeckPanel'),
  comparison: () => import('../comparison/ComparisonScreen'),
  practice: () => import('../probability/PracticeSection'),
  mat: () => import('../probability/PracticeMat'),
  meta: () => import('../meta/MetaScreen'),
  life: () => import('../life/LifeCalculatorScreen'),
}

const RELOAD_FLAG = 'ygo-lab:chunk-reload'

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null
  } catch {
    return true
  }
}

function writeFlag(on: boolean): void {
  try {
    if (on) {
      sessionStorage.setItem(RELOAD_FLAG, '1')
    } else {
      sessionStorage.removeItem(RELOAD_FLAG)
    }
  } catch {
    // Sin storage no se puede marcar: se deja que el error siga su curso.
  }
}

/**
 * Tras un deploy, un HTML viejo puede pedir un chunk que ya no existe. La primera vez se recarga la
 * página (trae el HTML nuevo); si vuelve a fallar, el error sigue hasta la pantalla de "Algo salió mal".
 */
function orReload<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const loaded = await load()
      writeFlag(false)
      return loaded
    } catch (error) {
      if (readFlag()) {
        throw error
      }

      writeFlag(true)
      window.location.reload()
      // Mientras recarga, la promesa queda pendiente: así no se alcanza a dibujar el error.
      return new Promise<T>(() => {})
    }
  }
}

export const LazyDeckRolesPanel = lazy(orReload(() => loaders.roles().then((m) => ({ default: m.DeckRolesPanel }))))
export const LazyProbabilityPanel = lazy(orReload(() => loaders.probability().then((m) => ({ default: m.ProbabilityPanel }))))
export const LazyExportDeckPanel = lazy(orReload(() => loaders.exportDeck().then((m) => ({ default: m.ExportDeckPanel }))))
export const LazyComparisonScreen = lazy(orReload(() => loaders.comparison().then((m) => ({ default: m.ComparisonScreen }))))
export const LazyPracticeSection = lazy(orReload(() => loaders.practice().then((m) => ({ default: m.PracticeSection }))))
export const LazyPracticeMat = lazy(orReload(() => loaders.mat().then((m) => ({ default: m.PracticeMat }))))
export const LazyMetaScreen = lazy(orReload(() => loaders.meta().then((m) => ({ default: m.MetaScreen }))))
export const LazyLifeCalculatorScreen = lazy(orReload(() => loaders.life().then((m) => ({ default: m.LifeCalculatorScreen }))))

export function preloadHeavySteps(): void {
  // Si falla de fondo (p. ej. sin red) no pasa nada: se vuelve a intentar al abrir el paso.
  const run = () => Object.values(loaders).forEach((load) => void load().catch(() => {}))
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback

  if (idle) {
    idle(run)
  } else {
    window.setTimeout(run, 1500)
  }
}
