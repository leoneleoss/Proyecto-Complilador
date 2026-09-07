"use client"

import { useRef, type ChangeEvent, type UIEvent } from "react"

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  errorLines: Set<number>
}

// Editor de texto simple con numeración de líneas y resaltado de líneas
// que contienen errores. La numeración se sincroniza con el scroll del textarea.
export function CodeEditor({ value, onChange, errorLines }: CodeEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const lines = value.split("\n")

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card font-mono text-sm">
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="thin-scroll shrink-0 select-none overflow-hidden bg-muted/40 py-3 text-right text-muted-foreground"
      >
        {lines.map((_, i) => {
          const lineNo = i + 1
          const hasError = errorLines.has(lineNo)
          return (
            <div
              key={i}
              className={`px-3 leading-6 ${
                hasError ? "bg-destructive/20 font-semibold text-destructive" : ""
              }`}
            >
              {lineNo}
            </div>
          )
        })}
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="# Escribe aquí tu código Python..."
        aria-label="Editor de código fuente"
        className="thin-scroll min-h-0 w-full resize-none bg-transparent py-3 pl-3 pr-4 leading-6 text-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  )
}
