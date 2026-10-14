// Las tablas de Genesys y Edison pesan ~340 KB. Este es el único módulo que las importa: format-data.ts lo pide con `import()` y el build las deja en un archivo aparte,
// fuera de lo que el navegador baja para pintar la primera pantalla. Nadie más puede importar estos dos archivos de datos (volverían al archivo principal).
export { default as genesysCardData } from '../data/genesys-card-data.json'
export {
  EDISON_CARD_POOL_IDS,
  EDISON_FORBIDDEN_IDS,
  EDISON_LIMITED_IDS,
  EDISON_SEMI_LIMITED_IDS,
} from '../data/edison-format-data'
