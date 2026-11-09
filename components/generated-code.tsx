"use client"

import { CheckCircle2, CircleAlert, Copy, FileCode2 } from "lucide-react"
import { useState } from "react"
import type { TranslationResult } from "@/lib/analyzer/types"

interface GeneratedCodeProps {
  translation: TranslationResult
}

export function GeneratedCode({ translation }: GeneratedCodeProps) {
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    if (!translation.code) return
    await navigator.clipboard.writeText(translation.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (translation.status === "bloqueado") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <CircleAlert className="size-8 text-amber-400" />
        <div>
          <h2 className="font-medium text-foreground">Traducción bloqueada</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Corrige los errores léxicos, sintácticos o semánticos antes de generar código C.
          </p>
        </div>
      </div>
    )
  }

  if (translation.status === "error" || !translation.code) {
    return (
      <div className="thin-scroll h-full overflow-auto p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-destructive">
          <CircleAlert className="size-4" />
          No se pudo generar código C
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {translation.errors.map((error, index) => (
            <li key={`${error.line}-${error.column}-${index}`}>
              Línea {error.line}, columna {error.column}: {error.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <FileCode2 className="size-4 text-emerald-400" />
          <span>Python → C</span>
          <CheckCircle2 className="size-4 text-emerald-400" aria-label="Traducción correcta" />
        </div>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Copy className="size-3.5" />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="thin-scroll min-h-0 flex-1 overflow-auto p-4 font-mono text-sm leading-6 text-foreground">
        <code>{translation.code}</code>
      </pre>
      {translation.needsMath && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Para compilar operaciones matemáticas, enlaza con <code className="font-mono">-lm</code>.
        </p>
      )}
    </div>
  )
}
