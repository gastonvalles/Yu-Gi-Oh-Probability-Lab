// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { applyLocale, detectLocale, formatMessage, getLocale, LOCALE_STORAGE_KEY, setLocale, syncSiteMeta, t } from '../i18n'
import { areas as enAreas, en } from '../i18n/en'
import { areas as esAreas, es } from '../i18n/es'
import { renderRich } from '../i18n/rich'

type Message = string | { one: string; other: string }

const forms = (message: Message): string[] => (typeof message === 'string' ? [message] : [message.one, message.other])
const tokens = (message: Message, pattern: RegExp): string[] => [...new Set(forms(message).flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1]!)))].sort()

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  applyLocale('es')
  vi.restoreAllMocks()
})

describe('los diccionarios', () => {
  const keys = Object.keys(es)

  it('el inglés traduce exactamente las claves del español, cada una con la misma forma (texto o plural)', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort())

    for (const key of keys) {
      expect(typeof en[key as keyof typeof en], key).toBe(typeof es[key as keyof typeof es])
    }
  })

  it('cada clave vive en el archivo de su área y ninguna se repite entre áreas', () => {
    for (const areas of [esAreas, enAreas]) {
      for (const [area, messages] of Object.entries(areas)) {
        for (const key of Object.keys(messages)) {
          expect(key.startsWith(`${area}.`), key).toBe(true)
        }
      }
    }

    const all = Object.values(esAreas).flatMap((messages) => Object.keys(messages))
    expect(new Set(all).size).toBe(all.length)
  })

  it('ningún texto está vacío y los dos idiomas usan los mismos {parámetros} y las mismas <etiquetas>', () => {
    for (const key of keys) {
      const spanish = es[key as keyof typeof es] as Message
      const english = en[key as keyof typeof en] as Message

      for (const text of [...forms(spanish), ...forms(english)]) {
        expect(text.trim(), key).not.toBe('')
      }

      expect(tokens(english, /\{(\w+)\}/g), `${key}: parámetros`).toEqual(tokens(spanish, /\{(\w+)\}/g))
      expect(tokens(english, /<(\w+)>/g), `${key}: etiquetas`).toEqual(tokens(spanish, /<(\w+)>/g))
    }
  })
})

describe('t()', () => {
  it('traduce al idioma actual y lo cambia con applyLocale (y el lang de la página)', () => {
    expect(t('common.cancel')).toBe('Cancelar')

    applyLocale('en')

    expect(getLocale()).toBe('en')
    expect(t('common.cancel')).toBe('Cancel')
    expect(document.documentElement.lang).toBe('en')
  })

  it('reemplaza los {parámetros} y deja a la vista el que falta', () => {
    expect(formatMessage('{name} tiene {count} cartas', { name: 'Gatos', count: 40 }, 'es')).toBe('Gatos tiene 40 cartas')
    expect(formatMessage('Hola {name}', {}, 'es')).toBe('Hola {name}')
    expect(formatMessage('Sin parámetros {x}', undefined, 'es')).toBe('Sin parámetros {x}')
  })

  it('elige el plural según el idioma: uno es singular; cero y el resto, plural', () => {
    const cards = { one: '{count} card', other: '{count} cards' }

    expect(formatMessage(cards, { count: 1 }, 'en')).toBe('1 card')
    expect(formatMessage(cards, { count: 0 }, 'en')).toBe('0 cards')
    expect(formatMessage(cards, { count: 3 }, 'en')).toBe('3 cards')
    expect(formatMessage({ one: '{count} carta', other: '{count} cartas' }, { count: 1 }, 'es')).toBe('1 carta')
    expect(formatMessage({ one: '{count} carta', other: '{count} cartas' }, { count: 2 }, 'es')).toBe('2 cartas')
  })

  it('renderRich resalta lo que va entre etiquetas y deja como texto la etiqueta que no conoce', () => {
    render(<p>{renderRich('Elegí <b>Main</b> o <i>Extra</i>.', { b: (text) => <strong>{text}</strong> })}</p>)

    expect(screen.getByText('Main').tagName).toBe('STRONG')
    expect(screen.getByText(/Elegí/).textContent).toBe('Elegí Main o Extra.')
  })
})

describe('el idioma de la persona', () => {
  const languages = (list: string[]) => vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(list)

  it('lo que eligió manda; si no, el primer idioma del navegador que la app tenga; si ninguno, inglés', () => {
    languages(['pt-BR', 'es-AR', 'en-US'])
    expect(detectLocale()).toBe('es')

    languages(['fr-FR', 'en-GB', 'es-ES'])
    expect(detectLocale()).toBe('en')

    languages(['fr-FR', 'pt-BR'])
    expect(detectLocale()).toBe('en')

    localStorage.setItem(LOCALE_STORAGE_KEY, 'es')
    expect(detectLocale()).toBe('es')

    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon')
    expect(detectLocale()).toBe('en')
  })

  it('el selector marca el idioma actual y elegir el otro lo guarda y recarga', () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })

    render(<LanguageSwitcher />)

    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false')

    screen.getByRole('button', { name: 'English' }).click()

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(reload).toHaveBeenCalledTimes(1)

    // El idioma que ya está puesto no recarga.
    setLocale('es')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('syncSiteMeta pasa a la página los textos que index.html trae en español', () => {
    document.head.innerHTML = [
      '<meta name="description" content="x">',
      '<meta property="og:description" content="x">',
      '<meta property="og:image:alt" content="x">',
      '<meta property="og:locale" content="es_AR">',
    ].join('')
    applyLocale('en')
    syncSiteMeta()

    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(t('common.siteDescription'))
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/^Deck builder and exact/)
    expect(document.querySelector('meta[property="og:locale"]')?.getAttribute('content')).toBe('en_US')
  })
})
