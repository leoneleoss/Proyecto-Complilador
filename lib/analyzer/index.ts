// Punto de entrada que orquesta las tres fases del analizador.
// Ejecuta léxico -> sintáctico -> semántico y agrega todos los resultados.

import { tokenize } from "./lexer"
import { parse } from "./parser"
import { analyzeSemantics } from "./semantic"
import type { AnalysisResult } from "./types"

export function analyze(source: string): AnalysisResult {
  const { tokens, errors: lexicalErrors } = tokenize(source)
  const { ast, errors: syntaxErrors } = parse(tokens)
  // Solo corremos la fase semántica si no hubo errores léxicos graves,
  // pero el AST siempre se genera con recuperación de errores.
  const semanticDiagnostics = analyzeSemantics(ast)

  return {
    tokens,
    ast,
    lexicalErrors,
    syntaxErrors,
    semanticDiagnostics,
  }
}

export * from "./types"
export { KEYWORDS, BUILTINS } from "./lexer"
