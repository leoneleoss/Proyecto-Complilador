// Tipos compartidos por las tres fases del analizador (léxico, sintáctico y semántico).

// Categorías de token que reconoce el analizador léxico.
export type TokenType =
  | "PALABRA_RESERVADA"
  | "IDENTIFICADOR"
  | "ENTERO"
  | "FLOTANTE"
  | "CADENA"
  | "OPERADOR"
  | "DELIMITADOR"
  | "NUEVA_LINEA"
  | "INDENT"
  | "DEDENT"
  | "FIN"
  | "ERROR"

// Un token es la unidad mínima con significado que produce el lexer.
export interface Token {
  type: TokenType
  // Lexema: el texto original tal cual aparece en el código fuente.
  value: string
  // Posición (base 1) para poder reportar errores de forma legible.
  line: number
  column: number
}

// Representa un problema encontrado en cualquiera de las fases.
export interface Diagnostic {
  // Fase que originó el diagnóstico.
  phase: "lexico" | "sintactico" | "semantico"
  // "error" detiene la corrección; "advertencia" es informativo.
  severity: "error" | "advertencia"
  message: string
  line: number
  column: number
}

// Nodo genérico del árbol de sintaxis abstracta (AST).
export interface ASTNode {
  type: string
  // Etiqueta legible que se muestra en la vista de árbol.
  label: string
  line: number
  column: number
  children: ASTNode[]
}

// Resultado agregado de correr el pipeline completo.
export interface AnalysisResult {
  tokens: Token[]
  ast: ASTNode | null
  lexicalErrors: Diagnostic[]
  syntaxErrors: Diagnostic[]
  semanticDiagnostics: Diagnostic[]
}
