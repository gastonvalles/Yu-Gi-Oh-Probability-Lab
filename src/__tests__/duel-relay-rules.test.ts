import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  LIVE_DUEL_MAX_MS,
  LIVE_DUEL_TTL_MS,
  LIVE_HEARTBEAT_MS,
  MAX_PUBLIC_ROOMS,
  PARTICIPANT_ID_PATTERN,
  PUBLIC_ROOM_TTL_MS,
  RATE_PER_SECOND,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  RateLimiter,
  RoomRegistry,
  byteLength,
  parsePublicRoomInfo,
  parseWatchers,
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

describe('las salas públicas', () => {
  const info = { host: 'Ana', match: true, siding: true, format: 'tcg', limitMin: 40 }
  const token = 'abcdefghijklmnop'
  const other = 'ponmlkjihgfedcba'

  it('lo que manda un anfitrión se revisa: nombre limpio, formato y reloj de los que se ofrecen, y el siding sólo en un Match', () => {
    expect(parsePublicRoomInfo(info)).toEqual(info)
    expect(parsePublicRoomInfo({ ...info, host: '  Ana \n  Pérez\u0000 ' })).toMatchObject({ host: 'Ana Pérez' })
    expect(parsePublicRoomInfo({ ...info, host: 'x'.repeat(100) })?.host).toHaveLength(40)
    expect(parsePublicRoomInfo({ ...info, match: false })).toMatchObject({ siding: false })

    for (const bad of [null, [], 'x', { ...info, host: '' }, { ...info, host: '   ' }, { ...info, host: 3 }, { ...info, format: 'otro' }, { ...info, limitMin: 41 }, { ...info, match: 'si' }, { ...info, siding: undefined }]) {
      expect(parsePublicRoomInfo(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('anota salas, las lista de la más nueva a la más vieja (sin el token) y las baja con su token', () => {
    const registry = new RoomRegistry()

    expect(registry.register('AAAAAAA2', info, token, 1000)).toBe('ok')
    expect(registry.register('BBBBBBB2', { ...info, host: 'Beto' }, other, 2000)).toBe('ok')
    expect(registry.list(3000).map((room) => room.code)).toEqual(['BBBBBBB2', 'AAAAAAA2'])
    expect(JSON.stringify(registry.list(3000))).not.toContain(token)

    expect(registry.remove('AAAAAAA2', other, 3000)).toBe(false)
    expect(registry.remove('AAAAAAA2', token, 3000)).toBe(true)
    expect(registry.list(3000).map((room) => room.code)).toEqual(['BBBBBBB2'])
  })

  it('vencen a los 30 minutos y renovar con el mismo token no las estira; con otro token no se pisa la de otro', () => {
    const registry = new RoomRegistry()

    registry.register('AAAAAAA2', info, token, 0)
    expect(registry.register('AAAAAAA2', { ...info, host: 'Ana R' }, other, 1000)).toBe('taken')
    expect(registry.register('AAAAAAA2', { ...info, host: 'Ana R' }, token, 60_000)).toBe('ok')
    expect(registry.list(60_000)[0]).toMatchObject({ host: 'Ana R', createdAt: 0 })

    expect(registry.list(PUBLIC_ROOM_TTL_MS - 1)).toHaveLength(1)
    expect(registry.list(PUBLIC_ROOM_TTL_MS)).toHaveLength(0)
    // Vencida, el código queda libre para otro.
    expect(registry.register('AAAAAAA2', info, other, PUBLIC_ROOM_TTL_MS)).toBe('ok')
  })

  it('la lista tiene tope y se recupera de lo guardado', () => {
    const registry = new RoomRegistry()

    for (let index = 0; index < MAX_PUBLIC_ROOMS; index += 1) {
      expect(registry.register(`CODE${String(index).padStart(4, 'A')}`, info, token, index)).toBe('ok')
    }

    expect(registry.register('ZZZZZZZ2', info, token, 500)).toBe('full')
    expect(registry.register('CODEAAA5', info, token, 500)).toBe('ok')

    const restored = new RoomRegistry(JSON.parse(JSON.stringify(registry)) as ConstructorParameters<typeof RoomRegistry>[0])
    expect(restored.list(500)).toHaveLength(MAX_PUBLIC_ROOMS)
  })
})

describe('los duelos públicos en vivo', () => {
  const info = { host: 'Ana', match: false, siding: false, format: 'tcg', limitMin: 40 }
  const token = 'abcdefghijklmnop'
  const other = 'ponmlkjihgfedcba'

  it('cuántos miran: un entero de 0 hasta el tope de espectadores, y nada más', () => {
    expect([0, 1, 2].map(parseWatchers)).toEqual([0, 1, 2])

    for (const bad of [-1, 3, 1.5, '1', null, undefined, NaN]) {
      expect(parseWatchers(bad), String(bad)).toBeNull()
    }
  })

  it('al llegar el rival la sala pasa de las que esperan a las que se juegan, sin el token ni el nombre de nadie más', () => {
    const registry = new RoomRegistry()

    registry.register('AAAAAAA2', info, token, 1000)
    expect(registry.list(2000)).toHaveLength(1)
    expect(registry.listLive(2000)).toEqual([])

    expect(registry.markLive('AAAAAAA2', info, 1, token, 5000)).toBe('ok')
    // Ya no está entre las que esperan (un cliente de antes la tomaría por una sala a la que entrar).
    expect(registry.list(5000)).toEqual([])
    expect(registry.listLive(5000)).toEqual([{ ...info, code: 'AAAAAAA2', watchers: 1, since: 5000 }])
    expect(JSON.stringify(registry.listLive(5000))).not.toContain(token)
  })

  it('con otro token no se pisa la sala de otro; sin sala anotada (venció) se crea; con la lista llena no entra', () => {
    const registry = new RoomRegistry()

    registry.register('AAAAAAA2', info, token, 0)
    expect(registry.markLive('AAAAAAA2', info, 0, other, 10)).toBe('taken')
    expect(registry.markLive('BBBBBBB2', info, 0, other, 10)).toBe('ok')
    expect(registry.listLive(10).map((duel) => duel.code)).toEqual(['BBBBBBB2'])

    const full = new RoomRegistry()

    for (let index = 0; index < MAX_PUBLIC_ROOMS; index += 1) {
      full.register(`CODE${String(index).padStart(4, 'A')}`, info, token, index)
    }

    expect(full.markLive('ZZZZZZZ2', info, 0, other, 500)).toBe('full')
  })

  it('sigue en vivo mientras su anfitrión avisa (desde cuándo no cambia) y vence a los 3 minutos sin avisos o a las 4 horas', () => {
    const registry = new RoomRegistry()

    registry.markLive('AAAAAAA2', info, 0, token, 0)
    expect(registry.markLive('AAAAAAA2', info, 2, token, 60_000)).toBe('ok')
    expect(registry.listLive(60_000)[0]).toMatchObject({ watchers: 2, since: 0 })

    expect(registry.listLive(60_000 + LIVE_DUEL_TTL_MS - 1)).toHaveLength(1)
    expect(registry.listLive(60_000 + LIVE_DUEL_TTL_MS)).toHaveLength(0)

    // Aunque siga avisando, no figura para siempre.
    const long = new RoomRegistry()

    long.markLive('AAAAAAA2', info, 0, token, 0)
    for (let at = LIVE_HEARTBEAT_MS; at < LIVE_DUEL_MAX_MS; at += LIVE_HEARTBEAT_MS) long.markLive('AAAAAAA2', info, 0, token, at)
    expect(long.listLive(LIVE_DUEL_MAX_MS - 1)).toHaveLength(1)
    expect(long.listLive(LIVE_DUEL_MAX_MS)).toHaveLength(0)
  })

  it('si el rival se va, la sala vuelve a esperar (con sus 30 minutos desde ahí); y salir la baja de las dos listas', () => {
    const registry = new RoomRegistry()

    registry.register('AAAAAAA2', info, token, 0)
    registry.markLive('AAAAAAA2', info, 0, token, 40 * 60_000)
    expect(registry.register('AAAAAAA2', info, token, 41 * 60_000)).toBe('ok')
    expect(registry.listLive(41 * 60_000)).toEqual([])
    expect(registry.list(41 * 60_000)).toEqual([{ ...info, code: 'AAAAAAA2', createdAt: 41 * 60_000 }])

    registry.markLive('AAAAAAA2', info, 0, token, 42 * 60_000)
    expect(registry.remove('AAAAAAA2', other, 42 * 60_000)).toBe(false)
    expect(registry.remove('AAAAAAA2', token, 42 * 60_000)).toBe(true)
    expect(registry.listLive(42 * 60_000)).toEqual([])
  })

  it('lo guardado se recupera con los duelos en vivo, y lo guardado de antes (sin `live`) sigue valiendo como salas que esperan', () => {
    const registry = new RoomRegistry()

    registry.register('AAAAAAA2', info, token, 0)
    registry.markLive('BBBBBBB2', info, 1, other, 0)

    const restored = new RoomRegistry(JSON.parse(JSON.stringify(registry)) as ConstructorParameters<typeof RoomRegistry>[0])

    expect(restored.list(10).map((room) => room.code)).toEqual(['AAAAAAA2'])
    expect(restored.listLive(10).map((duel) => duel.code)).toEqual(['BBBBBBB2'])

    const old = new RoomRegistry([{ room: { ...info, code: 'CCCCCCC2', createdAt: 0 }, token }])

    expect(old.list(10)).toHaveLength(1)
    expect(old.listLive(10)).toEqual([])
  })
})
