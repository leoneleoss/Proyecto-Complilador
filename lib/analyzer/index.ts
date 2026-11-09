// Punto de entrada que orquesta las tres fases del analizador.
// Ejecuta léxico -> sintáctico -> semántico y agrega todos los resultados.

import { tokenize } from "./lexer"
import { parse } from "./parser"
import { analyzeSemantics } from "./semantic"
import { generateJavaScript } from "./codegen"
import type { AnalysisResult, TranslationResult } from "./types"

export function analyze(source: string): AnalysisResult {
  const { tokens, errors: lexicalErrors } = tokenize(source)
  const { ast, errors: syntaxErrors } = parse(tokens)
  // Solo corremos la fase semántica si no hubo errores léxicos graves,
  // pero el AST siempre se genera con recuperación de errores.
  const semanticDiagnostics = analyzeSemantics(ast)
  const blockingErrors = [...lexicalErrors, ...syntaxErrors, ...semanticDiagnostics].filter(
    (diagnostic) => diagnostic.severity === "error",
  )
  const translation: TranslationResult =
    ast && blockingErrors.length === 0
      ? generateJavaScript(ast)
      : { status: "bloqueado", code: null, errors: [], needsMath: false }

  return {
    tokens,
    ast,
    lexicalErrors,
    syntaxErrors,
    semanticDiagnostics,
    translation,
  }
}

export * from "./types"
export { KEYWORDS, BUILTINS } from "./lexer"
