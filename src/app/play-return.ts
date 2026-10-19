const KEY = 'ygo-lab:play-return'

/** La dirección de Jugar a la que vuelve el builder (la sala o el lobby), si se llegó al builder desde ahí. */
export function readPlayReturn(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPlayReturn() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Sin almacenamiento el builder no ofrece volver: se vuelve por el menú o con «Atrás».
  }
}

/**
 * Toda referencia al deck dentro de Jugar lleva al builder (Gastón, 2026-10-19: «el usuario debe poder interactuar con sus cartas antes de entrar a jugar»): se recuerda dónde se estaba
 * (el lobby o la sala, con su código) para que el builder ofrezca «Volver a Jugar» y se abre.
 */
export function openBuilderFromPlay() {
  try {
    sessionStorage.setItem(KEY, window.location.hash || '#duel')
  } catch {
    // Ver arriba.
  }

  window.location.hash = '#deck-builder'
}
