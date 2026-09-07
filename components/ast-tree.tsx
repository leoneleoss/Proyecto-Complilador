"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import type { ASTNode } from "@/lib/analyzer/types"

interface AstTreeProps {
  ast: ASTNode | null
}

// Colores por familia de nodo para distinguir estructura de datos.
function nodeColor(type: string): string {
  if (["Programa", "Bloque"].includes(type)) return "text-muted-foreground"
  if (["Si", "SiNo", "SiNo-Si", "Mientras", "Para", "Retorno", "Romper", "Continuar"].includes(type))
    return "text-violet-400"
  if (["DefinicionFuncion", "DefinicionClase", "Parámetros", "Parámetro"].includes(type))
    return "text-sky-300"
  if (["Entero", "Flotante", "Cadena", "Constante"].includes(type)) return "text-amber-400"
  if (["Asignacion", "OperadorBinario", "Comparacion", "Or", "And", "No", "Potencia", "OperadorUnario"].includes(type))
    return "text-rose-300"
  if (type === "Rol") return "text-muted-foreground/70"
  return "text-emerald-300"
}

function TreeNode({ node, depth }: { node: ASTNode; depth: number }) {
  const [open, setOpen] = useState(depth < 4)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="inline-block w-3.5 shrink-0" />
        )}
        <span className={`font-medium ${nodeColor(node.type)}`}>{node.type}</span>
        {node.label && node.label !== node.type && (
          <span className="text-foreground">
            <span className="text-muted-foreground">: </span>
            {node.label}
          </span>
        )}
        {node.line > 0 && (
          <span className="ml-1 text-xs text-muted-foreground/50">
            ({node.line}:{node.column})
          </span>
        )}
      </div>
      {open &&
        hasChildren &&
        node.children.map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}
    </div>
  )
}

export function AstTree({ ast }: AstTreeProps) {
  if (!ast || ast.children.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        El árbol de sintaxis aparecerá aquí una vez que el código sea analizable.
      </p>
    )
  }
  return (
    <div className="thin-scroll h-full overflow-auto p-2 font-mono text-sm">
      <TreeNode node={ast} depth={0} />
    </div>
  )
}
