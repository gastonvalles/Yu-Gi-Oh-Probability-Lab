import { audioContext } from './audio'
import { soundsOn } from './sound-prefs'
import type { MatAction } from './practice-mat'

/**
 * Los efectos de sonido del duelo, hechos con osciladores y ruido (no hay archivos de audio): cada jugada de la mesa suena distinto (una Invocación Normal, una Especial, cada tipo del
 * Extra Deck, colocar boca abajo, activar, robar, barajar, mandar al cementerio, desterrar, atacar, cambiar de fase, pasar el turno), y también las vidas, el resultado y el reloj.
 * Suenan igual las del rival y las propias. Sin el audio desbloqueado por un toque o con los sonidos apagados (`sound-prefs`), no suena nada.
 */
export type Sfx = 'summon' | 'special' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'set' | 'activate' | 'draw' | 'shuffle' | 'grave' | 'banish' | 'attack' | 'phase' | 'turn' | 'flip' | 'tick' | 'undo' | 'lpDown' | 'lpUp' | 'win' | 'lose' | 'dice'

/** Qué suena con cada jugada de la mesa (null: nada, p. ej. la respuesta automática de un cambio de control, que ya sonó con la jugada que la provocó). */
export function sfxOfAction(action: MatAction): Sfx | null {
  if ('auto' in action && action.auto) {
    return null
  }

  switch (action.type) {
    case 'draw':
      return 'draw'
    case 'mill':
      return 'grave'
    case 'shuffle':
      return 'shuffle'
    case 'move':
      return action.to === 'gy' ? 'grave' : action.to === 'banished' ? 'banish' : action.to === 'hand' ? 'draw' : 'shuffle'
    case 'place':
      return action.pos === 'set' ? 'set' : action.how === 'special' || action.how === 'pendulum' ? 'special' : action.zone === 'mz' || action.zone === 'emz' ? 'summon' : 'activate'
    case 'tribute':
      return action.pos === 'set' ? 'set' : 'summon'
    case 'summon':
      return action.how
    case 'attach':
      return 'xyz'
    case 'position':
    case 'reveal':
    case 'declare':
      return 'flip'
    case 'counter':
    case 'target':
      return 'tick'
    case 'token':
    case 'give':
    case 'take':
    case 'regain':
      return 'special'
    case 'activate':
    case 'rivalUse':
      return 'activate'
    case 'attack':
      return 'attack'
    case 'phase':
      return action.phase === 'draw' ? 'turn' : 'phase'
    case 'batch': {
      // Un solo sonido, el de la primera carta del lote (el barajado que la acompaña no suena aparte, como al buscar una sola); un lote dentro de otro no hace nada.
      const part = action.actions.find((entry) => entry.type !== 'shuffle') ?? action.actions[0]
      return part && part.type !== 'batch' ? sfxOfAction(part) : null
    }
  }
}

type Voice = { type: OscillatorType; from: number; to?: number; at: number; length: number; gain: number }
type Burst = { at: number; length: number; from: number; to?: number; gain: number; q?: number }

/** Cada efecto: unas notas (osciladores con su barrido) y unas ráfagas de ruido filtrado (golpes y roces). Todo corto (menos de medio segundo) y bajo. */
const RECIPES: Record<Sfx, { voices?: Voice[]; bursts?: Burst[] }> = {
  summon: { voices: [{ type: 'triangle', from: 150, to: 70, at: 0, length: 0.16, gain: 0.16 }, { type: 'sine', from: 660, at: 0.04, length: 0.14, gain: 0.07 }], bursts: [{ at: 0, length: 0.06, from: 900, gain: 0.05 }] },
  special: { voices: [{ type: 'sine', from: 420, to: 840, at: 0, length: 0.18, gain: 0.09 }, { type: 'sine', from: 630, to: 1260, at: 0.07, length: 0.2, gain: 0.07 }] },
  fusion: { voices: [{ type: 'sawtooth', from: 220, to: 330, at: 0, length: 0.32, gain: 0.04 }, { type: 'sine', from: 523, at: 0.05, length: 0.3, gain: 0.07 }, { type: 'sine', from: 784, at: 0.12, length: 0.3, gain: 0.06 }], bursts: [{ at: 0, length: 0.3, from: 400, to: 3000, gain: 0.03, q: 2 }] },
  synchro: { voices: [{ type: 'sine', from: 1046, at: 0, length: 0.4, gain: 0.07 }, { type: 'sine', from: 1568, at: 0.06, length: 0.36, gain: 0.05 }, { type: 'triangle', from: 523, at: 0.1, length: 0.3, gain: 0.05 }] },
  xyz: { voices: [{ type: 'square', from: 110, to: 55, at: 0, length: 0.26, gain: 0.05 }, { type: 'sine', from: 330, to: 220, at: 0.04, length: 0.28, gain: 0.08 }], bursts: [{ at: 0, length: 0.1, from: 300, gain: 0.05 }] },
  link: { voices: [{ type: 'square', from: 880, at: 0, length: 0.07, gain: 0.04 }, { type: 'square', from: 1318, at: 0.09, length: 0.07, gain: 0.04 }, { type: 'sine', from: 660, to: 990, at: 0.18, length: 0.2, gain: 0.07 }] },
  set: { bursts: [{ at: 0, length: 0.07, from: 1800, gain: 0.07 }, { at: 0.07, length: 0.06, from: 900, gain: 0.05 }] },
  activate: { voices: [{ type: 'sine', from: 523, at: 0, length: 0.14, gain: 0.07 }, { type: 'sine', from: 659, at: 0.07, length: 0.14, gain: 0.07 }, { type: 'sine', from: 784, at: 0.14, length: 0.22, gain: 0.07 }] },
  draw: { bursts: [{ at: 0, length: 0.12, from: 1200, to: 3200, gain: 0.07 }] },
  shuffle: { bursts: [0, 0.06, 0.12, 0.18, 0.24].map((at) => ({ at, length: 0.05, from: 2200, gain: 0.05 })) },
  grave: { voices: [{ type: 'sine', from: 260, to: 80, at: 0, length: 0.3, gain: 0.12 }], bursts: [{ at: 0, length: 0.08, from: 400, gain: 0.04 }] },
  banish: { voices: [{ type: 'sine', from: 900, to: 150, at: 0, length: 0.3, gain: 0.07 }], bursts: [{ at: 0, length: 0.28, from: 3000, to: 500, gain: 0.04 }] },
  attack: { bursts: [{ at: 0, length: 0.16, from: 600, to: 4200, gain: 0.08, q: 1.5 }, { at: 0.16, length: 0.1, from: 250, gain: 0.1 }], voices: [{ type: 'triangle', from: 120, to: 50, at: 0.16, length: 0.18, gain: 0.12 }] },
  phase: { voices: [{ type: 'sine', from: 880, at: 0, length: 0.05, gain: 0.05 }] },
  turn: { voices: [{ type: 'sine', from: 784, at: 0, length: 0.2, gain: 0.08 }, { type: 'sine', from: 1046, at: 0.12, length: 0.3, gain: 0.08 }] },
  flip: { bursts: [{ at: 0, length: 0.05, from: 2600, gain: 0.05 }], voices: [{ type: 'sine', from: 980, at: 0.03, length: 0.06, gain: 0.04 }] },
  tick: { voices: [{ type: 'square', from: 1500, at: 0, length: 0.03, gain: 0.035 }] },
  undo: { voices: [{ type: 'sine', from: 700, to: 350, at: 0, length: 0.16, gain: 0.07 }] },
  lpDown: { voices: [{ type: 'sawtooth', from: 220, to: 90, at: 0, length: 0.32, gain: 0.07 }, { type: 'sine', from: 110, to: 60, at: 0.05, length: 0.3, gain: 0.1 }] },
  lpUp: { voices: [{ type: 'sine', from: 392, at: 0, length: 0.12, gain: 0.07 }, { type: 'sine', from: 587, at: 0.08, length: 0.2, gain: 0.07 }] },
  win: { voices: [{ type: 'triangle', from: 523, at: 0, length: 0.16, gain: 0.09 }, { type: 'triangle', from: 659, at: 0.14, length: 0.16, gain: 0.09 }, { type: 'triangle', from: 784, at: 0.28, length: 0.16, gain: 0.09 }, { type: 'triangle', from: 1046, at: 0.42, length: 0.5, gain: 0.1 }] },
  lose: { voices: [{ type: 'triangle', from: 392, at: 0, length: 0.22, gain: 0.08 }, { type: 'triangle', from: 330, at: 0.2, length: 0.22, gain: 0.08 }, { type: 'triangle', from: 262, at: 0.4, length: 0.5, gain: 0.09 }] },
  dice: { bursts: [0, 0.07, 0.14, 0.23, 0.34].map((at) => ({ at, length: 0.05, from: 1400 + at * 2000, gain: 0.06, q: 4 })) },
}

let noise: AudioBuffer | null = null

/** Un segundo de ruido blanco (para golpes y roces): se arma una vez. */
function noiseBuffer(audio: AudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== audio.sampleRate) {
    noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
    const data = noise.getChannelData(0)

    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1
    }
  }

  return noise
}

/** Suena un efecto. Sin audio desbloqueado o con los sonidos apagados, nada. */
export function playSfx(kind: Sfx): void {
  const audio = audioContext()

  if (!audio || !soundsOn()) {
    return
  }

  const start = audio.currentTime + 0.01
  const recipe = RECIPES[kind]

  for (const voice of recipe.voices ?? []) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    const from = start + voice.at

    oscillator.type = voice.type
    oscillator.frequency.setValueAtTime(voice.from, from)

    if (voice.to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(voice.to, from + voice.length)
    }

    gain.gain.setValueAtTime(0.0001, from)
    gain.gain.exponentialRampToValueAtTime(voice.gain, from + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, from + voice.length)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(from)
    oscillator.stop(from + voice.length + 0.03)
  }

  for (const burst of recipe.bursts ?? []) {
    const source = audio.createBufferSource()
    const filter = audio.createBiquadFilter()
    const gain = audio.createGain()
    const from = start + burst.at

    source.buffer = noiseBuffer(audio)
    filter.type = 'bandpass'
    filter.Q.value = burst.q ?? 0.8
    filter.frequency.setValueAtTime(burst.from, from)

    if (burst.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(burst.to, from + burst.length)
    }

    gain.gain.setValueAtTime(0.0001, from)
    gain.gain.exponentialRampToValueAtTime(burst.gain, from + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, from + burst.length)
    source.connect(filter).connect(gain).connect(audio.destination)
    source.start(from, 0, burst.length + 0.03)
  }
}
