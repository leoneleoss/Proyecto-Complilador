// Programas de muestra que demuestran el manejo de tokens y de errores.

export interface Sample {
  id: string
  name: string
  description: string
  code: string
}

export const SAMPLES: Sample[] = [
  {
    id: "correcto",
    name: "Programa correcto",
    description: "Código válido que ejercita tokens, funciones, bucles y condicionales.",
    code: `# Calcula el factorial y una serie de Fibonacci
def factorial(n):
    resultado = 1
    for i in range(1, n + 1):
        resultado = resultado * i
    return resultado

def fibonacci(cantidad):
    a = 0
    b = 1
    while cantidad > 0:
        temp = a + b
        a = b
        b = temp
        cantidad = cantidad - 1
    return a

numero = 5
if numero >= 0:
    print(factorial(numero))
    print(fibonacci(numero))
else:
    print("El numero debe ser positivo")
`,
  },
  {
    id: "lexico",
    name: "Errores léxicos",
    description: "Caracteres inválidos, número mal formado y cadena sin cerrar.",
    code: `x = 10
y = 12abc      # numero mal formado
z = x $ y      # caracter invalido
mensaje = "hola   # cadena sin cerrar
precio = 3.14.15  # flotante mal formado
`,
  },
  {
    id: "sintactico",
    name: "Errores sintácticos",
    description: "Paréntesis sin cerrar, dos puntos faltantes y expresión incompleta.",
    code: `def suma(a, b
    return a + b

if x > 5
    print("mayor")

resultado = 3 +
valor = (2 + 3
`,
  },
  {
    id: "semantico",
    name: "Errores semánticos",
    description: "Variable no definida, argumentos incorrectos y return fuera de función.",
    code: `def saludar(nombre):
    print("Hola " + nombre)

saludar("Ana", "extra")   # demasiados argumentos
print(total)              # variable no definida

return 5                  # return fuera de funcion

while True:
    break
continue                  # continue fuera de bucle
`,
  },
  {
    id: "vacio",
    name: "Editor en blanco",
    description: "Empieza desde cero.",
    code: "",
  },
]
