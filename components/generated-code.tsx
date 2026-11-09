"use client"

import { CheckCircle2, CircleAlert, Copy, FileCode2 } from "lucide-react"
import { useState } from "react"
import type { TranslationResult } from "@/lib/analyzer/types"

interface GeneratedCodeProps {
  translation: TranslationResult
}

export function GeneratedCode({ translation }: GeneratedCodeProps) {
  const [copied, setCopied] = useState(false)
  const [compileState, setCompileState] = useState<"idle" | "ok" | "error">("idle")
  const [compileMessage, setCompileMessage] = useState("")

  const compileJavaScript = () => {
    if (!translation.code) return
    try {
      // La salida se valida en un alcance aislado; no se ejecuta código del usuario automáticamente.
      new Function(translation.code)
      setCompileState("ok")
      setCompileMessage("La traducción es JavaScript válido y puede ejecutarse.")
    } catch (error) {
      setCompileState("error")
      setCompileMessage(error instanceof Error ? error.message : "No se pudo compilar la traducción.")
    }
  }

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
            Corrige los errores léxicos, sintácticos o semánticos antes de generar JavaScript.
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
          No se pudo generar JavaScript
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
          <span>Python → JavaScript</span>
          <CheckCircle2 className="size-4 text-emerald-400" aria-label="Traducción correcta" />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={compileJavaScript} className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90">
            Compilar traducción
          </button>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Copy className="size-3.5" />
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>
      <pre className="thin-scroll min-h-0 flex-1 overflow-auto p-4 font-mono text-sm leading-6 text-foreground">
        <code>{translation.code}</code>
      </pre>
      <div className="border-t border-border px-4 py-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Compilación</div>
        {compileState === "idle" ? <p className="text-xs text-muted-foreground">Pulsa “Compilar traducción” para validar la salida JavaScript.</p> : <p className={`text-xs ${compileState === "ok" ? "text-emerald-400" : "text-destructive"}`}>{compileMessage}</p>}
      </div>
    </div>
  )
}
