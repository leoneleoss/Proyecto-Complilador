"use client"

import { AlertTriangle, CircleX, CheckCircle2 } from "lucide-react"
import type { Diagnostic } from "@/lib/analyzer/types"

interface DiagnosticsListProps {
  diagnostics: Diagnostic[]
  emptyMessage: string
}

const PHASE_LABEL: Record<Diagnostic["phase"], string> = {
  lexico: "Léxico",
  sintactico: "Sintáctico",
  semantico: "Semántico",
}

export function DiagnosticsList({ diagnostics, emptyMessage }: DiagnosticsListProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" />
        <span>{emptyMessage}</span>
      </div>
    )
  }

  return (
    <ul className="thin-scroll h-full overflow-auto divide-y divide-border/50">
      {diagnostics.map((d, i) => {
        const isError = d.severity === "error"
        return (
          <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
            {isError ? (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    isError ? "bg-destructive/15 text-destructive" : "bg-amber-400/15 text-amber-400"
                  }`}
                >
                  {isError ? "Error" : "Advertencia"}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {PHASE_LABEL[d.phase]}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  línea {d.line}, col {d.column}
                </span>
              </div>
              <p className="mt-1 text-foreground">{d.message}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
