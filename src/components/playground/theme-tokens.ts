export interface ThemeToken {
  name: string
  /** El valor ya resuelto (con las `var()` reemplazadas), como lo ve el navegador. */
  value: string
}

/**
 * Las variables CSS que las hojas de estilo declaran en `:root` (el tema de Tailwind y el de la app). Se leen de las hojas, no de una lista
 * anotada a mano: el catálogo nunca queda atrás de index.css, y una variable nueva aparece sola.
 */
export function readThemeTokens(): ThemeToken[] {
  const names = new Set<string>()

  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (/(^|,)\s*:root\b/.test(rule.selectorText)) {
          for (const name of Array.from(rule.style)) {
            if (name.startsWith('--') && !name.startsWith('--tw-')) names.add(name)
          }
        }
      } else if ('cssRules' in rule) {
        // @layer, @media, @supports…: Tailwind guarda el tema y la base adentro de capas.
        visit((rule as CSSGroupingRule).cssRules)
      }
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules)
    } catch {
      // Una hoja de otro origen no se puede leer: no es nuestra.
    }
  }

  const computed = getComputedStyle(document.documentElement)

  return [...names].sort().map((name) => ({ name, value: computed.getPropertyValue(name).trim() }))
}

/** ¿El valor es un color? Lo dice el propio navegador: se lo asigna a un elemento y mira si lo aceptó. */
function isColorValue(value: string): boolean {
  if (!value) return false

  const probe = document.createElement('span')
  probe.style.color = value

  return probe.style.color !== ''
}

export type TokenKind = 'color' | 'radius' | 'shadow' | 'font-size' | 'font-family' | 'animation' | 'size' | 'other'

/** Qué tipo de variable es, por su nombre (la convención de Tailwind: `--radius-*`, `--shadow-*`…) y, si no, por su valor. */
export function tokenKind(token: ThemeToken): TokenKind {
  const { name, value } = token

  if (/^--radius/.test(name)) return 'radius'
  if (/^--shadow/.test(name)) return 'shadow'
  if (/^--text-[a-z]+$/.test(name)) return 'font-size'
  if (/^--font-/.test(name)) return 'font-family'
  if (/^--animate-/.test(name)) return 'animation'
  if (/^--(spacing|container|deck|zone-.*-border)/.test(name) && !isColorValue(value)) return 'size'
  if (isColorValue(value)) return 'color'

  return 'other'
}
