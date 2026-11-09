// Fase 4: Generación de código (AST validado → C).
// Recorre el AST (no el texto fuente) en dos etapas:
//   1) Inferencia de tipos por punto fijo: cada variable, parámetro y valor de
//      retorno recibe un tipo único (entero, flotante, booleano o cadena).
//   2) Emisión: produce un programa C completo con la semántica de Python.
// Cualquier construcción sin traducción fiel se reporta como error y no se
// genera código, para no producir C incorrecto.

import type { ASTNode, Diagnostic, TranslationResult } from "./types"
import { BUILTINS } from "./lexer"

type PyType = "int" | "float" | "bool" | "str"
type Ty = PyType | null // null = aún desconocido durante la inferencia
type ExprType = Ty | "void"

interface Expr {
  code: string
  type: ExprType
}

interface VarInfo {
  name: string
  cname: string
  type: Ty
  isParam: boolean
}

interface FnInfo {
  name: string
  cname: string
  node: ASTNode
  params: { name: string; defaultNode: ASTNode | null }[]
  vars: Map<string, VarInfo>
  body: ASTNode[]
  returnType: Ty
  returnsValue: boolean
  returnsBare: boolean
}

interface Scope {
  fn: FnInfo | null
  vars: Map<string, VarInfo>
}

class GenError extends Error {
  constructor(message: string, readonly node: ASTNode) {
    super(message)
  }
}

const C_TYPE: Record<PyType, string> = {
  int: "long long",
  float: "double",
  bool: "bool",
  str: "const char *",
}

const C_DEFAULT: Record<PyType, string> = { int: "0", float: "0.0", bool: "false", str: '""' }

const TYPE_NAME: Record<PyType, string> = {
  int: "entero",
  float: "flotante",
  bool: "booleano",
  str: "cadena",
}

// Palabras reservadas de C y nombres de la biblioteca estándar usados por el
// código generado. Un identificador de Python con estos nombres se renombra.
const C_RESERVED = new Set([
  "auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else",
  "enum", "extern", "float", "for", "goto", "if", "inline", "int", "long", "register",
  "restrict", "return", "short", "signed", "sizeof", "static", "struct", "switch",
  "typedef", "union", "unsigned", "void", "volatile", "while", "_Bool", "bool", "true",
  "false", "NULL", "main", "printf", "fprintf", "snprintf", "stderr", "stdout", "strcmp",
  "strlen", "strchr", "strcpy", "strcat", "strtod", "atoi", "pow", "floor", "fmod",
  "fabs", "llabs", "abs", "exit", "isnan", "isinf",
])

const mangle = (name: string) =>
  C_RESERVED.has(name) || name.startsWith("py_") ? `py_${name}` : name

const HEADER_ORDER = ["stdio.h", "stdbool.h", "stdlib.h", "string.h", "math.h"]

// Funciones auxiliares que reproducen la semántica de Python en C.
const HELPERS: Record<string, { deps: string[]; headers: string[]; code: string }> = {
  py_zero_div: {
    deps: [],
    headers: ["stdio.h", "stdlib.h"],
    code: `static void py_zero_div(void) {
    fprintf(stderr, "ZeroDivisionError: division by zero\\n");
    exit(1);
}`,
  },
  py_div: {
    deps: ["py_zero_div"],
    headers: [],
    code: `/* Division real de Python (/): siempre produce un flotante. */
static double py_div(double a, double b) {
    if (b == 0) py_zero_div();
    return a / b;
}`,
  },
  py_floordiv: {
    deps: ["py_zero_div"],
    headers: [],
    code: `/* Division entera de Python (//): redondea hacia menos infinito. */
static long long py_floordiv(long long a, long long b) {
    if (b == 0) py_zero_div();
    long long q = a / b;
    if ((a % b != 0) && ((a < 0) != (b < 0))) q--;
    return q;
}`,
  },
  py_floordiv_f: {
    deps: ["py_zero_div"],
    headers: ["math.h"],
    code: `static double py_floordiv_f(double a, double b) {
    if (b == 0) py_zero_div();
    return floor(a / b);
}`,
  },
  py_mod: {
    deps: ["py_zero_div"],
    headers: [],
    code: `/* Modulo de Python (%): el resultado toma el signo del divisor. */
static long long py_mod(long long a, long long b) {
    if (b == 0) py_zero_div();
    long long r = a % b;
    if (r != 0 && ((r < 0) != (b < 0))) r += b;
    return r;
}`,
  },
  py_fmod: {
    deps: ["py_zero_div"],
    headers: ["math.h"],
    code: `static double py_fmod(double a, double b) {
    if (b == 0) py_zero_div();
    double r = fmod(a, b);
    if (r != 0 && ((r < 0) != (b < 0))) r += b;
    return r;
}`,
  },
  py_ipow: {
    deps: [],
    headers: ["stdio.h", "stdlib.h"],
    code: `/* Potencia entera (**) con exponente no negativo. */
static long long py_ipow(long long base, long long exp) {
    if (exp < 0) {
        fprintf(stderr, "Error: exponente entero negativo no soportado\\n");
        exit(1);
    }
    long long r = 1;
    while (exp > 0) {
        if (exp & 1) r *= base;
        base *= base;
        exp >>= 1;
    }
    return r;
}`,
  },
  py_float_str: {
    deps: [],
    headers: ["stdio.h", "stdlib.h", "string.h", "math.h"],
    code: `/* Formatea un flotante como lo hace print() en Python (ej. 2.0, 0.1, 1e+20). */
static const char *py_float_str(double x) {
    static char bufs[8][48];
    static int next = 0;
    char *out = bufs[next];
    next = (next + 1) % 8;
    if (isnan(x)) return "nan";
    if (isinf(x)) return x > 0 ? "inf" : "-inf";
    char tmp[48];
    int prec;
    for (prec = 1; prec < 17; prec++) {
        snprintf(tmp, sizeof tmp, "%.*e", prec - 1, x);
        if (strtod(tmp, NULL) == x) break;
    }
    snprintf(tmp, sizeof tmp, "%.*e", prec - 1, x);
    int exp10 = atoi(strchr(tmp, 'e') + 1);
    if (exp10 < -4 || exp10 >= 16) {
        strcpy(out, tmp);
    } else {
        int decimals = prec - 1 - exp10;
        if (decimals < 0) decimals = 0;
        snprintf(out, 48, "%.*f", decimals, x);
        if (!strchr(out, '.')) strcat(out, ".0");
    }
    return out;
}`,
  },
}

const unwrap = (n: ASTNode): ASTNode => (n.type === "Rol" && n.children[0] ? n.children[0] : n)

const role = (n: ASTNode, r: string): ASTNode | null => {
  const found = n.children.find((c) => c.type === "Rol" && c.label === r)
  return found?.children[0] ?? null
}

const blockStatements = (n: ASTNode | null): ASTNode[] => (n ? n.children : [])

const containsNode = (n: ASTNode, type: string): boolean =>
  n.type === type || n.children.some((c) => containsNode(c, type))

const isIntLiteral = (n: ASTNode) => unwrap(n).type === "Entero"

const isNegativeIntLiteral = (raw: ASTNode) => {
  const n = unwrap(raw)
  return n.type === "OperadorUnario" && n.label === "-" && isIntLiteral(n.children[0])
}

// Valor entero de un literal (posiblemente negado), o null si no es literal.
const literalInt = (raw: ASTNode): number | null => {
  const n = unwrap(raw)
  if (n.type === "Entero") return Number(n.label)
  if (n.type === "OperadorUnario" && (n.label === "-" || n.label === "+") && isIntLiteral(n.children[0])) {
    const v = Number(unwrap(n.children[0]).label)
    return n.label === "-" ? -v : v
  }
  return null
}

// Convierte el lexema de una cadena de Python en el cuerpo de un literal de C.
function cStringBody(raw: string, node: ASTNode): string {
  const q = raw.startsWith('"""') || raw.startsWith("'''") ? 3 : 1
  const body = raw.slice(q, raw.length - q)
  let out = ""
  const emitChar = (code: number) => {
    const ch = String.fromCharCode(code)
    if (ch === '"') out += '\\"'
    else if (ch === "\\") out += "\\\\"
    else if (code === 0) throw new GenError("Las cadenas con el carácter nulo (\\0) no están soportadas en C.", node)
    else if (code < 32 || code === 127) out += `\\${code.toString(8).padStart(3, "0")}`
    else out += ch
  }
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === "\\") {
      const nx = body[i + 1]
      if (nx === undefined) {
        out += "\\\\"
        continue
      }
      i++
      const simple: Record<string, string> = {
        n: "\\n", t: "\\t", r: "\\r", a: "\\a", b: "\\b", f: "\\f", v: "\\v",
        "\\": "\\\\", "'": "'", '"': '\\"', "\n": "",
      }
      if (nx in simple) {
        out += simple[nx]
      } else if (nx === "x" && /^[0-9a-fA-F]{2}$/.test(body.slice(i + 1, i + 3))) {
        emitChar(parseInt(body.slice(i + 1, i + 3), 16))
        i += 2
      } else if (/[0-7]/.test(nx)) {
        let digits = nx
        while (digits.length < 3 && /[0-7]/.test(body[i + 1] ?? "")) digits += body[++i]
        emitChar(parseInt(digits, 8))
      } else if (nx === "u" || nx === "U" || nx === "N" || nx === "x") {
        throw new GenError(`La secuencia de escape "\\${nx}" no está soportada en la traducción a C.`, node)
      } else {
        // Python conserva la barra invertida en escapes desconocidos ("\d").
        out += "\\\\"
        emitChar(nx.charCodeAt(0))
      }
    } else if (ch === "?" && body[i + 1] === "?") {
      out += "?\\" // evita trigrafos de C ("??=")
    } else if (ch === "\n") {
      out += "\\n"
    } else if (ch.charCodeAt(0) < 32) {
      emitChar(ch.charCodeAt(0))
    } else if (ch === '"') {
      out += '\\"'
    } else {
      out += ch
    }
  }
  return out
}

// Nombres asignados dentro de una lista de sentencias (sin entrar en funciones).
function collectAssigned(stmts: ASTNode[], out: Map<string, ASTNode>) {
  for (const s of stmts) {
    if (s.type === "Asignacion") {
      const t = role(s, "objetivo")
      if (t && t.type === "Identificador" && !out.has(t.label)) out.set(t.label, t)
    } else if (s.type === "Para") {
      const v = s.children.find((c) => c.type === "Variable")
      if (v) {
        const name = v.label.replace("var: ", "")
        if (!out.has(name)) out.set(name, v)
      }
    }
    if (s.type === "DefinicionFuncion" || s.type === "DefinicionClase") continue
    for (const c of s.children) {
      const inner = unwrap(c)
      if (inner.type === "Bloque") collectAssigned(inner.children, out)
      else if (inner.type === "SiNo-Si" || inner.type === "SiNo") collectAssigned([inner], out)
    }
  }
}

// ¿La lista de sentencias termina siempre en un return (sin "caer" al final)?
function alwaysReturns(stmts: ASTNode[]): boolean {
  const last = stmts[stmts.length - 1]
  if (!last) return false
  if (last.type === "Retorno") return true
  if (last.type === "Si") {
    const elseNode = last.children.find((c) => c.type === "SiNo")
    if (!elseNode) return false
    if (!alwaysReturns(blockStatements(role(last, "entonces")))) return false
    for (const elif of last.children.filter((c) => c.type === "SiNo-Si")) {
      if (!alwaysReturns(blockStatements(role(elif, "entonces")))) return false
    }
    return alwaysReturns(blockStatements(elseNode.children[0] ?? null))
  }
  if (last.type === "Mientras") {
    const cond = role(last, "condición")
    const infinite = cond && unwrap(cond).type === "Constante" && unwrap(cond).label === "True"
    return Boolean(infinite) && !hasDirectBreak(blockStatements(role(last, "cuerpo")))
  }
  return false
}

function hasDirectBreak(stmts: ASTNode[]): boolean {
  return stmts.some((s) => {
    if (s.type === "Romper") return true
    if (s.type === "Mientras" || s.type === "Para" || s.type === "DefinicionFuncion") return false
    return s.children.some((c) => {
      const inner = unwrap(c)
      if (inner.type === "Bloque") return hasDirectBreak(inner.children)
      if (inner.type === "SiNo-Si" || inner.type === "SiNo") return hasDirectBreak([inner])
      return false
    })
  })
}

export function generateJavaScript(ast: ASTNode): TranslationResult {
  const errors: Diagnostic[] = []
  const report = (message: string, node: ASTNode) =>
    errors.push({ phase: "generacion", severity: "error", message, line: node.line, column: node.column })

  // ---- Recolección de funciones y variables globales ----
  const functions = new Map<string, FnInfo>()
  const mainStmts: ASTNode[] = []

  for (const stmt of ast.children) {
    if (stmt.type !== "DefinicionFuncion") {
      mainStmts.push(stmt)
      continue
    }
    const name = stmt.name ?? stmt.label.replace("def ", "")
    if (functions.has(name)) {
      report(`La función "${name}" se define más de una vez; C no permite redefinir funciones.`, stmt)
      continue
    }
    const paramsNode = stmt.children.find((c) => c.type === "Parámetros")
    const params = (paramsNode?.children ?? []).map((p) => ({
      name: p.label,
      defaultNode: p.children.find((c) => c.type === "Rol" && c.label === "default")?.children[0] ?? null,
    }))
    const vars = new Map<string, VarInfo>()
    for (const p of params) vars.set(p.name, { name: p.name, cname: mangle(p.name), type: null, isParam: true })
    const body = blockStatements(role(stmt, "cuerpo"))
    const assigned = new Map<string, ASTNode>()
    collectAssigned(body, assigned)
    for (const local of assigned.keys()) {
      if (!vars.has(local)) vars.set(local, { name: local, cname: mangle(local), type: null, isParam: false })
    }
    functions.set(name, {
      name, cname: mangle(name), node: stmt, params, vars, body,
      returnType: null, returnsValue: false, returnsBare: false,
    })
  }

  const globals = new Map<string, VarInfo>()
  const assignedGlobals = new Map<string, ASTNode>()
  collectAssigned(mainStmts, assignedGlobals)
  for (const [name, node] of assignedGlobals) {
    if (functions.has(name)) {
      report(`"${name}" se usa como función y como variable; C no permite reutilizar el nombre.`, node)
      continue
    }
    globals.set(name, { name, cname: mangle(name), type: null, isParam: false })
  }

  if (errors.length > 0) return { status: "error", code: null, errors, needsMath: false }

  // ---- Estado de cada pasada ----
  let strict = false
  let tempCounter = 0
  const used = new Set<string>()

  const useHeader = (h: string) => used.add(`#${h}`)
  const useHelper = (name: string) => {
    if (used.has(name)) return
    used.add(name)
    const h = HELPERS[name]
    h.deps.forEach(useHelper)
    h.headers.forEach(useHeader)
  }

  const fail = (message: string, node: ASTNode): never => {
    throw new GenError(message, node)
  }

  const lookupVar = (name: string, scope: Scope, node: ASTNode): VarInfo => {
    const v = scope.vars.get(name) ?? globals.get(name)
    if (!v) {
      if (functions.has(name)) fail(`La función "${name}" no puede usarse como valor; solo puede llamarse.`, node)
      if (BUILTINS.has(name)) fail(`La función incorporada "${name}" solo puede usarse como llamada.`, node)
      fail(`La variable "${name}" no tiene una declaración traducible a C.`, node)
    }
    if (strict && v!.type === null) {
      if (v!.isParam && scope.fn) {
        fail(
          `No se pudo determinar el tipo del parámetro "${name}" de "${scope.fn.name}"; llame a la función al menos una vez con argumentos concretos.`,
          node,
        )
      }
      fail(`No se pudo determinar el tipo de la variable "${name}".`, node)
    }
    return v!
  }

  // C exige un tipo fijo por variable: cambiar de tipo es un error, incluso
  // de entero a flotante, porque alteraría la semántica de "//" o de print().
  const assignType = (v: VarInfo, t: ExprType, node: ASTNode, what = `La variable "${v.name}"`) => {
    if (t === "void") fail("Una llamada que no devuelve valor no puede asignarse.", node)
    if (t === null) {
      if (strict) fail(`No se pudo inferir el tipo del valor asignado a "${v.name}".`, node)
      return
    }
    if (v.type === null) {
      v.type = t as Ty
      return
    }
    if (v.type !== t) {
      fail(
        `${what} recibe valores de tipos distintos (${TYPE_NAME[v.type]} y ${TYPE_NAME[t as PyType]}); en C cada variable tiene un único tipo.`,
        node,
      )
    }
  }

  const numericJoin = (a: PyType, b: PyType): PyType => (a === "float" || b === "float" ? "float" : "int")

  const truth = (e: Expr) => (e.type === "str" ? `(${e.code}[0] != '\\0')` : e.code)

  // ---- Expresiones ----

  const genExpr = (raw: ASTNode, scope: Scope): Expr => {
    const n = unwrap(raw)
    switch (n.type) {
      case "Entero": {
        if (/^0\d/.test(n.label) && !/^0+$/.test(n.label)) {
          fail(`Literal entero inválido "${n.label}" (los ceros a la izquierda no están permitidos).`, n)
        }
        if (BigInt(n.label) > BigInt("9223372036854775807")) {
          fail(`El entero ${n.label} excede el rango de long long en C.`, n)
        }
        return { code: Number(n.label) > 2147483647 ? `${n.label}LL` : n.label, type: "int" }
      }
      case "Flotante": {
        let code = n.label
        if (code.startsWith(".")) code = `0${code}`
        if (code.endsWith(".")) code = `${code}0`
        return { code, type: "float" }
      }
      case "Cadena":
        return { code: `"${cStringBody(n.label, n)}"`, type: "str" }
      case "Constante": {
        if (n.label === "None") fail("None no tiene equivalente en C y no puede traducirse.", n)
        useHeader("stdbool.h")
        return { code: n.label === "True" ? "true" : "false", type: "bool" }
      }
      case "Identificador": {
        const v = lookupVar(n.label, scope, n)
        return { code: v.cname, type: v.type }
      }
      case "OperadorBinario":
      case "Potencia":
        return genBinary(n.label, genExpr(n.children[0], scope), genExpr(n.children[1], scope), n, n.children[1])
      case "OperadorUnario": {
        const e = genExpr(n.children[0], scope)
        if (e.type === null) return { code: "0", type: null }
        if (e.type === "str") fail(`El operador unario '${n.label}' no se aplica a cadenas.`, n)
        if (n.label === "~") {
          if (e.type === "float") fail("El operador '~' requiere un entero.", n)
          return { code: `(~${e.code})`, type: "int" }
        }
        return { code: `(${n.label}${e.code})`, type: e.type === "bool" ? "int" : e.type }
      }
      case "Comparacion":
        return genComparison(n, scope)
      case "And":
      case "Or":
        return genLogical(n, scope, false)
      case "No":
        return { code: `(!${genCond(n.children[0], scope)})`, type: "bool" }
      case "Llamada": {
        const r = genCall(n, scope)
        if (r.type === "void") {
          fail("Esta llamada no devuelve ningún valor y no puede usarse dentro de una expresión.", n)
        }
        return r
      }
      case "Indice":
        return fail("La indexación (a[i]) no está soportada en la traducción a C.", n)
      case "Atributo":
        return fail("El acceso a atributos y métodos (a.b) no está soportado en la traducción a C.", n)
      case "Lista":
        return fail("Las listas no están soportadas en la traducción a C.", n)
      case "DiccionarioOConjunto":
        return fail("Los diccionarios y conjuntos no están soportados en la traducción a C.", n)
      default:
        return fail(`La expresión "${n.label}" no está soportada en la traducción a C.`, n)
    }
  }

  const genBinary = (op: string, l: Expr, r: Expr, node: ASTNode, rightNode?: ASTNode): Expr => {
    if (l.type === "void" || r.type === "void") fail("Una llamada sin valor de retorno no puede usarse en una expresión.", node)
    if (l.type === null || r.type === null) return { code: "0", type: null }
    if (l.type === "str" || r.type === "str") {
      if (op === "+" && l.type === "str" && r.type === "str") {
        fail("La concatenación de cadenas solo se puede traducir directamente dentro de print().", node)
      }
      fail(`El operador '${op}' no está soportado entre ${TYPE_NAME[l.type as PyType]} y ${TYPE_NAME[r.type as PyType]}.`, node)
    }
    const lt = l.type as PyType
    const rt = r.type as PyType
    const isFloat = lt === "float" || rt === "float"
    switch (op) {
      case "+":
      case "-":
      case "*":
        return { code: `(${l.code} ${op} ${r.code})`, type: numericJoin(lt, rt) }
      case "/":
        useHelper("py_div")
        return { code: `py_div(${l.code}, ${r.code})`, type: "float" }
      case "//":
        useHelper(isFloat ? "py_floordiv_f" : "py_floordiv")
        return { code: `${isFloat ? "py_floordiv_f" : "py_floordiv"}(${l.code}, ${r.code})`, type: isFloat ? "float" : "int" }
      case "%":
        useHelper(isFloat ? "py_fmod" : "py_mod")
        return { code: `${isFloat ? "py_fmod" : "py_mod"}(${l.code}, ${r.code})`, type: isFloat ? "float" : "int" }
      case "**":
        if (isFloat || (rightNode && isNegativeIntLiteral(rightNode))) {
          useHeader("math.h")
          return { code: `pow((double)(${l.code}), (double)(${r.code}))`, type: "float" }
        }
        useHelper("py_ipow")
        return { code: `py_ipow(${l.code}, ${r.code})`, type: "int" }
      default:
        return fail(`El operador '${op}' no está soportado en la traducción a C.`, node)
    }
  }

  const genComparison = (n: ASTNode, scope: Scope): Expr => {
    // Python encadena comparaciones: a < b < c equivale a (a < b) and (b < c).
    const operands: ASTNode[] = []
    const ops: string[] = []
    const collect = (node: ASTNode, top: boolean) => {
      const u = unwrap(node)
      if (u.type === "Comparacion" && (top || !u.parenthesized)) {
        collect(u.children[0], false)
        ops.push(u.label)
        operands.push(u.children[1])
      } else {
        operands.push(u)
      }
    }
    collect(n, true)
    for (const op of ops) {
      if (op === "in" || op === "is") fail(`El operador '${op}' no está soportado en la traducción a C.`, n)
    }
    if (ops.length > 1) {
      for (const middle of operands.slice(1, -1)) {
        if (containsNode(middle, "Llamada")) {
          fail("Una comparación encadenada con llamadas en medio no puede traducirse sin evaluarlas dos veces.", middle)
        }
      }
    }
    const exprs = operands.map((o) => genExpr(o, scope))
    const parts = ops.map((op, i) => {
      const a = exprs[i]
      const b = exprs[i + 1]
      if (a.type === null || b.type === null) return "0"
      if (a.type === "str" && b.type === "str") {
        useHeader("string.h")
        return `(strcmp(${a.code}, ${b.code}) ${op} 0)`
      }
      if (a.type === "str" || b.type === "str") {
        fail("Comparar una cadena con un número no está soportado en la traducción a C.", n)
      }
      return `(${a.code} ${op} ${b.code})`
    })
    return { code: parts.length === 1 ? parts[0] : `(${parts.join(" && ")})`, type: "bool" }
  }

  // and/or en Python devuelven uno de sus operandos, no un booleano. Solo es
  // equivalente a && / || si ambos operandos son booleanos o si el resultado se
  // usa únicamente como condición.
  const genLogical = (n: ASTNode, scope: Scope, asCondition: boolean): Expr => {
    const side = (raw: ASTNode): Expr => {
      const u = unwrap(raw)
      return u.type === "And" || u.type === "Or" ? genLogical(u, scope, asCondition) : genExpr(u, scope)
    }
    const l = side(n.children[0])
    const r = side(n.children[1])
    if (!asCondition && l.type !== null && r.type !== null && (l.type !== "bool" || r.type !== "bool")) {
      fail(`'${n.label}' con operandos no booleanos solo se puede traducir dentro de una condición (if/while).`, n)
    }
    const op = n.type === "And" ? "&&" : "||"
    return { code: `(${truth(l)} ${op} ${truth(r)})`, type: "bool" }
  }

  const genCond = (raw: ASTNode, scope: Scope): string => {
    const n = unwrap(raw)
    if (n.type === "And" || n.type === "Or") return genLogical(n, scope, true).code
    return truth(genExpr(n, scope))
  }

  const callArgs = (n: ASTNode) => n.children.find((c) => c.type === "Argumentos")?.children ?? []

  const isStrCall = (n: ASTNode) => {
    if (n.type !== "Llamada") return false
    const fn = role(n, "función")
    return Boolean(fn && unwrap(fn).type === "Identificador" && unwrap(fn).label === "str" && callArgs(n).length === 1)
  }

  const genCall = (n: ASTNode, scope: Scope): Expr => {
    const fnNode = unwrap(role(n, "función") ?? n)
    const args = callArgs(n)
    if (fnNode.type !== "Identificador") {
      fail("Solo se pueden traducir llamadas a funciones por su nombre (no métodos ni expresiones).", n)
    }
    const name = fnNode.label
    const single = (): Expr => {
      if (args.length !== 1) fail(`${name}() espera exactamente un argumento en la traducción a C.`, n)
      return genExpr(args[0], scope)
    }

    switch (name) {
      case "print":
        return genPrint(args, scope)
      case "int": {
        const e = single()
        if (e.type === "str") fail("int() sobre cadenas no está soportado en la traducción a C.", n)
        return { code: `((long long)(${e.code}))`, type: "int" }
      }
      case "float": {
        const e = single()
        if (e.type === "str") fail("float() sobre cadenas no está soportado en la traducción a C.", n)
        return { code: `((double)(${e.code}))`, type: "float" }
      }
      case "abs": {
        const e = single()
        if (e.type === "str") fail("abs() requiere un número.", n)
        if (e.type === "float") {
          useHeader("math.h")
          return { code: `fabs(${e.code})`, type: "float" }
        }
        useHeader("stdlib.h")
        return { code: `llabs(${e.code})`, type: e.type === null ? null : "int" }
      }
      case "len": {
        const e = single()
        if (e.type !== null && e.type !== "str") fail("len() solo se puede traducir sobre cadenas.", n)
        useHeader("string.h")
        return { code: `((long long)strlen(${e.code}))`, type: "int" }
      }
      case "str":
        return fail("str() solo se puede traducir dentro de print() (por ejemplo, print(\"Total: \" + str(n))).", n)
    }

    const fn = functions.get(name)
    if (!fn) {
      if (BUILTINS.has(name)) fail(`La función incorporada "${name}" no está soportada en la traducción a C.`, n)
      fail(`La función "${name}" no está definida en el nivel superior del programa.`, n)
    }
    const f = fn!
    const required = f.params.filter((p) => !p.defaultNode).length
    if (args.length < required || args.length > f.params.length) {
      fail(`La función "${name}" recibe un número incorrecto de argumentos.`, n)
    }
    const argCodes = f.params.map((p, i) => {
      const argNode = args[i] ?? p.defaultNode!
      if (!args[i]) {
        const d = unwrap(argNode)
        const literal = ["Entero", "Flotante", "Cadena", "Constante"].includes(d.type) || literalInt(d) !== null
        if (!literal) fail(`Solo se soportan valores por defecto literales (parámetro "${p.name}").`, argNode)
      }
      const e = genExpr(argNode, scope)
      assignType(f.vars.get(p.name)!, e.type, argNode, `El parámetro "${p.name}" de "${name}"`)
      return e.code
    })
    if (strict && f.returnsValue && f.returnType === null) {
      fail(`No se pudo inferir el tipo de retorno de "${name}".`, n)
    }
    return { code: `${f.cname}(${argCodes.join(", ")})`, type: f.returnsValue ? f.returnType : "void" }
  }

  // print() de Python: separa argumentos con un espacio y termina en salto de línea.
  const genPrint = (args: ASTNode[], scope: Scope): Expr => {
    const fmt: string[] = []
    const values: string[] = []

    const pushValue = (e: Expr, node: ASTNode) => {
      switch (e.type) {
        case "void":
          fail("No se puede imprimir el resultado de una llamada sin valor de retorno.", node)
          break
        case "int":
          fmt.push("%lld")
          values.push(`(long long)(${e.code})`)
          break
        case "float":
          useHelper("py_float_str")
          fmt.push("%s")
          values.push(`py_float_str(${e.code})`)
          break
        case "bool":
          fmt.push("%s")
          values.push(`((${e.code}) ? "True" : "False")`)
          break
        default:
          fmt.push("%s")
          values.push(e.type === null ? '""' : e.code)
      }
    }

    const isStrish = (m: ASTNode): boolean => {
      const u = unwrap(m)
      if (u.type === "Cadena" || isStrCall(u)) return true
      if (u.type === "OperadorBinario" && u.label === "+") return isStrish(u.children[0]) && isStrish(u.children[1])
      try {
        return genExpr(u, scope).type === "str"
      } catch {
        return false
      }
    }

    const pieces = (raw: ASTNode) => {
      const u = unwrap(raw)
      if (u.type === "Cadena") {
        fmt.push(cStringBody(u.label, u).replace(/%/g, "%%"))
      } else if (isStrCall(u)) {
        pushValue(genExpr(callArgs(u)[0], scope), u)
      } else if (u.type === "OperadorBinario" && u.label === "+" && isStrish(u.children[0]) && isStrish(u.children[1])) {
        pieces(u.children[0])
        pieces(u.children[1])
      } else {
        pushValue(genExpr(u, scope), u)
      }
    }

    args.forEach((a, i) => {
      if (i > 0) fmt.push(" ")
      pieces(a)
    })
    fmt.push("\\n")
    useHeader("stdio.h")
    const format = `"${fmt.join("")}"`
    // JavaScript conserva los argumentos separados y los imprime con espacios.
    return { code: values.length ? `console.log(${values.join(", ")})` : `console.log()`, type: "void" }
  }

  // ---- Sentencias ----

  const genBlock = (stmts: ASTNode[], scope: Scope, level: number): string[] => {
    const lines: string[] = []
    for (const s of stmts) {
      try {
        lines.push(...genStmt(s, scope, level))
      } catch (e) {
        if (!(e instanceof GenError)) throw e
        if (strict) report(e.message, e.node)
      }
    }
    return lines
  }

  const genStmt = (n: ASTNode, scope: Scope, level: number): string[] => {
    const ind = "    ".repeat(level)
    switch (n.type) {
      case "Asignacion": {
        const target = role(n, "objetivo")!
        const value = role(n, "valor")!
        if (target.type !== "Identificador") {
          fail("Solo se pueden traducir asignaciones a variables simples (no a índices ni atributos).", target)
        }
        const v = lookupVar(target.label, scope, target)
        const op = n.op ?? "="
        let rhs: Expr
        if (op === "=") {
          rhs = genExpr(value, scope)
        } else {
          const binOp = op.slice(0, -1)
          if (!["+", "-", "*", "/", "//", "%", "**"].includes(binOp)) {
            fail(`El operador de asignación '${op}' no está soportado en la traducción a C.`, n)
          }
          rhs = genBinary(binOp, { code: v.cname, type: v.type }, genExpr(value, scope), n, value)
        }
        assignType(v, rhs.type, target)
        return [`${ind}${v.cname} = ${rhs.code};`]
      }
      case "Expresion": {
        const e = unwrap(n.children[0])
        if (e.type === "Llamada") return [`${ind}${genCall(e, scope).code};`]
        return [`${ind}(void)(${genExpr(e, scope).code});`]
      }
      case "Si": {
        const lines = [`${ind}if (${genCond(role(n, "condición")!, scope)}) {`]
        lines.push(...genBlock(blockStatements(role(n, "entonces")), scope, level + 1))
        for (const c of n.children) {
          if (c.type === "SiNo-Si") {
            lines.push(`${ind}} else if (${genCond(role(c, "condición")!, scope)}) {`)
            lines.push(...genBlock(blockStatements(role(c, "entonces")), scope, level + 1))
          } else if (c.type === "SiNo") {
            lines.push(`${ind}} else {`)
            lines.push(...genBlock(blockStatements(c.children[0] ?? null), scope, level + 1))
          }
        }
        lines.push(`${ind}}`)
        return lines
      }
      case "Mientras": {
        const lines = [`${ind}while (${genCond(role(n, "condición")!, scope)}) {`]
        lines.push(...genBlock(blockStatements(role(n, "cuerpo")), scope, level + 1))
        lines.push(`${ind}}`)
        return lines
      }
      case "Para":
        return genFor(n, scope, level)
      case "Retorno": {
        const fn = scope.fn
        if (!fn) return fail("'return' fuera de una función.", n)
        if (n.children.length === 0) {
          fn.returnsBare = true
          return [`${ind}return;`]
        }
        const e = genExpr(n.children[0], scope)
        fn.returnsValue = true
        if (e.type !== null && e.type !== "void") {
          if (fn.returnType === null) fn.returnType = e.type
          else if (fn.returnType !== e.type) {
            fail(
              `La función "${fn.name}" devuelve valores de tipos distintos (${TYPE_NAME[fn.returnType]} y ${TYPE_NAME[e.type]}).`,
              n,
            )
          }
        }
        return [`${ind}return ${e.code};`]
      }
      case "Romper":
        return [`${ind}break;`]
      case "Continuar":
        return [`${ind}continue;`]
      case "Pasar":
        return [`${ind};`]
      case "Importar":
        return fail("La sentencia import no tiene equivalente en la traducción a C.", n)
      case "DefinicionFuncion":
        return fail("Las funciones anidadas o definidas dentro de bloques no están soportadas; defínalas en el nivel superior.", n)
      case "DefinicionClase":
        return fail("Las clases no están soportadas en la traducción a C.", n)
      default:
        return fail(`La sentencia "${n.label}" no está soportada en la traducción a C.`, n)
    }
  }

  // for x in range(...): se usa un contador oculto para respetar la semántica
  // de Python (el límite se evalúa una sola vez y modificar x en el cuerpo no
  // altera la iteración).
  const genFor = (n: ASTNode, scope: Scope, level: number): string[] => {
    const ind = "    ".repeat(level)
    const varNode = n.children.find((c) => c.type === "Variable")!
    const iterable = unwrap(role(n, "iterable")!)
    const fnNode = iterable.type === "Llamada" ? unwrap(role(iterable, "función") ?? iterable) : null
    if (!fnNode || fnNode.type !== "Identificador" || fnNode.label !== "range") {
      fail("Solo se pueden traducir bucles for sobre range(...).", iterable)
    }
    const args = callArgs(iterable)
    if (args.length < 1 || args.length > 3) fail("range() espera entre 1 y 3 argumentos.", iterable)
    const exprs = args.map((a) => {
      const e = genExpr(a, scope)
      if (e.type === "float" || e.type === "str") fail("range() solo acepta argumentos enteros.", a)
      return e
    })
    const start = args.length >= 2 ? exprs[0].code : "0"
    const stop = args.length >= 2 ? exprs[1].code : exprs[0].code
    let step = 1
    if (args.length === 3) {
      const lit = literalInt(args[2])
      if (lit === null) fail("El paso de range() debe ser un entero literal en la traducción a C.", args[2])
      if (lit === 0) fail("El paso de range() no puede ser 0.", args[2])
      step = lit!
    }

    const name = varNode.label.replace("var: ", "")
    const v = lookupVar(name, scope, varNode)
    assignType(v, "int", varNode)

    const id = ++tempCounter
    const fin = `py_fin_${id}`
    const it = `py_i_${id}`
    const cmp = step > 0 ? "<" : ">"
    const inc = step === 1 ? `${it}++` : step === -1 ? `${it}--` : step > 0 ? `${it} += ${step}` : `${it} -= ${-step}`
    return [
      `${ind}{`,
      `${ind}    long long ${fin} = ${stop};`,
      `${ind}    for (long long ${it} = ${start}; ${it} ${cmp} ${fin}; ${inc}) {`,
      `${ind}        ${v.cname} = ${it};`,
      ...genBlock(blockStatements(role(n, "cuerpo")), scope, level + 2),
      `${ind}    }`,
      `${ind}}`,
    ]
  }

  // ---- Pasadas ----

  const mainScope: Scope = { fn: null, vars: globals }

  const runPass = () => {
    tempCounter = 0
    const fnBodies = new Map<string, string[]>()
    for (const fn of functions.values()) {
      fnBodies.set(fn.name, genBlock(fn.body, { fn, vars: fn.vars }, 1))
    }
    const mainBody = genBlock(mainStmts, mainScope, 1)
    return { fnBodies, mainBody }
  }

  const snapshot = () =>
    JSON.stringify([
      [...globals.values()].map((v) => v.type),
      [...functions.values()].map((f) => [f.returnType, f.returnsValue, [...f.vars.values()].map((v) => v.type)]),
    ])

  // Punto fijo: repetir hasta que ningún tipo cambie (resuelve recursión y
  // llamadas a funciones definidas más abajo).
  for (let i = 0; i < 25; i++) {
    const before = snapshot()
    runPass()
    if (snapshot() === before) break
  }

  strict = true
  used.clear()
  const { fnBodies, mainBody } = runPass()

  for (const fn of functions.values()) {
    if (fn.returnsValue && fn.returnsBare) {
      report(`La función "${fn.name}" mezcla 'return' con y sin valor; en C debe tener un único tipo de retorno.`, fn.node)
    } else if (fn.returnsValue && !alwaysReturns(fn.body)) {
      report(
        `La función "${fn.name}" puede terminar sin devolver un valor (Python devolvería None, que no existe en C). Agregue un 'return' final.`,
        fn.node,
      )
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.line - b.line || a.column - b.column)
    return { status: "error", code: null, errors, needsMath: false }
  }

  // ---- Ensamblado del programa JavaScript ----
  // Las pasadas anteriores conservan la semántica del lenguaje fuente; aquí
  // solo se cambia la representación final, sin volver a interpretar texto.
  const jsLine = (line: string) =>
    line
      .replace(/\b(static|const char \*|long long|double|bool|void)\s+/g, "")
.replace(/\bprintf\s*\(/g, "console.log(")
    .replace(/console\.log\(\s*\"%(?:lld|ld|d|f)\\n\"\s*,\s*([^\n]+)\)/g, "console.log($1)")
    .replace(/\bfprintf\s*\([^,]+,\s*/g, "console.error(")
      .replace(/;\s*$/g, "")
      .replace(/\btrue\b/g, "true")
      .replace(/\bfalse\b/g, "false")
      .replace(/\((?:long long|double|bool|const char \*)\)/g, "")

  const jsSignature = (fn: FnInfo) =>
    `function ${fn.cname}(${fn.params.map((p) => fn.vars.get(p.name)!.cname).join(", ")}) {`

  const fnList = [...functions.values()]
  const fnDefs = fnList.map((fn) => {
    const locals = [...fn.vars.values()]
      .filter((v) => !v.isParam && v.type !== null)
      .map((v) => `    let ${v.cname} = ${v.type === "str" ? '""' : v.type === "float" ? "0.0" : v.type === "bool" ? "false" : "0"}`)
    const body = (fnBodies.get(fn.name) ?? []).map(jsLine)
    return [jsSignature(fn), ...locals, ...(locals.length && body.length ? [""] : []), ...body, "}"].join("\n")
  })

  const globalDecls = [...globals.values()]
    .filter((v) => v.type !== null)
    .map((v) => `let ${v.cname} = ${v.type === "str" ? '""' : v.type === "float" ? "0.0" : v.type === "bool" ? "false" : "0"}`)

  const runtime = [
    "const py_div = (a, b) => { if (b === 0) throw new Error('ZeroDivisionError: division by zero'); return a / b }",
    "const py_floordiv = (a, b) => { if (b === 0) throw new Error('ZeroDivisionError: division by zero'); return Math.floor(a / b) }",
    "const py_floordiv_f = py_floordiv",
    "const py_mod = (a, b) => { if (b === 0) throw new Error('ZeroDivisionError: division by zero'); return ((a % b) + b) % b }",
    "const py_fmod = py_mod",
    "const py_ipow = (a, b) => a ** b",
  ]
  const main = ["(() => {", ...globalDecls.map((line) => `  ${line}`), ...mainBody.map((line) => `  ${jsLine(line)}`), "})()"]
  const sections = [
    ["// JavaScript generado a partir del lenguaje Python simplificado."],
    runtime,
    ...(fnDefs.length ? [fnDefs.join("\n\n").split("\n")] : []),
    main,
  ]
  const code = sections.map((s) => s.join("\n")).join("\n\n") + "\n"
  return { status: "ok", code, errors: [], needsMath: false }
}
