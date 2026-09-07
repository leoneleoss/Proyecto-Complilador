"use client"

import type { Token, TokenType } from "@/lib/analyzer/types"

// Color asociado a cada categoría de token para lectura rápida.
const TOKEN_COLOR: Record<TokenType, string> = {
  PALABRA_RESERVADA: "text-violet-400",
  IDENTIFICADOR: "text-sky-300",
  ENTERO: "text-amber-400",
  FLOTANTE: "text-amber-400",
  CADENA: "text-emerald-400",
  OPERADOR: "text-rose-300",
  DELIMITADOR: "text-muted-foreground",
  NUEVA_LINEA: "text-muted-foreground/50",
  INDENT: "text-muted-foreground/50",
  DEDENT: "text-muted-foreground/50",
  FIN: "text-muted-foreground/50",
  ERROR: "text-destructive",
}

interface TokenTableProps {
  tokens: Token[]
}

export function TokenTable({ tokens }: TokenTableProps) {
  // Ocultamos tokens estructurales para centrar la vista en lo relevante,
  // pero mantenemos ERROR para que sean visibles.
  const visibles = tokens.filter(
    (t) => !["NUEVA_LINEA", "INDENT", "DEDENT", "FIN"].includes(t.type),
  )

  if (visibles.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No hay tokens para mostrar.</p>
  }

  return (
    <div className="thin-scroll h-full overflow-auto">
      <table className="w-full border-collapse text-left font-mono text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">#</th>
            <th className="px-4 py-2 font-medium">Tipo</th>
            <th className="px-4 py-2 font-medium">Lexema</th>
            <th className="px-4 py-2 font-medium">Línea</th>
            <th className="px-4 py-2 font-medium">Columna</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((t, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
              <td className="px-4 py-1.5 text-muted-foreground">{i + 1}</td>
              <td className={`px-4 py-1.5 font-medium ${TOKEN_COLOR[t.type]}`}>{t.type}</td>
              <td className="max-w-xs truncate px-4 py-1.5 text-foreground">{t.value}</td>
              <td className="px-4 py-1.5 text-muted-foreground">{t.line}</td>
              <td className="px-4 py-1.5 text-muted-foreground">{t.column}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
