# Proyecto-Complilador

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## URL del proyecto
[proyecto-complilador.vercel.app](proyecto-complilador.vercel.app)] 

## Documento de diseño
Analizador de un subconjunto de Python implementado en TypeScript, dividido en tres fases independientes que se comunican mediante estructuras de datos bien definidas.

## Arquitectura general
El proceso de traducción se implementa como un flujo de tres etapas: **código fuente → tokens → árbol de sintaxis (AST) → validación semántica**. Cada fase vive en su propio módulo (```lexer.ts```, ```parser.ts```, ```semantic.ts```) y el archivo ```index.ts``` las orquesta.

### Fase 1 — Análisis léxico
El lexer recorre el texto carácter por carácter usando la técnica de maximal munch (siempre reconoce el token más largo posible, por ejemplo ```**=``` antes que ```*```). Produce una lista de tokens con tipo, lexema, línea y columna.

- Categorías: palabras reservadas, identificadores, enteros, flotantes, cadenas, operadores y delimitadores.
- Indentación: se emula el modelo de Python con una pila de niveles que genera tokens INDENT y DEDENT, ignorando la sangría dentro de paréntesis.
- Errores léxicos: caracteres inválidos, cadenas sin cerrar y literales numéricos mal formados (12abc, 3.14.15) se reportan con su posición exacta y se emiten como tokens ERROR para poder continuar.

### Fase 2 — Análisis sintáctico
El parser es de descenso recursivo, con una función por cada regla de la gramática. Las expresiones se resuelven por niveles de precedencia (or → and → not → comparación → suma → multiplicación → unario → potencia → postfijo → átomo).

- Estructuras soportadas: asignaciones, ```if/elif/else, while, for, def, class, return, break, continue, llamadas, listas, diccionarios e indexación```.
-Recuperación de errores (panic-mode): al encontrar un token inesperado se reporta el error y se descarta hasta la siguiente línea lógica, de modo que un solo error no oculta al resto.
- Salida: un AST cuyos nodos guardan tipo, etiqueta legible y posición, listo para inspección y para la fase semántica.
  
### Fase 3 — Análisis semántico
- Se recorre el AST con una tabla de símbolos por ámbitos anidados. Una primera pasada registra todas las funciones para permitir llamadas anteriores a su definición.
- Uso de variables antes de ser definidas.
- Número de argumentos incompatible con la firma de la función (considera valores por defecto).
- Redefinición de funciones (advertencia).
- ```return``` fuera de una función y ```break/continue``` fuera de un bucle.
- Destinos de asignación inválidos.

### Decisiones de diseño
- Separar cada fase en módulos independientes facilita las pruebas y refleja la arquitectura clásica de un compilador.
- Priorizar la recuperación de errores en las tres fases para entregar la mayor cantidad de diagnósticos útiles en un solo pase.
- Cada token y nodo conserva línea y columna, lo que permite mensajes precisos y el resaltado del editor.
