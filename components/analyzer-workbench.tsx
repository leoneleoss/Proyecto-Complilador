"use client"

import { useMemo, useState } from "react"
import { Braces, ListTree, ScanText, TriangleAlert, BookOpen, Terminal } from "lucide-react"
import { analyze } from "@/lib/analyzer"
import { SAMPLES } from "@/lib/analyzer/samples"
import { CodeEditor } from "./code-editor"
import { TokenTable } from "./token-table"
import { AstTree } from "./ast-tree"
import { DiagnosticsList } from "./diagnostics-list"
import { Documentation } from "./documentation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Diagnostic } from "@/lib/analyzer/types"

export function AnalyzerWorkbench() {
  const [sampleId, setSampleId] = useState<string>(SAMPLES[0].id)
  const [code, setCode] = useState<string>(SAMPLES[0].code)

  const result = useMemo(() => analyze(code), [code])

  const allDiagnostics: Diagnostic[] = useMemo(
    () => [...result.lexicalErrors, ...result.syntaxErrors, ...result.semanticDiagnostics],
    [result],
  )

  const errorLines = useMemo(() => {
    const set = new Set<number>()
    for (const d of allDiagnostics) if (d.severity === "error") set.add(d.line)
    return set
  }, [allDiagnostics])

  const tokenCount = result.tokens.filter(
    (t) => !["NUEVA_LINEA", "INDENT", "DEDENT", "FIN"].includes(t.type),
  ).length
  const errorCount = allDiagnostics.filter((d) => d.severity === "error").length
  const warningCount = allDiagnostics.filter((d) => d.severity === "advertencia").length

  const handleSampleChange = (id: string) => {
    const sample = SAMPLES.find((s) => s.id === id)
    if (sample) {
      setSampleId(id)
      setCode(sample.code)
    }
  }

  const currentSample = SAMPLES.find((s) => s.id === sampleId)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Terminal className="size-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-foreground">
              Analizador de Python
            </h1>
            <p className="text-xs text-muted-foreground">
              Léxico · Sintáctico · Semántico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <StatChip label="Tokens" value={tokenCount} tone="neutral" />
            <StatChip label="Errores" value={errorCount} tone="error" />
            <StatChip label="Advertencias" value={warningCount} tone="warning" />
          </div>
          <Select value={sampleId} onValueChange={handleSampleChange}>
            <SelectTrigger className="w-[190px]" aria-label="Elegir programa de muestra">
              <SelectValue placeholder="Programa de muestra" />
            </SelectTrigger>
            <SelectContent>
              {SAMPLES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Cuerpo: editor + resultados */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        {/* Panel izquierdo: editor */}
        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ScanText className="size-4 text-muted-foreground" />
              Código fuente
            </div>
            {currentSample?.description && (
              <p className="hidden max-w-[60%] truncate text-xs text-muted-foreground md:block">
                {currentSample.description}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor value={code} onChange={setCode} errorLines={errorLines} />
          </div>
        </section>

        {/* Panel derecho: resultados en pestañas */}
        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <Tabs defaultValue="tokens" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-2 grid grid-cols-4">
              <TabsTrigger value="tokens" className="gap-1.5">
                <ScanText className="size-4" />
                <span className="hidden sm:inline">Tokens</span>
              </TabsTrigger>
              <TabsTrigger value="ast" className="gap-1.5">
                <ListTree className="size-4" />
                <span className="hidden sm:inline">AST</span>
              </TabsTrigger>
              <TabsTrigger value="diagnostics" className="gap-1.5">
                <TriangleAlert className="size-4" />
                <span className="hidden sm:inline">Errores</span>
                {errorCount + warningCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 text-xs text-foreground">
                    {errorCount + warningCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="docs" className="gap-1.5">
                <BookOpen className="size-4" />
                <span className="hidden sm:inline">Diseño</span>
              </TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 border-t border-border">
              <TabsContent value="tokens" className="m-0 h-full">
                <TokenTable tokens={result.tokens} />
              </TabsContent>
              <TabsContent value="ast" className="m-0 h-full">
                <AstTree ast={result.ast} />
              </TabsContent>
              <TabsContent value="diagnostics" className="m-0 flex h-full flex-col">
                <PhaseSummary result={result} />
                <div className="min-h-0 flex-1">
                  <DiagnosticsList
                    diagnostics={allDiagnostics}
                    emptyMessage="Sin errores. El código pasó las tres fases del análisis."
                  />
                </div>
              </TabsContent>
              <TabsContent value="docs" className="m-0 h-full">
                <Documentation />
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </div>
    </div>
  )
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "neutral" | "error" | "warning"
}) {
  const toneClass =
    tone === "error"
      ? value > 0
        ? "text-destructive"
        : "text-muted-foreground"
      : tone === "warning"
        ? value > 0
          ? "text-amber-400"
          : "text-muted-foreground"
        : "text-foreground"
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
      <span className={`font-mono text-sm font-semibold ${toneClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function PhaseSummary({
  result,
}: {
  result: ReturnType<typeof analyze>
}) {
  const phases = [
    { name: "Léxico", count: result.lexicalErrors.length },
    { name: "Sintáctico", count: result.syntaxErrors.length },
    {
      name: "Semántico",
      count: result.semanticDiagnostics.length,
    },
  ]
  return (
    <div className="flex gap-2 border-b border-border p-2">
      {phases.map((p) => {
        const ok = p.count === 0
        return (
          <div
            key={p.name}
            className={`flex flex-1 items-center justify-between rounded-md border px-3 py-2 text-sm ${
              ok
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-destructive/30 bg-destructive/10"
            }`}
          >
            <span className="text-foreground">{p.name}</span>
            <span className={`font-mono font-semibold ${ok ? "text-emerald-400" : "text-destructive"}`}>
              {ok ? "OK" : p.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}
