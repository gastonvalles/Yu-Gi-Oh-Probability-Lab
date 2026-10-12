import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Ningún texto en español queda escrito en el código: todo lo que se ve pasa por `t()` (src/i18n).
 * Es una heurística (acentos y palabras muy españolas) que atrapa lo olvidado; no puede ver un "Pasos" suelto.
 * Un texto español que tiene que quedar (datos de migración, alias de búsqueda) se marca con `// i18n-ignore: motivo`
 * en su línea o en la de arriba. `I18N_SCAN=src/app/card-search.ts,src/components/search npx vitest --run src/__tests__/i18n-literals.test.ts`
 * revisa sólo esas rutas.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SKIPPED_DIRS = new Set(['__tests__', 'i18n', 'data', 'assets', 'fonts'])
const ACCENTED = /[áéíóúñüÁÉÍÓÚÑ¿¡]/
const SPANISH_WORD =
  /\b(?:para|con|sin|del|los|las|una|uno|unos|unas|tus?|su|sus|mis?|más|que|qué|por|ya|hay|desde|hasta|entre|sobre|cada|todas?|todos?|también|porque|cuando|donde|está|esta|este|esto|ese|esa|como|pero|muy|mejor|de|la|el|un|se|lo|al|nombre|nuevos?|nuevas?|sólo|mano|manos|cartas?|copias?|reglas?|mazo|campo|cementerio|ataque|defensa|invocar|zonas?|monstruos?|hechizos?|trampas?|fichas?|contadores?|pasos?|jugadas?|jugables?|turno|segundo|primero|yendo|robar|barajar|listo|pendiente|guardar|guardado|borrar|eliminar|cancelar|cerrar|abrir|agregar|quitar|sacar|elegir|buscar|exportar|importar|descargar|copiar|pegar|volver|siguiente|anterior)\b/i

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) sourceFiles(path, found)
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      found.push(path)
    }
  }

  return found
}

function spanishLiterals(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const path = relative(ROOT, file).split(sep).join('/')
  const hits: string[] = []

  const flag = (node: ts.Node, value: string) => {
    if (!ACCENTED.test(value) && !SPANISH_WORD.test(value)) return

    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    if (/i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '')) return

    hits.push(`${path}:${line + 1}  ${JSON.stringify(value.replace(/\s+/g, ' ').trim().slice(0, 90))}`)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportTypeNode(node)) return
    // Lo que va a la consola es para quien programa, no para quien usa la app.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'console') return
    if (ts.isJsxAttribute(node) && /^(className|class|data-.*)$/.test(node.name.getText(source))) return

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent
      const isKey = (ts.isPropertyAssignment(parent) && parent.name === node) || (ts.isElementAccessExpression(parent) && parent.argumentExpression === node)

      if (!isKey) flag(node, node.text)
    } else if (ts.isTemplateExpression(node)) {
      flag(node.head, node.head.text)
      for (const span of node.templateSpans) flag(span.literal, span.literal.text)
    } else if (ts.isJsxText(node)) {
      const value = node.text.trim()
      if (value) flag(node, value)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return hits
}

describe('los workers', () => {
  it('reciben el idioma como nombre: no ven el almacenamiento y, sin eso, armarían sus textos en español', () => {
    for (const file of sourceFiles(join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8')

      if (/new Worker\(/.test(text)) {
        expect(text, relative(ROOT, file)).toContain('name: getLocale()')
      }
    }
  })
})

describe('el código no tiene texto en español escrito a mano', () => {
  it('todo lo que ve la persona sale de src/i18n', () => {
    const only = (process.env.I18N_SCAN ?? '').split(',').map((prefix) => prefix.trim()).filter(Boolean)
    const files = sourceFiles(join(ROOT, 'src')).filter((file) => {
      const path = relative(ROOT, file).split(sep).join('/')
      return only.length === 0 || only.some((prefix) => path.startsWith(prefix))
    })

    expect(files.length).toBeGreaterThan(0)
    expect(files.flatMap(spanishLiterals)).toEqual([])
    // Recorre y parsea todo src: con el resto de los tests en paralelo se pasa de los 5 s de siempre.
  }, 60_000)
})
