import { applyLocale, loadLocale } from '.'

// El inglés es un archivo aparte en la app; las pruebas (síncronas, y varias cambian de idioma) lo encuentran ya cargado.
await loadLocale('en')

// Los tests comparan texto en español: el idioma del navegador de jsdom (en-US) no tiene que cambiarlos.
applyLocale('es')
