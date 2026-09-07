// Fase 2: Analizador sintáctico (parser de descenso recursivo).
// Consume la lista de tokens del lexer y construye un Árbol de Sintaxis
// Abstracta (AST). Reporta errores sintácticos con recuperación por
// panic-mode (se salta hasta la siguiente línea lógica para seguir analizando).

import type { Token, Diagnostic, ASTNode } from "./types"

interface ParseResult {
  ast: ASTNode
  errors: Diagnostic[]
}

// Excepción interna para abortar la sentencia actual durante la recuperación.
class ParseError extends Error {}

export function parse(inputTokens: Token[]): ParseResult {
  // Filtramos NUEVA_LINEA sueltas al inicio para simplificar, pero conservamos
  // la estructura de INDENT/DEDENT/NUEVA_LINEA para delimitar bloques.
  const tokens = inputTokens
  const errors: Diagnostic[] = []
  let pos = 0

  const peek = (offset = 0): Token => tokens[Math.min(pos + offset, tokens.length - 1)]
  const atEnd = () => peek().type === "FIN"

  const node = (type: string, label: string, tok: Token, children: ASTNode[] = []): ASTNode => ({
    type, label, line: tok.line, column: tok.column, children,
  })

  const advance = (): Token => {
    const t = tokens[pos]
    if (pos < tokens.length - 1) pos++
    return t
  }

  const check = (type: Token["type"], value?: string): boolean => {
    const t = peek()
    if (t.type !== type) return false
    if (value !== undefined && t.value !== value) return false
    return true
  }

  const match = (type: Token["type"], value?: string): boolean => {
    if (check(type, value)) {
      advance()
      return true
    }
    return false
  }

  const error = (message: string, tok: Token = peek()): ParseError => {
    errors.push({ phase: "sintactico", severity: "error", message, line: tok.line, column: tok.column })
    return new ParseError(message)
  }

  const expect = (type: Token["type"], value: string | undefined, description: string): Token => {
    if (check(type, value)) return advance()
    throw error(`Se esperaba ${description} pero se encontró "${describe(peek())}".`)
  }

  const describe = (t: Token): string => {
    if (t.type === "NUEVA_LINEA") return "fin de línea"
    if (t.type === "FIN") return "fin de archivo"
    if (t.type === "INDENT") return "sangría"
    if (t.type === "DEDENT") return "fin de bloque"
    return t.value
  }

  // Salta tokens hasta el final de la línea lógica actual (recuperación).
  const synchronize = () => {
    while (!atEnd()) {
      if (peek().type === "NUEVA_LINEA") {
        advance()
        return
      }
      advance()
    }
  }

  const skipNewlines = () => {
    while (check("NUEVA_LINEA")) advance()
  }

  // ---- Sentencias ----

  const parseProgram = (): ASTNode => {
    const root = node("Programa", "Programa", peek())
    skipNewlines()
    while (!atEnd()) {
      try {
        const stmt = parseStatement()
        if (stmt) root.children.push(stmt)
      } catch (e) {
        if (e instanceof ParseError) synchronize()
        else throw e
      }
      skipNewlines()
    }
    return root
  }

  // Un bloque con sangría: NUEVA_LINEA INDENT sentencias+ DEDENT.
  const parseSuite = (): ASTNode => {
    const suite = node("Bloque", "Bloque", peek())
    if (match("NUEVA_LINEA")) {
      skipNewlines()
      if (!match("INDENT")) {
        throw error("Se esperaba un bloque con sangría después de ':'.")
      }
      skipNewlines()
      while (!check("DEDENT") && !atEnd()) {
        try {
          const stmt = parseStatement()
          if (stmt) suite.children.push(stmt)
        } catch (e) {
          if (e instanceof ParseError) synchronize()
          else throw e
        }
        skipNewlines()
      }
      expect("DEDENT", undefined, "el fin del bloque con sangría")
    } else {
      // Bloque en la misma línea: if x: return 1
      const stmt = parseSimpleStatement()
      if (stmt) suite.children.push(stmt)
    }
    return suite
  }

  const parseStatement = (): ASTNode | null => {
    const t = peek()
    if (t.type === "PALABRA_RESERVADA") {
      switch (t.value) {
        case "if": return parseIf()
        case "while": return parseWhile()
        case "for": return parseFor()
        case "def": return parseDef()
        case "class": return parseClass()
      }
    }
    const stmt = parseSimpleStatement()
    // Una sentencia simple debe terminar en NUEVA_LINEA o FIN.
    if (!check("NUEVA_LINEA") && !atEnd() && !check("DEDENT")) {
      throw error(`Token inesperado "${describe(peek())}" al final de la sentencia.`)
    }
    return stmt
  }

  const parseIf = (): ASTNode => {
    const kw = advance() // if
    const n = node("Si", "if", kw)
    n.children.push(labeled("condición", parseExpression()))
    expect("DELIMITADOR", ":", "':' después de la condición")
    n.children.push(labeled("entonces", parseSuite()))
    skipNewlines()
    while (check("PALABRA_RESERVADA", "elif")) {
      const e = advance()
      const elif = node("SiNo-Si", "elif", e)
      elif.children.push(labeled("condición", parseExpression()))
      expect("DELIMITADOR", ":", "':' después de la condición de elif")
      elif.children.push(labeled("entonces", parseSuite()))
      n.children.push(elif)
      skipNewlines()
    }
    if (check("PALABRA_RESERVADA", "else")) {
      const e = advance()
      expect("DELIMITADOR", ":", "':' después de else")
      const els = node("SiNo", "else", e)
      els.children.push(parseSuite())
      n.children.push(els)
    }
    return n
  }

  const parseWhile = (): ASTNode => {
    const kw = advance()
    const n = node("Mientras", "while", kw)
    n.children.push(labeled("condición", parseExpression()))
    expect("DELIMITADOR", ":", "':' después de la condición")
    n.children.push(labeled("cuerpo", parseSuite()))
    return n
  }

  const parseFor = (): ASTNode => {
    const kw = advance()
    const n = node("Para", "for", kw)
    const target = expect("IDENTIFICADOR", undefined, "una variable de iteración")
    n.children.push(node("Variable", `var: ${target.value}`, target))
    expect("PALABRA_RESERVADA", "in", "la palabra 'in'")
    n.children.push(labeled("iterable", parseExpression()))
    expect("DELIMITADOR", ":", "':' después del iterable")
    n.children.push(labeled("cuerpo", parseSuite()))
    return n
  }

  const parseDef = (): ASTNode => {
    const kw = advance()
    const name = expect("IDENTIFICADOR", undefined, "el nombre de la función")
    const n = node("DefinicionFuncion", `def ${name.value}`, kw)
    ;(n as ASTNode & { name?: string }).name = name.value
    expect("DELIMITADOR", "(", "'(' después del nombre de la función")
    const params = node("Parámetros", "parámetros", peek())
    if (!check("DELIMITADOR", ")")) {
      do {
        const p = expect("IDENTIFICADOR", undefined, "el nombre de un parámetro")
        params.children.push(node("Parámetro", p.value, p))
        // Valor por defecto opcional.
        if (match("OPERADOR", "=")) {
          params.children[params.children.length - 1].children.push(labeled("default", parseExpression()))
        }
      } while (match("DELIMITADOR", ","))
    }
    expect("DELIMITADOR", ")", "')' que cierra los parámetros")
    expect("DELIMITADOR", ":", "':' después de la lista de parámetros")
    n.children.push(params)
    n.children.push(labeled("cuerpo", parseSuite()))
    return n
  }

  const parseClass = (): ASTNode => {
    const kw = advance()
    const name = expect("IDENTIFICADOR", undefined, "el nombre de la clase")
    const n = node("DefinicionClase", `class ${name.value}`, kw)
    if (match("DELIMITADOR", "(")) {
      while (!check("DELIMITADOR", ")") && !atEnd()) advance()
      expect("DELIMITADOR", ")", "')' que cierra la lista de bases")
    }
    expect("DELIMITADOR", ":", "':' después del encabezado de la clase")
    n.children.push(labeled("cuerpo", parseSuite()))
    return n
  }

  const parseSimpleStatement = (): ASTNode | null => {
    const t = peek()
    if (t.type === "PALABRA_RESERVADA") {
      switch (t.value) {
        case "return": {
          const kw = advance()
          const n = node("Retorno", "return", kw)
          if (!check("NUEVA_LINEA") && !atEnd() && !check("DEDENT")) {
            n.children.push(parseExpression())
          }
          return n
        }
        case "pass": { const k = advance(); return node("Pasar", "pass", k) }
        case "break": { const k = advance(); return node("Romper", "break", k) }
        case "continue": { const k = advance(); return node("Continuar", "continue", k) }
        case "import":
        case "from": {
          const k = advance()
          const n = node("Importar", t.value, k)
          while (!check("NUEVA_LINEA") && !atEnd() && !check("DEDENT")) {
            n.children.push(node("Nombre", advance().value, k))
          }
          return n
        }
      }
    }
    return parseExpressionStatement()
  }

  const parseExpressionStatement = (): ASTNode => {
    const expr = parseExpression()
    // Asignación (posiblemente con operador compuesto).
    if (check("OPERADOR") && isAssignOp(peek().value)) {
      const op = advance()
      const value = parseExpression()
      const n = node("Asignacion", `asignar (${op.value})`, op)
      n.children.push(labeled("objetivo", expr))
      n.children.push(labeled("valor", value))
      return n
    }
    return node("Expresion", "expresión", { line: expr.line, column: expr.column } as Token, [expr])
  }

  const isAssignOp = (v: string) =>
    ["=", "+=", "-=", "*=", "/=", "//=", "**=", "%=", "&=", "|=", "^=", ">>=", "<<="].includes(v)

  // ---- Expresiones (con precedencia) ----

  const parseExpression = (): ASTNode => parseTernaryOr()

  const parseTernaryOr = (): ASTNode => parseOr()

  const binaryLevel = (
    next: () => ASTNode,
    match: (t: Token) => boolean,
    labelType = "OperadorBinario",
  ): ASTNode => {
    let left = next()
    while (match(peek())) {
      const op = advance()
      const right = next()
      const n = node(labelType, op.value, op)
      n.children.push(left, right)
      left = n
    }
    return left
  }

  const parseOr = (): ASTNode =>
    binaryLevel(parseAnd, (t) => t.type === "PALABRA_RESERVADA" && t.value === "or", "Or")

  const parseAnd = (): ASTNode =>
    binaryLevel(parseNot, (t) => t.type === "PALABRA_RESERVADA" && t.value === "and", "And")

  const parseNot = (): ASTNode => {
    if (check("PALABRA_RESERVADA", "not")) {
      const op = advance()
      const n = node("No", "not", op)
      n.children.push(parseNot())
      return n
    }
    return parseComparison()
  }

  const parseComparison = (): ASTNode =>
    binaryLevel(
      parseAddition,
      (t) =>
        (t.type === "OPERADOR" && ["<", ">", "<=", ">=", "==", "!="].includes(t.value)) ||
        (t.type === "PALABRA_RESERVADA" && ["in", "is"].includes(t.value)),
      "Comparacion",
    )

  const parseAddition = (): ASTNode =>
    binaryLevel(parseMultiplication, (t) => t.type === "OPERADOR" && ["+", "-"].includes(t.value))

  const parseMultiplication = (): ASTNode =>
    binaryLevel(parseUnary, (t) => t.type === "OPERADOR" && ["*", "/", "//", "%"].includes(t.value))

  const parseUnary = (): ASTNode => {
    if (check("OPERADOR", "-") || check("OPERADOR", "+") || check("OPERADOR", "~")) {
      const op = advance()
      const n = node("OperadorUnario", op.value, op)
      n.children.push(parseUnary())
      return n
    }
    return parsePower()
  }

  const parsePower = (): ASTNode => {
    let base = parsePostfix()
    if (check("OPERADOR", "**")) {
      const op = advance()
      const n = node("Potencia", "**", op)
      n.children.push(base, parseUnary())
      base = n
    }
    return base
  }

  // Llamadas, indexación y acceso a atributos.
  const parsePostfix = (): ASTNode => {
    let expr = parseAtom()
    while (true) {
      if (check("DELIMITADOR", "(")) {
        const open = advance()
        const call = node("Llamada", "llamada()", open)
        call.children.push(labeled("función", expr))
        const args = node("Argumentos", "argumentos", peek())
        if (!check("DELIMITADOR", ")")) {
          do {
            if (check("DELIMITADOR", ")")) break
            args.children.push(parseExpression())
          } while (match("DELIMITADOR", ","))
        }
        expect("DELIMITADOR", ")", "')' que cierra la llamada")
        call.children.push(args)
        expr = call
      } else if (check("DELIMITADOR", "[")) {
        const open = advance()
        const idx = node("Indice", "índice[]", open)
        idx.children.push(labeled("objeto", expr))
        idx.children.push(labeled("índice", parseExpression()))
        expect("DELIMITADOR", "]", "']' que cierra el índice")
        expr = idx
      } else if (check("DELIMITADOR", ".")) {
        advance()
        const attr = expect("IDENTIFICADOR", undefined, "un nombre de atributo")
        const acc = node("Atributo", `.${attr.value}`, attr)
        acc.children.push(expr)
        expr = acc
      } else {
        break
      }
    }
    return expr
  }

  const parseAtom = (): ASTNode => {
    const t = peek()
    if (t.type === "ENTERO") { advance(); return node("Entero", t.value, t) }
    if (t.type === "FLOTANTE") { advance(); return node("Flotante", t.value, t) }
    if (t.type === "CADENA") { advance(); return node("Cadena", t.value, t) }
    if (t.type === "IDENTIFICADOR") { advance(); return node("Identificador", t.value, t) }
    if (t.type === "PALABRA_RESERVADA" && ["True", "False", "None"].includes(t.value)) {
      advance(); return node("Constante", t.value, t)
    }
    // Builtins usados como valor (print, len, range, ...).
    if (t.type === "PALABRA_RESERVADA" && !["and", "or", "not", "in", "is", "if", "else", "lambda"].includes(t.value)) {
      advance(); return node("Identificador", t.value, t)
    }
    if (check("DELIMITADOR", "(")) {
      advance()
      const inner = parseExpression()
      expect("DELIMITADOR", ")", "')' que cierra el paréntesis")
      return inner
    }
    if (check("DELIMITADOR", "[")) {
      const open = advance()
      const lst = node("Lista", "lista []", open)
      if (!check("DELIMITADOR", "]")) {
        do {
          if (check("DELIMITADOR", "]")) break
          lst.children.push(parseExpression())
        } while (match("DELIMITADOR", ","))
      }
      expect("DELIMITADOR", "]", "']' que cierra la lista")
      return lst
    }
    if (check("DELIMITADOR", "{")) {
      const open = advance()
      const dct = node("DiccionarioOConjunto", "{ }", open)
      if (!check("DELIMITADOR", "}")) {
        do {
          if (check("DELIMITADOR", "}")) break
          const key = parseExpression()
          if (match("DELIMITADOR", ":")) {
            const pair = node("Par", "clave:valor", open)
            pair.children.push(key, parseExpression())
            dct.children.push(pair)
          } else {
            dct.children.push(key)
          }
        } while (match("DELIMITADOR", ","))
      }
      expect("DELIMITADOR", "}", "'}' que cierra el diccionario/conjunto")
      return dct
    }
    throw error(`Se esperaba una expresión pero se encontró "${describe(t)}".`)
  }

  // Envuelve un nodo con una etiqueta de rol (condición, cuerpo, etc.).
  const labeled = (role: string, child: ASTNode): ASTNode => {
    return { type: "Rol", label: role, line: child.line, column: child.column, children: [child] }
  }

  const ast = parseProgram()
  return { ast, errors }
}
