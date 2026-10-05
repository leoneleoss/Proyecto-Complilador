// Fase 3: Analizador semántico.
// Recorre el AST manteniendo una tabla de símbolos con ámbitos anidados.
// Detecta: uso de variables no definidas, redefinición de funciones,
// número incorrecto de argumentos, 'return' fuera de función,
// 'break'/'continue' fuera de un bucle y asignaciones a valores no válidos.

import type { ASTNode, Diagnostic } from "./types"
import { BUILTINS } from "./lexer"

interface FunctionInfo {
  name: string
  arity: number
  hasDefaults: number // cantidad de parámetros con valor por defecto
  line: number
}

interface Scope {
  vars: Set<string>
  parent: Scope | null
}

export function analyzeSemantics(ast: ASTNode | null): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!ast) return diagnostics

  const functions = new Map<string, FunctionInfo>()

  const makeScope = (parent: Scope | null): Scope => ({ vars: new Set(), parent })

  const declare = (scope: Scope, name: string) => scope.vars.add(name)

  const isDeclared = (scope: Scope, name: string): boolean => {
    let s: Scope | null = scope
    while (s) {
      if (s.vars.has(name)) return true
      s = s.parent
    }
    return false
  }

  // Devuelve el hijo directo (desenvolviendo nodos "Rol").
  const unwrap = (n: ASTNode): ASTNode => (n.type === "Rol" && n.children[0] ? n.children[0] : n)

  const childByRole = (n: ASTNode, role: string): ASTNode | null => {
    const found = n.children.find((c) => c.type === "Rol" && c.label === role)
    return found ? found.children[0] ?? null : null
  }

  // Primera pasada: registra todas las funciones de nivel superior y anidadas
  // para permitir llamadas antes de la definición (como en Python al ejecutar).
  const collectFunctions = (n: ASTNode) => {
    if (n.type === "DefinicionFuncion") {
      const name = n.name ?? n.label.replace("def ", "")
      const params = n.children.find((c) => c.type === "Parámetros")
      const paramNodes = params ? params.children : []
      const withDefaults = paramNodes.filter((p) => p.children.some((c) => c.type === "Rol" && c.label === "default")).length
      if (functions.has(name)) {
        diagnostics.push({
          phase: "semantico", severity: "advertencia",
          message: `La función "${name}" ya fue definida antes; esta redefinición la sobrescribe.`,
          line: n.line, column: n.column,
        })
      }
      functions.set(name, { name, arity: paramNodes.length, hasDefaults: withDefaults, line: n.line })
    }
    for (const c of n.children) collectFunctions(c)
  }
  collectFunctions(ast)

  // Contexto de recorrido: si estamos dentro de una función / bucle.
  interface Ctx {
    scope: Scope
    inFunction: boolean
    inLoop: boolean
  }

  // Recorre y valida un nodo de sentencia.
  const visit = (n: ASTNode, ctx: Ctx) => {
    switch (n.type) {
      case "Programa":
      case "Bloque": {
        for (const c of n.children) visit(c, ctx)
        break
      }
      case "Asignacion": {
        const target = childByRole(n, "objetivo")
        const value = childByRole(n, "valor")
        if (value) checkExpr(value, ctx)
        if (target) {
          const tgt = target
          if (tgt.type === "Identificador") {
            // "x += 1" lee x antes de escribirla: debe existir previamente.
            if (n.op && n.op !== "=" && !isDeclared(ctx.scope, tgt.label)) {
              diagnostics.push({
                phase: "semantico", severity: "error",
                message: `La variable "${tgt.label}" se usa con '${n.op}' antes de ser definida.`,
                line: tgt.line, column: tgt.column,
              })
            }
            declare(ctx.scope, tgt.label)
          } else if (tgt.type === "Indice" || tgt.type === "Atributo") {
            // asignación a a[i] o a.b: el objeto debe existir.
            checkExpr(tgt, ctx)
          } else {
            diagnostics.push({
              phase: "semantico", severity: "error",
              message: "El lado izquierdo de la asignación no es un destino válido.",
              line: tgt.line, column: tgt.column,
            })
          }
        }
        break
      }
      case "Expresion": {
        for (const c of n.children) checkExpr(c, ctx)
        break
      }
      case "Si": {
        for (const c of n.children) {
          if (c.type === "Rol" && c.label === "condición") checkExpr(c.children[0], ctx)
          else if (c.type === "Rol") visit(c.children[0], ctx)
          else if (c.type === "SiNo-Si") {
            const cond = childByRole(c, "condición")
            const then = childByRole(c, "entonces")
            if (cond) checkExpr(cond, ctx)
            if (then) visit(then, ctx)
          } else if (c.type === "SiNo") {
            visit(c.children[0], ctx)
          }
        }
        break
      }
      case "Mientras": {
        const cond = childByRole(n, "condición")
        const body = childByRole(n, "cuerpo")
        if (cond) checkExpr(cond, ctx)
        if (body) visit(body, { ...ctx, inLoop: true })
        break
      }
      case "Para": {
        const iterable = childByRole(n, "iterable")
        const body = childByRole(n, "cuerpo")
        const varNode = n.children.find((c) => c.type === "Variable")
        if (iterable) checkExpr(iterable, ctx)
        if (varNode) declare(ctx.scope, varNode.label.replace("var: ", ""))
        if (body) visit(body, { ...ctx, inLoop: true })
        break
      }
      case "DefinicionFuncion": {
        const params = n.children.find((c) => c.type === "Parámetros")
        const body = childByRole(n, "cuerpo")
        const fnScope = makeScope(ctx.scope)
        if (params) {
          for (const p of params.children) {
            declare(fnScope, p.label)
            const def = p.children.find((c) => c.type === "Rol" && c.label === "default")
            if (def) checkExpr(def.children[0], ctx)
          }
        }
        // En Python el cuerpo se resuelve al llamar a la función, así que puede
        // leer variables globales definidas después del "def". Se difiere su
        // recorrido hasta terminar el ámbito que la contiene.
        if (body) deferred.push(() => visit(body, { scope: fnScope, inFunction: true, inLoop: false }))
        break
      }
      case "DefinicionClase": {
        const body = childByRole(n, "cuerpo")
        const clsScope = makeScope(ctx.scope)
        if (body) visit(body, { scope: clsScope, inFunction: ctx.inFunction, inLoop: false })
        break
      }
      case "Retorno": {
        if (!ctx.inFunction) {
          diagnostics.push({
            phase: "semantico", severity: "error",
            message: "'return' usado fuera de una función.",
            line: n.line, column: n.column,
          })
        }
        for (const c of n.children) checkExpr(c, ctx)
        break
      }
      case "Romper":
      case "Continuar": {
        if (!ctx.inLoop) {
          const kw = n.type === "Romper" ? "break" : "continue"
          diagnostics.push({
            phase: "semantico", severity: "error",
            message: `'${kw}' usado fuera de un bucle.`,
            line: n.line, column: n.column,
          })
        }
        break
      }
      case "Importar":
      case "Pasar":
        break
      default: {
        // Sentencia no reconocida: intentamos tratarla como expresión.
        checkExpr(n, ctx)
      }
    }
  }

  // Valida una expresión y sus usos de identificadores.
  const checkExpr = (raw: ASTNode, ctx: Ctx) => {
    const n = unwrap(raw)
    switch (n.type) {
      case "Identificador": {
        const name = n.label
        if (!isDeclared(ctx.scope, name) && !BUILTINS.has(name) && !functions.has(name)) {
          diagnostics.push({
            phase: "semantico", severity: "error",
            message: `La variable "${name}" se usa antes de ser definida.`,
            line: n.line, column: n.column,
          })
        }
        break
      }
      case "Llamada": {
        const fn = childByRole(n, "función")
        const args = n.children.find((c) => c.type === "Argumentos")
        const argCount = args ? args.children.length : 0
        if (fn) {
          const target = unwrap(fn)
          if (target.type === "Identificador" && functions.has(target.label)) {
            const info = functions.get(target.label)!
            const min = info.arity - info.hasDefaults
            const max = info.arity
            if (argCount < min || argCount > max) {
              const rango = min === max ? `${max}` : `entre ${min} y ${max}`
              diagnostics.push({
                phase: "semantico", severity: "error",
                message: `La función "${target.label}" espera ${rango} argumento(s) pero recibió ${argCount}.`,
                line: n.line, column: n.column,
              })
            }
          } else {
            checkExpr(fn, ctx)
          }
        }
        if (args) for (const a of args.children) checkExpr(a, ctx)
        break
      }
      case "Indice": {
        const obj = childByRole(n, "objeto")
        const idx = childByRole(n, "índice")
        if (obj) checkExpr(obj, ctx)
        if (idx) checkExpr(idx, ctx)
        break
      }
      case "Atributo": {
        if (n.children[0]) checkExpr(n.children[0], ctx)
        break
      }
      case "Entero":
      case "Flotante":
      case "Cadena":
      case "Constante":
        break
      default: {
        for (const c of n.children) checkExpr(c, ctx)
      }
    }
  }

  const deferred: Array<() => void> = []
  const globalScope = makeScope(null)
  visit(ast, { scope: globalScope, inFunction: false, inLoop: false })
  while (deferred.length > 0) deferred.shift()!()

  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
  return diagnostics
}
