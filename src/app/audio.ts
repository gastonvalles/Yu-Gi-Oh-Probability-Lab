let context: AudioContext | null = null

/** El audio se desbloquea con un toque (iOS lo exige): así los avisos pueden sonar solos durante la ronda y el duelo. */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') {
    return
  }

  context ??= new AudioContext()
  void context.resume()
}

/** El audio de la página si ya se desbloqueó con un toque; si no, null (sin un toque antes el navegador no deja sonar nada). */
export function audioContext(): AudioContext | null {
  return context
}
