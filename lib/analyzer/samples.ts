// Casos de prueba del lenguaje creado.
// Cada programa está documentado para que el usuario pueda entender qué
// característica valida y qué resultado debería observar en el analizador.

export interface Sample {
  id: string
  name: string
  description: string
  code: string
}

export const SAMPLES: Sample[] = [
  {
    id: "correcto",
    name: "Correcto: factorial y Fibonacci",
    description: "Ejemplo integral: funciones, parámetros, for, while, if y print.",
    code: `# CASO CORRECTO: combina las construcciones principales del lenguaje.
# Debe pasar las fases léxica, sintáctica y semántica sin errores.
def factorial(n):
    resultado = 1
    for i in range(1, n + 1):
        resultado = resultado * i
    return resultado

def fibonacci(cantidad):
    a = 0
    b = 1
    while cantidad > 0:
        siguiente = a + b
        a = b
        b = siguiente
        cantidad = cantidad - 1
    return a

numero = 5
if numero >= 0:
    print("Factorial:", factorial(numero))
    print("Fibonacci:", fibonacci(numero))
else:
    print("El numero debe ser positivo")
`,
  },
  {
    id: "correcto1",
    name: "Correcto 1: Hola mundo",
    description: "Caso mínimo para comprobar que print de texto se traduce y ejecuta en JavaScript.",
    code: `# CASO CORRECTO 1: salida de texto.
# La consola de JavaScript debe mostrar exactamente: Hola mundo.
mensaje = "Hola mundo"
print(mensaje)
print("La traduccion funciona")
`,
  },
  {
    id: "correcto2",
    name: "Correcto 2: operaciones y decisiones",
    description: "Caso correcto adicional con aritmética, booleanos, elif y llamadas anidadas.",
    code: `# CASO CORRECTO 2: expresiones y control de flujo.
# Comprueba que los valores calculados llegan correctamente a print.
def clasificar(valor):
    if valor < 0:
        return "negativo"
    elif valor == 0:
        return "cero"
    else:
        return "positivo"

base = 3
potencia = base ** 2
print("Resultado:", potencia)
print("Estado:", clasificar(potencia))
`,
  },
  {
    id: "lexico",
    name: "Error léxico",
    description: "Comentarios explicativos incluidos: número mal formado, carácter inválido y cadena sin cerrar.",
    code: `# CASO DE ERROR LÉXICO.
# 1) 12abc mezcla un número con un identificador.
# 2) $ no pertenece al vocabulario del lenguaje.
# 3) La cadena de mensaje no termina con comillas.
# 4) 3.14.15 contiene dos puntos decimales.
x = 12abc
y = x $ 2
mensaje = "cadena sin cerrar
precio = 3.14.15
`,
  },
  {
    id: "sintactico",
    name: "Error sintáctico",
    description: "Comentarios explicativos incluidos: faltan delimitadores, dos puntos y una expresión completa.",
    code: `# CASO DE ERROR SINTÁCTICO.
# La función no cierra sus parámetros con ')'.
def suma(a, b
    return a + b

# A una cabecera if le falta ':'.
if suma(1, 2) > 2
    print("mayor")

# La asignación termina con un operador sin operando.
resultado = 3 +
`,
  },
  {
    id: "semantico",
    name: "Error semántico",
    description: "Comentarios explicativos incluidos: variable desconocida, aridad incorrecta y control fuera de contexto.",
    code: `# CASO DE ERROR SEMÁNTICO.
def saludar(nombre):
    print("Hola", nombre)

# La función recibe un argumento de más.
saludar("Ana", "extra")
# total nunca fue declarado.
print(total)
# return solo es válido dentro de una función.
return 5
# continue solo es válido dentro de un bucle.
continue
`,
  },
  {
    id: "vacio",
    name: "Editor en blanco",
    description: "Punto de partida para escribir un programa propio.",
    code: `# Escribe aquí un programa del lenguaje creado.
`,
  },
]
