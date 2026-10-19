import { audioContext } from './audio'
import { soundsOn } from './sound-prefs'

/** Tonos: frecuencia (Hz) y duración (s), uno tras otro. El tuyo es un golpecito grave; el del rival, dos notas que suben (se distinguen sin mirar). */
const TONES: Record<'mine' | 'theirs', ReadonlyArray<readonly [number, number]>> = {
  mine: [[520, 0.07]],
  theirs: [
    [880, 0.08],
    [1175, 0.11],
  ],
}

/** Bajo a propósito: suena en medio de un duelo, no lo interrumpe. */
const GAIN = 0.045

/** El sonido sutil de un mensaje del chat (ver `useChatSound`). Sin el audio desbloqueado por un toque no suena nada. */
export function playChatSound(side: 'mine' | 'theirs'): void {
  const audio = audioContext()

  if (!audio || !soundsOn()) {
    return
  }

  let at = audio.currentTime + 0.01

  for (const [frequency, duration] of TONES[side]) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(GAIN, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.03)
    at += duration * 0.8
  }
}
