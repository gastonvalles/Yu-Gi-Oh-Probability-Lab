import { applyLocale } from '.'

// Los tests comparan texto en español: el idioma del navegador de jsdom (en-US) no tiene que cambiarlos.
applyLocale('es')
