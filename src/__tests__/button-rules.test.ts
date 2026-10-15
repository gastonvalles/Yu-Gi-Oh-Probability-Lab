import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Las reglas de los botones de toda la app (ver "Botones" en docs/design-system.md), revisadas en el código de los componentes:
 *  1. Un grupo de botones tiene una sola acción principal (`primary`): dos juntas compiten y no se sabe cuál es la importante.
 *  2. Lo que descarta o vuelve (Cancelar, Volver, Cerrar, Limpiar), al lado de una principal, es `tertiary` (sin caja).
 *  3. En el pie de un diálogo o de una barra (`footer`), la principal va al final (a la derecha).
 *  4. Ningún botón dice "Sí", "No", "Aceptar", "OK", "Continuar" o "Confirmar" a secas: dice qué hace ("Borrar combo", "Vaciar deck"), en español y en inglés.
 * Se leen los JSX de `src/components` (menos la página de pruebas): cada grupo son los botones que comparten el mismo elemento padre, y los dos lados de un
 * `a ? <Button/> : <Button/>` no cuentan como vecinos porque nunca se ven a la vez. Un pie es la prop `footer`, un `<footer>` o una fila alineada a la derecha (`justify-end`).
 */

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))

/** Los textos de la interfaz en un idioma: clave → valor (sólo las cadenas simples: los botones usan esas). */
function texts(lang: 'es' | 'en'): Record<string, string> {
  const map: Record<string, string> = {}

  for (const file of walk(`src/i18n/${lang}`).filter((entry) => entry.endsWith('.ts'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/^\s*'([^']+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm)) {
      map[match[1]!] = (match[2] ?? match[3] ?? '').replace(/\\'/g, "'")
    }
  }

  return map
}

const ES = texts('es')
const EN = texts('en')

/** El texto de un botón que llega por una prop (los diálogos de confirmación). */
interface PropLabel {
  file: string
  line: number
  key: string
}

interface Found {
  file: string
  line: number
  variant: string
  /** La clave de texto (`t('...')`) del botón, si la tiene. */
  key: string | null
  group: string
  index: number
  /** Está en un pie (la prop `footer` de un diálogo o un elemento `<footer>`): ahí la principal va al final. */
  inFooter: boolean
}

const PROP_LABELS: PropLabel[] = []

function findButtons(): Found[] {
  const found: Found[] = []
  const files = walk('src/components').filter((entry) => entry.endsWith('.tsx') && !entry.includes('playground'))

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let order = 0

    const tagOf = (node: ts.Node) => (ts.isJsxElement(node) ? node.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : null)
    const attrsOf = (node: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes)
    const attrText = (node: ts.JsxElement | ts.JsxSelfClosingElement, name: string): string | null => {
      const attribute = attrsOf(node).properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === name)

      if (!attribute || !ts.isJsxAttribute(attribute)) return null
      if (!attribute.initializer) return 'true'

      return ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : attribute.initializer.getText()
    }
    const keyOf = (node: ts.JsxElement | ts.JsxSelfClosingElement): string | null => {
      if (ts.isJsxSelfClosingElement(node)) return null

      for (const child of node.children) {
        if (ts.isJsxExpression(child) && child.expression) {
          const match = child.expression.getText().match(/^t\(\s*'([^']+)'/)

          if (match) return match[1]!
          // El texto de "cancelar" de un diálogo de confirmación llega por una prop.
          if (child.expression.getText() === 'cancelLabel') return 'common.cancel'
        }
      }

      return null
    }

    const visit = (node: ts.Node, group: string, inFooter = false) => {
      const tag = tagOf(node)

      if ((tag === 'Button' || tag === 'IconButton') && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
        const variant = tag === 'Button' ? (attrText(node, 'variant') ?? "'secondary'") : attrText(node, 'tone')

        if (variant) {
          found.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, variant: variant.replace(/['"{}]/g, '') === 'confirmVariant' ? 'primary' : variant.replace(/['"{}]/g, ''), key: keyOf(node), group, index: order, inFooter })
          order += 1
        }
      }

      if ((tag === 'ConfirmDialog') && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
        for (const name of ['confirmLabel', 'cancelLabel']) {
          const key = attrText(node, name)?.match(/^\{?t\(\s*'([^']+)'/)?.[1]

          if (key) PROP_LABELS.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, key })
        }
      }

      const next = ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node) ? `${file}:${node.getStart()}` : group

      const rightAligned = (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && /\bjustify-end\b/.test(attrText(node, 'className') ?? '')
      const footer = inFooter || tag === 'footer' || rightAligned || (ts.isJsxAttribute(node) && node.name.getText() === 'footer')

      if (ts.isConditionalExpression(node)) {
        visit(node.condition, group, footer)
        visit(node.whenTrue, `${group}?t${node.getStart()}`, footer)
        visit(node.whenFalse, `${group}?f${node.getStart()}`, footer)
        return
      }

      ts.forEachChild(node, (child) => visit(child, next, footer))
    }

    visit(sf, file)
  }

  return found
}

const BUTTONS = findButtons()
const GROUPS = new Map<string, Found[]>()

for (const button of BUTTONS) GROUPS.set(button.group, [...(GROUPS.get(button.group) ?? []), button])

const where = (button: Found) => `${button.file}:${button.line}`
const isPrimary = (button: Found) => button.variant === 'primary'

/** Lo que descarta o vuelve: al lado de una principal va sin caja. */
const DISMISSING = new Set(['common.cancel', 'common.close', 'common.back'])
const DISMISSING_TEXT = new Set(['Cancelar', 'Volver', 'Cerrar', 'Limpiar', 'Omitir'])

/** Lo que un botón no puede decir solo (en español y en inglés). */
const VAGUE = new Set(['sí', 'no', 'aceptar', 'ok', 'continuar', 'confirmar', 'yes', 'accept', 'continue', 'confirm'])

describe('las reglas de los botones de la app', () => {
  it('encuentra los botones (si no, el resto no revisa nada)', () => {
    expect(BUTTONS.length).toBeGreaterThan(100)
    expect(PROP_LABELS.length).toBeGreaterThan(10)
    expect(BUTTONS.some((button) => isPrimary(button))).toBe(true)
  })

  it('un grupo de botones tiene una sola acción principal', () => {
    const crowded = [...GROUPS.values()].filter((group) => group.filter(isPrimary).length > 1).map((group) => group.map(where).join(' + '))

    expect(crowded).toEqual([])
  })

  it('lo que descarta o vuelve, al lado de una principal, es `tertiary`', () => {
    const wrong: string[] = []

    for (const group of GROUPS.values()) {
      if (!group.some(isPrimary)) continue

      for (const button of group) {
        const text = button.key ? ES[button.key] : undefined

        if (!isPrimary(button) && button.variant !== 'tertiary' && ((button.key && DISMISSING.has(button.key)) || (text && DISMISSING_TEXT.has(text)))) {
          wrong.push(`${where(button)} (${button.variant}): ${text}`)
        }
      }
    }

    expect(wrong).toEqual([])
  })

  it('en el pie de un diálogo o de una barra, la principal va al final', () => {
    const wrong = [...GROUPS.values()]
      .filter((group) => group.length >= 2 && group.some(isPrimary) && group.every((button) => button.inFooter))
      .filter((group) => !isPrimary(group.at(-1)!))
      .map((group) => group.map(where).join(' → '))

    expect(wrong).toEqual([])
  })

  it('ningún botón dice "Sí", "No", "Aceptar", "OK", "Continuar" o "Confirmar" a secas (ni "Sí, …"): dice qué hace', () => {
    const vague: string[] = []

    for (const button of [...BUTTONS, ...PROP_LABELS.map((label) => ({ ...label, key: label.key }))]) {
      if (!button.key) continue

      for (const [lang, map] of [['es', ES], ['en', EN]] as const) {
        const text = map[button.key]

        if (text !== undefined && (VAGUE.has(text.trim().toLowerCase()) || /^(sí|yes|no),\s/i.test(text))) {
          vague.push(`${button.file}:${button.line} [${lang}] ${text}`)
        }
      }
    }

    expect(vague).toEqual([])
  })
})
