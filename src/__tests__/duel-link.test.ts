import { describe, expect, it } from 'vitest'

import { buildDuelLink, extractRoomCode, parseDuelHash, parseDuelView } from '../app/duel-link'
import { createRoomCode } from '../app/duel-relay-rules'
import { createMatState } from '../app/practice-mat'
import { whoseTurn } from '../app/duel-turn'

describe('el enlace del duelo', () => {
  it('lleva a la app en el paso del duelo con el código de la sala, y se vuelve a leer igual', () => {
    const room = createRoomCode()
    const link = buildDuelLink('https://ygo.example', '/lab/', room)

    expect(link).toBe(`https://ygo.example/lab/#duel?room=${room}`)
    expect(parseDuelHash(new URL(link).hash)).toBe(room)
    expect(extractRoomCode(link)).toBe(room)
  })

  it('en "Unirme" vale el enlace entero, el código solo, en minúsculas o con espacios y guiones', () => {
    expect(extractRoomCode('K7QF2M9X')).toBe('K7QF2M9X')
    expect(extractRoomCode('  k7qf-2m9x ')).toBe('K7QF2M9X')
    expect(extractRoomCode('https://ygo.example/#duel?room=k7qf2m9x&otro=1')).toBe('K7QF2M9X')
  })

  it('lo que no es un código (otro largo, letras que la sala no usa, vacío) no se acepta', () => {
    for (const text of ['', 'K7QF2M9', 'K7QF2M9XX', 'K7QF2M9O', 'K7QF2M91', 'https://ygo.example/#duel', 'hola mundo']) {
      expect(extractRoomCode(text)).toBeNull()
    }
  })

  it('el hash sólo cuenta si es el del duelo y trae un código válido', () => {
    expect(parseDuelHash('#duel?room=K7QF2M9X')).toBe('K7QF2M9X')
    expect(parseDuelHash('#duel')).toBeNull()
    expect(parseDuelHash('#duel?room=basura')).toBeNull()
    expect(parseDuelHash('#practice?room=K7QF2M9X')).toBeNull()
    expect(parseDuelHash('')).toBeNull()
  })
})

describe('de quién es el turno', () => {
  const main = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
  const at = (turn: number) => ({ ...createMatState(main, [], 5), turn })

  it('empieza el anfitrión, y cada vez que alguien pasa de su End Phase a su Draw Phase le toca al otro', () => {
    expect(whoseTurn(0, at(1), at(1))).toBe('mine')
    expect(whoseTurn(1, at(1), at(1))).toBe('theirs')

    // El anfitrión pasó: es el turno del invitado, y los dos lo ven igual.
    expect(whoseTurn(0, at(2), at(1))).toBe('theirs')
    expect(whoseTurn(1, at(1), at(2))).toBe('mine')

    // El invitado pasó también: vuelve al anfitrión.
    expect(whoseTurn(0, at(2), at(2))).toBe('mine')
    expect(whoseTurn(1, at(2), at(2))).toBe('theirs')
  })

  it('si uno pasa dos veces seguidas, el turno vuelve a ser suyo (es una cuenta, como en la mesa)', () => {
    expect(whoseTurn(0, at(3), at(1))).toBe('mine')
  })

  it('sin la mesa de alguno (todavía no repartió) cuenta como si estuviera en el primer turno', () => {
    expect(whoseTurn(0, null, null)).toBe('mine')
    expect(whoseTurn(1, null, at(2))).toBe('mine')
  })
})

describe('el paso del lobby que pide el menú del celular', () => {
  it('lee #duel?view=create|watch|join y nada más', () => {
    expect(parseDuelView('#duel?view=create')).toBe('create')
    expect(parseDuelView('#duel?view=watch')).toBe('watch')
    expect(parseDuelView('#duel?view=join')).toBe('join')
    expect(parseDuelView('#duel?view=otra')).toBeNull()
    expect(parseDuelView('#duel')).toBeNull()
    expect(parseDuelView('#practice?view=create')).toBeNull()
    expect(parseDuelView('')).toBeNull()
  })
})
