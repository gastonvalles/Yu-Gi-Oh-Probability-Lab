import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  PARTICIPANT_ID_PATTERN,
  RATE_PER_SECOND,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  RateLimiter,
  byteLength,
  createParticipantId,
  createRoomCode,
  encodeRelayFrame,
  originAllowed,
  parseRelayFrame,
  type RelayFrame,
} from '../app/duel-relay-rules'

describe('los códigos de sala', () => {
  it('son de ocho letras sin caracteres que se confunden, y no se repiten', () => {
    const codes = Array.from({ length: 500 }, createRoomCode)

    expect(codes.every((code) => ROOM_CODE_PATTERN.test(code))).toBe(true)
    expect(new Set(codes).size).toBe(codes.length)
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/)
  })

  it('reparten parejo: ninguna letra sale mucho más que otra', () => {
    const counts = new Map<string, number>()

    for (let index = 0; index < 4000; index += 1) {
      for (const letter of createRoomCode()) {
        counts.set(letter, (counts.get(letter) ?? 0) + 1)
      }
    }

    const values = [...counts.values()]
    expect(counts.size).toBe(ROOM_CODE_ALPHABET.length)
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.25)
  })

  it('el patrón rechaza lo que no es un código', () => {
    for (const bad of ['', 'abcd2345', 'ABCD234', 'ABCD23456', 'ABCD234O', 'ABCD 345', 'ABCD234\n', '../ABCD23']) {
      expect(ROOM_CODE_PATTERN.test(bad), bad).toBe(false)
    }
  })

  it('cada conexión tiene una identidad válida', () => {
    expect(Array.from({ length: 50 }, createParticipantId).every((id) => PARTICIPANT_ID_PATTERN.test(id))).toBe(true)
    expect(PARTICIPANT_ID_PATTERN.test('corto')).toBe(false)
    expect(PARTICIPANT_ID_PATTERN.test('a'.repeat(33))).toBe(false)
    expect(PARTICIPANT_ID_PATTERN.test('con espacio 123')).toBe(false)
  })
})

describe('los orígenes permitidos', () => {
  const allowed = 'https://lab.example.app, https://lab-*.example.app,http://localhost:5173'

  it('deja pasar los de la lista, con o sin mayúsculas, y los despliegues de prueba', () => {
    for (const origin of ['https://lab.example.app', 'HTTPS://LAB.EXAMPLE.APP', 'https://lab-git-rama-1.example.app', 'http://localhost:5173']) {
      expect(originAllowed(origin, allowed), origin).toBe(true)
    }
  })

  it('rechaza el resto: sin origen, imitaciones y comodines que se pasan de largo', () => {
    const rejected = [
      null,
      '',
      'https://evil.com',
      'https://lab.example.app.evil.com',
      'https://evil.com/https://lab.example.app',
      'https://lab-x.evil.com',
      'https://lab-a.b.example.app',
      'https://lab-/x.example.app',
      'http://lab.example.app',
      'http://localhost:5174',
    ]

    for (const origin of rejected) {
      expect(originAllowed(origin, allowed), String(origin)).toBe(false)
    }

    expect(originAllowed('https://lab.example.app', '')).toBe(false)
  })

  it('la lista real del relay deja pasar el sitio y las previews de este equipo, y no las de otra cuenta que empiece igual', () => {
    const config = readFileSync(new URL('../../duel-relay/wrangler.jsonc', import.meta.url), 'utf8')
    const real = /"ALLOWED_ORIGINS":\s*"([^"]+)"/.exec(config)?.[1] ?? ''

    for (const origin of [
      'https://yu-gi-oh-probability-lab.vercel.app',
      'https://yu-gi-oh-probability-lab-9cibimjxoosunkmn5v13nr4hpkyn-gastonvalles-projects.vercel.app',
      'https://yu-gi-oh-probability-lab-git-hardening-relay-gastonvalles-projects.vercel.app',
      'http://localhost:5173',
    ]) {
      expect(originAllowed(origin, real), origin).toBe(true)
    }

    for (const origin of [
      'https://yu-gi-oh-probability-lab-abc123-otra-cuenta.vercel.app',
      'https://yu-gi-oh-probability-lab-evil.vercel.app',
      'https://yu-gi-oh-probability-lab-abc123-gastonvalles-projects.evil.com',
      'https://yu-gi-oh-probability-lab-gastonvalles-projects.vercel.app.evil.com',
    ]) {
      expect(originAllowed(origin, real), origin).toBe(false)
    }
  })
})

describe('los avisos del relay', () => {
  it.each<RelayFrame>([{ kind: 'peer', present: true }, { kind: 'peer', present: false }, { kind: 'full' }])('%j va y vuelve', (frame) => {
    expect(parseRelayFrame(encodeRelayFrame(frame).buffer as ArrayBuffer)).toEqual(frame)
  })

  it('lo que no es un aviso se descarta', () => {
    for (const bytes of [[], [0], [1], [1, 2], [2, 0], [3], [1, 1, 1]]) {
      expect(parseRelayFrame(Uint8Array.from(bytes).buffer as ArrayBuffer), bytes.join(',')).toBeNull()
    }
  })
})

describe('el límite de ritmo', () => {
  it('aguanta una ráfaga del doble, corta y se recupera con el tiempo', () => {
    const limiter = new RateLimiter(0)
    const burst = Array.from({ length: RATE_PER_SECOND * 2 + 5 }, () => limiter.allow(0))

    expect(burst.filter(Boolean)).toHaveLength(RATE_PER_SECOND * 2)
    expect(limiter.allow(0)).toBe(false)

    // Pasa un segundo: vuelven a entrar tantos como el ritmo permite.
    const later = Array.from({ length: RATE_PER_SECOND + 5 }, () => limiter.allow(1000))
    expect(later.filter(Boolean)).toHaveLength(RATE_PER_SECOND)
  })

  it('un reloj que retrocede no regala fichas', () => {
    const limiter = new RateLimiter(10_000)

    for (let index = 0; index < RATE_PER_SECOND * 2; index += 1) {
      limiter.allow(10_000)
    }

    expect(limiter.allow(5000)).toBe(false)
  })

  it('el tamaño se mide en bytes, no en letras', () => {
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('añ')).toBe(3)
    expect(byteLength('🙂')).toBe(4)
  })
})
