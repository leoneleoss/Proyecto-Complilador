// Fase 1: Analizador léxico (tokenizador) para un subconjunto de Python.
// Lee el código fuente carácter por carácter y produce una lista de tokens,
// reportando errores léxicos como caracteres inválidos o cadenas sin cerrar.

import type { Token, Diagnostic } from "./types"

// Palabras reservadas del lenguaje. Cualquier identificador que coincida
// con este conjunto se clasifica como PALABRA_RESERVADA en lugar de IDENTIFICADOR.
export const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await",
  "break", "class", "continue", "def", "del", "elif", "else", "except",
  "finally", "for", "from", "global", "if", "import", "in", "is",
  "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
  "while", "with", "yield",
])

// Funciones incorporadas más comunes; se marcan como palabra reservada
// para resaltarlas, pero el parser las trata como llamadas normales.
export const BUILTINS = new Set([
  "print", "input", "len", "range", "int", "float", "str", "bool", "list",
  "dict", "set", "tuple", "abs", "min", "max", "sum", "type", "round",
])

// Operadores ordenados de más largo a más corto para hacer "maximal munch"
// (siempre intentar el operador más largo posible primero).
const OPERATORS = [
  "**=", "//=", ">>=", "<<=", "!=", "==", ">=", "<=", "->", ":=",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "//", ">>", "<<",
  "+", "-", "*", "/", "%", "<", ">", "=", "&", "|", "^", "~", "@",
]

const DELIMITERS = new Set(["(", ")", "[", "]", "{", "}", ",", ":", ".", ";"])

function isDigit(ch: string) {
  return ch >= "0" && ch <= "9"
}

function isIdentifierStart(ch: string) {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_"
}

function isIdentifierPart(ch: string) {
  return isIdentifierStart(ch) || isDigit(ch)
}

export interface LexResult {
  tokens: Token[]
  errors: Diagnostic[]
}

export function tokenize(source: string): LexResult {
  const tokens: Token[] = []
  const errors: Diagnostic[] = []

  // Normalizamos saltos de línea de Windows para simplificar el escaneo.
  const src = source.replace(/\r\n?/g, "\n")

  let pos = 0
  let line = 1
  let col = 1

  // Pila de indentación para emitir tokens INDENT / DEDENT como hace Python.
  const indentStack = [0]
  // Nivel de paréntesis/corchetes: dentro de ellos se ignoran los saltos de línea.
  let bracketDepth = 0
  // Indica si estamos al inicio de una línea lógica (para medir la sangría).
  let atLineStart = true

  const peek = (offset = 0) => src[pos + offset] ?? ""

  const advance = () => {
    const ch = src[pos]
    pos++
    if (ch === "\n") {
      line++
      col = 1
    } else {
      col++
    }
    return ch
  }

  const pushToken = (type: Token["type"], value: string, tokLine: number, tokCol: number) => {
    tokens.push({ type, value, line: tokLine, column: tokCol })
  }

  while (pos < src.length) {
    // 1) Al inicio de una línea lógica medimos la indentación.
    if (atLineStart && bracketDepth === 0) {
      let indent = 0
      const indentLine = line
      let indentCol = col
      while (peek() === " " || peek() === "\t") {
        indent += peek() === "\t" ? 8 - (indent % 8) : 1
        advance()
      }
      indentCol = col
      // Líneas en blanco o solo comentarios no generan INDENT/DEDENT.
      if (peek() === "\n" || peek() === "#" || pos >= src.length) {
        atLineStart = false
        // dejamos que el bucle general consuma comentario o salto de línea
      } else {
        atLineStart = false
        const current = indentStack[indentStack.length - 1]
        if (indent > current) {
          indentStack.push(indent)
          pushToken("INDENT", "", indentLine, 1)
        } else if (indent < current) {
          while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
            indentStack.pop()
            pushToken("DEDENT", "", indentLine, indentCol)
          }
          if (indentStack[indentStack.length - 1] !== indent) {
            errors.push({
              phase: "lexico",
              severity: "error",
              message: "Indentación inconsistente: no coincide con ningún nivel anterior.",
              line: indentLine,
              column: indentCol,
            })
          }
        }
      }
      continue
    }

    const ch = peek()

    // 2) Espacios en blanco (no al inicio de línea).
    if (ch === " " || ch === "\t") {
      advance()
      continue
    }

    // 3) Comentarios: descartan hasta el fin de línea.
    if (ch === "#") {
      while (pos < src.length && peek() !== "\n") advance()
      continue
    }

    // 4) Salto de línea → token NUEVA_LINEA (salvo dentro de paréntesis).
    if (ch === "\n") {
      const l = line
      const c = col
      advance()
      if (bracketDepth === 0) {
        // Evitamos NUEVA_LINEA duplicadas o líneas lógicas vacías.
        const last = tokens[tokens.length - 1]
        if (last && last.type !== "NUEVA_LINEA" && last.type !== "INDENT" && last.type !== "DEDENT") {
          pushToken("NUEVA_LINEA", "\\n", l, c)
        }
        atLineStart = true
      }
      continue
    }

    const startLine = line
    const startCol = col

    // 5) Cadenas de texto (comillas simples o dobles). Soporta escapes básicos.
    if (ch === '"' || ch === "'") {
      const quote = ch
      // Cadenas triples.
      const triple = peek(1) === quote && peek(2) === quote
      advance()
      let value = quote
      if (triple) {
        advance(); advance()
        value = quote + quote + quote
        let closed = false
        while (pos < src.length) {
          if (peek() === quote && peek(1) === quote && peek(2) === quote) {
            value += quote + quote + quote
            advance(); advance(); advance()
            closed = true
            break
          }
          value += advance()
        }
        if (!closed) {
          errors.push({
            phase: "lexico", severity: "error",
            message: "Cadena de texto triple sin cerrar.",
            line: startLine, column: startCol,
          })
          pushToken("ERROR", value, startLine, startCol)
        } else {
          pushToken("CADENA", value, startLine, startCol)
        }
        continue
      }

      let closed = false
      while (pos < src.length) {
        const c = peek()
        if (c === "\\") {
          value += advance()
          if (pos < src.length) value += advance()
          continue
        }
        if (c === "\n") break
        if (c === quote) {
          value += advance()
          closed = true
          break
        }
        value += advance()
      }
      if (!closed) {
        errors.push({
          phase: "lexico", severity: "error",
          message: "Cadena de texto sin cerrar antes del fin de línea.",
          line: startLine, column: startCol,
        })
        pushToken("ERROR", value, startLine, startCol)
      } else {
        pushToken("CADENA", value, startLine, startCol)
      }
      continue
    }

    // 6) Números: enteros y flotantes (incluye notación 1.5, .5, 1e3).
    if (isDigit(ch) || (ch === "." && isDigit(peek(1)))) {
      let value = ""
      let isFloat = false
      let malformed = false

      while (isDigit(peek())) value += advance()
      if (peek() === ".") {
        isFloat = true
        value += advance()
        while (isDigit(peek())) value += advance()
      }
      if (peek() === "e" || peek() === "E") {
        isFloat = true
        value += advance()
        if (peek() === "+" || peek() === "-") value += advance()
        if (!isDigit(peek())) malformed = true
        while (isDigit(peek())) value += advance()
      }
      // Un identificador pegado a un número es un token mal formado (ej. 12abc).
      if (isIdentifierStart(peek())) {
        malformed = true
        while (isIdentifierPart(peek())) value += advance()
      }

      if (malformed) {
        errors.push({
          phase: "lexico", severity: "error",
          message: `Literal numérico mal formado: "${value}".`,
          line: startLine, column: startCol,
        })
        pushToken("ERROR", value, startLine, startCol)
      } else {
        pushToken(isFloat ? "FLOTANTE" : "ENTERO", value, startLine, startCol)
      }
      continue
    }

    // 7) Identificadores y palabras reservadas.
    if (isIdentifierStart(ch)) {
      let value = ""
      while (isIdentifierPart(peek())) value += advance()
      if (KEYWORDS.has(value) || BUILTINS.has(value)) {
        pushToken("PALABRA_RESERVADA", value, startLine, startCol)
      } else {
        pushToken("IDENTIFICADOR", value, startLine, startCol)
      }
      continue
    }

    // 8) Delimitadores que afectan la profundidad de paréntesis.
    if (DELIMITERS.has(ch)) {
      if (ch === "(" || ch === "[" || ch === "{") bracketDepth++
      if (ch === ")" || ch === "]" || ch === "}") bracketDepth = Math.max(0, bracketDepth - 1)
      advance()
      pushToken("DELIMITADOR", ch, startLine, startCol)
      continue
    }

    // 9) Operadores (maximal munch: probamos el más largo primero).
    let matchedOp: string | null = null
    for (const op of OPERATORS) {
      if (src.startsWith(op, pos)) {
        matchedOp = op
        break
      }
    }
    if (matchedOp) {
      for (let i = 0; i < matchedOp.length; i++) advance()
      pushToken("OPERADOR", matchedOp, startLine, startCol)
      continue
    }

    // 10) Cualquier otra cosa es un carácter inválido.
    const bad = advance()
    errors.push({
      phase: "lexico", severity: "error",
      message: `Carácter inválido: "${bad}".`,
      line: startLine, column: startCol,
    })
    pushToken("ERROR", bad, startLine, startCol)
  }

  // Cierre: emitir un último NUEVA_LINEA y los DEDENT pendientes.
  const last = tokens[tokens.length - 1]
  if (last && last.type !== "NUEVA_LINEA" && last.type !== "DEDENT" && last.type !== "INDENT") {
    pushToken("NUEVA_LINEA", "\\n", line, col)
  }
  while (indentStack.length > 1) {
    indentStack.pop()
    pushToken("DEDENT", "", line, col)
  }
  pushToken("FIN", "", line, col)

  return { tokens, errors }
}
