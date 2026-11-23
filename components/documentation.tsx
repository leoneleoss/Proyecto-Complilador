"use client"

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
        <h2 className="text-lg font-semibold text-foreground">Diseño y funcionamiento del proyecto</h2>
        <p className="text-sm text-muted-foreground">
          Herramienta educativa que recibe código escrito en un subconjunto de Python, lo analiza por etapas y, si es válido, lo traduce a JavaScript. La interfaz permite inspeccionar el proceso y probar el resultado.
        </p>
      </div>

      <Section title="Recorrido completo de un programa">
        <ol className="list-decimal space-y-1 pl-5">
          <li><span className="text-foreground">Editor:</span> recibe el código fuente; las muestras permiten explorar estructuras admitidas.</li>
          <li><span className="text-foreground">Coordinador (<code>index.ts</code>):</span> ejecuta el lexer, el parser, las comprobaciones semánticas y, si no hay errores bloqueantes, el generador de JavaScript.</li>
          <li><span className="text-foreground">Paneles de resultados:</span> muestran tokens, árbol sintáctico (AST), diagnósticos y código traducido.</li>
          <li><span className="text-foreground">Prueba del resultado:</span> permite comprobar la sintaxis del JavaScript generado, ejecutarlo en un entorno aislado de la interfaz y ver la salida capturada.</li>
        </ol>
      </Section>

      <Section title="1. Análisis léxico — lexer.ts">
        <p>Lee el texto de izquierda a derecha y lo divide en unidades llamadas <span className="text-foreground">tokens</span>. Cada token conserva su tipo, lexema y ubicación (línea y columna), información que se usa para resaltar el código y explicar errores.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Reconoce palabras reservadas, identificadores, números, cadenas, operadores y delimitadores; elige primero el operador más largo cuando hay prefijos compartidos.</li>
          <li>Emula la sangría de Python con tokens <code>INDENT</code> y <code>DEDENT</code>, y produce tokens de nueva línea para separar sentencias.</li>
          <li>Detecta caracteres no válidos, cadenas sin cerrar y números mal formados. Los errores incluyen su posición para facilitar la corrección.</li>
        </ul>
      </Section>

      <Section title="2. Análisis sintáctico — parser.ts">
        <p>Comprueba que la secuencia de tokens respete la gramática implementada. Usa <span className="text-foreground">descenso recursivo</span>: distintas funciones reconocen sentencias y expresiones, respetando la precedencia de operadores.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Construye un <span className="text-foreground">árbol de sintaxis abstracta (AST)</span> con nodos para asignaciones, expresiones, condicionales, ciclos, funciones, clases, llamadas, colecciones y otras construcciones admitidas.</li>
          <li>Recupera errores descartando tokens hasta un límite seguro, para intentar informar de más de un problema en el mismo análisis.</li>
          <li>El AST es una representación estructurada del programa; no es el código final que se ejecuta.</li>
        </ul>
      </Section>

      <Section title="3. Análisis semántico — semantic.ts">
        <p>Verifica aspectos que no dependen solo de la gramática. Mantiene ámbitos anidados y registra definiciones para detectar usos que no tienen sentido dentro del subconjunto implementado.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Detecta variables usadas antes de definirse y destinos de asignación inválidos.</li>
          <li>Comprueba la cantidad de argumentos de funciones conocidas, incluyendo parámetros con valores por defecto.</li>
          <li>Señala <code>return</code> fuera de funciones y <code>break</code>/<code>continue</code> fuera de ciclos; las redefiniciones de funciones se reportan como advertencias.</li>
        </ul>
      </Section>

      <Section title="4. Generación de código — codegen.ts">
        <p>Recorre el AST y genera el equivalente en <span className="text-foreground">JavaScript</span> para las construcciones soportadas. Resuelve diferencias entre ambos lenguajes con funciones auxiliares y convenciones de traducción. Si una construcción no se puede traducir, muestra el motivo en lugar de entregar una salida incompleta.</p>
      </Section>

      <Section title="Cómo explicarlo: el proyecto funciona como traductor">
        <p>En conjunto, el programa actúa como un <span className="text-foreground">traductor de lenguajes de programación</span>: toma un programa fuente escrito en el subconjunto de Python, identifica sus componentes, interpreta su estructura y significado, y los expresa en otro lenguaje —JavaScript— mediante código generado. La traducción solo se habilita si el análisis no encuentra errores bloqueantes.</p>
        <p>Por eso no es únicamente un detector de errores ni un intérprete de Python: su salida principal es un nuevo programa en JavaScript. La compilación sintáctica y la ejecución que ofrece la interfaz sirven para comprobar esa traducción y observar su comportamiento.</p>
      </Section>

      <Section title="Alcance y límites">
        <p>El proyecto implementa un <span className="text-foreground">subconjunto educativo</span>, no toda la especificación de Python. Que una palabra aparezca en la referencia léxica significa que se reconoce como token; no implica necesariamente que cada construcción de Python asociada esté implementada por el parser o pueda traducirse. Las capacidades concretas son las definidas por el lexer, la gramática y el generador.</p>
      </Section>
    </div>
  )
}
