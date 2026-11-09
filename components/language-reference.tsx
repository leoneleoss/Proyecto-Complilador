import { Braces, KeyRound, Type } from "lucide-react"
import { KEYWORDS, BUILTINS } from "@/lib/analyzer"

const operators = ["+", "-", "*", "/", "//", "%", "**", "==", "!=", "<", "<=", ">", ">=", "=", "+=", "-=", "and", "or", "not"]
const delimiters = ["(", ")", "[", "]", "{", "}", ":", ",", "."]

export function LanguageReference() {
  return (
    <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="language-reference-title">
      <div className="mb-2 flex items-center gap-2">
        <Braces className="size-4 text-primary" />
        <h2 id="language-reference-title" className="text-sm font-medium text-foreground">Lenguaje creado</h2>
        <span className="text-xs text-muted-foreground">Tokens válidos para el editor</span>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <TokenGroup icon={<KeyRound className="size-3.5" />} title="Palabras reservadas" items={[...KEYWORDS]} tone="text-sky-400" />
        <TokenGroup icon={<Type className="size-3.5" />} title="Valores y funciones" items={[...BUILTINS, "True", "False", "None"]} tone="text-amber-400" />
        <TokenGroup icon={<Braces className="size-3.5" />} title="Operadores y delimitadores" items={[...operators, ...delimiters]} tone="text-emerald-400" />
      </div>
    </section>
  )
}

function TokenGroup({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: string }) {
  return <div className="rounded-md border border-border/70 bg-muted/30 p-2">
    <div className={`mb-1.5 flex items-center gap-1.5 font-medium ${tone}`}>{icon}{title}</div>
    <div className="flex flex-wrap gap-1">{items.map((item) => <code key={item} className="rounded bg-background px-1.5 py-0.5 font-mono text-muted-foreground">{item}</code>)}</div>
  </div>
}
