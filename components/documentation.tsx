"use client"

// Documento de diseño requerido como entregable: explica la arquitectura,
// las decisiones importantes y cómo se manejan los errores en cada fase.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export function Documentation() {
  return (
    <div className="thin-scroll h-full space-y-6 overflow-auto p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Documento de diseño</h2>
        <p className="text-sm text-muted-foreground">
          Analizador de un subconjunto de Python implementado en TypeScript, dividido en tres fases
          independientes que se comunican mediante estructuras de datos bien definidas.
        </p>
      </div>

      <Section title="Arquitectura general">
        <p>
          El proceso de traducción se implementa como un flujo de tres etapas:{" "}
          <span className="text-foreground">código fuente → tokens → árbol de sintaxis (AST) → validación semántica</span>.
          Cada fase vive en su propio módulo (<code className="text-sky-300">lexer.ts</code>,{" "}
          <code className="text-sky-300">parser.ts</code>, <code className="text-sky-300">semantic.ts</code>) y el
          archivo <code className="text-sky-300">index.ts</code> las orquesta.
        </p>
      </Section>

      <Section title="Fase 1 — Análisis léxico">
        <p>
          El lexer recorre el texto carácter por carácter usando la técnica de{" "}
          <span className="text-foreground">maximal munch</span> (siempre reconoce el token más largo posible,
          por ejemplo <code className="text-rose-300">**=</code> antes que <code className="text-rose-300">*</code>).
          Produce una lista de tokens con tipo, lexema, línea y columna.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">Categorías:</span> palabras reservadas, identificadores, enteros,
            flotantes, cadenas, operadores y delimitadores.
          </li>
          <li>
            <span className="text-foreground">Indentación:</span> se emula el modelo de Python con una pila de
            niveles que genera tokens <code>INDENT</code> y <code>DEDENT</code>, ignorando la sangría dentro de
            paréntesis.
          </li>
          <li>
            <span className="text-foreground">Errores léxicos:</span> caracteres inválidos, cadenas sin cerrar y
            literales numéricos mal formados (<code>12abc</code>, <code>3.14.15</code>) se reportan con su posición
            exacta y se emiten como tokens <code>ERROR</code> para poder continuar.
          </li>
        </ul>
      </Section>

      <Section title="Fase 2 — Análisis sintáctico">
        <p>
          El parser es de <span className="text-foreground">descenso recursivo</span>, con una función por cada
          regla de la gramática. Las expresiones se resuelven por niveles de precedencia (or → and → not →
          comparación → suma → multiplicación → unario → potencia → postfijo → átomo).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">Estructuras soportadas:</span> asignaciones, <code>if/elif/else</code>,{" "}
            <code>while</code>, <code>for</code>, <code>def</code>, <code>class</code>, <code>return</code>,{" "}
            <code>break</code>, <code>continue</code>, llamadas, listas, diccionarios e indexación.
          </li>
          <li>
            <span className="text-foreground">Recuperación de errores (panic-mode):</span> al encontrar un token
            inesperado se reporta el error y se descarta hasta la siguiente línea lógica, de modo que un solo error
            no oculta al resto.
          </li>
          <li>
            <span className="text-foreground">Salida:</span> un AST cuyos nodos guardan tipo, etiqueta legible y
            posición, listo para inspección y para la fase semántica.
          </li>
        </ul>
      </Section>

      <Section title="Fase 3 — Análisis semántico">
        <p>
          Se recorre el AST con una <span className="text-foreground">tabla de símbolos por ámbitos anidados</span>.
          Una primera pasada registra todas las funciones para permitir llamadas anteriores a su definición.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Uso de variables antes de ser definidas.</li>
          <li>Número de argumentos incompatible con la firma de la función (considera valores por defecto).</li>
          <li>Redefinición de funciones (advertencia).</li>
          <li><code>return</code> fuera de una función y <code>break</code>/<code>continue</code> fuera de un bucle.</li>
          <li>Destinos de asignación inválidos.</li>
        </ul>
      </Section>

      <Section title="Decisiones de diseño">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Separar cada fase en módulos independientes facilita las pruebas y refleja la arquitectura clásica de un
            compilador.
          </li>
          <li>
            Priorizar la <span className="text-foreground">recuperación de errores</span> en las tres fases para
            entregar la mayor cantidad de diagnósticos útiles en un solo pase.
          </li>
          <li>
            Cada token y nodo conserva <span className="text-foreground">línea y columna</span>, lo que permite
            mensajes precisos y el resaltado del editor.
          </li>
        </ul>
      </Section>
    </div>
  )
}
