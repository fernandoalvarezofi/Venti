# Lintick Access — protocolo de puerta y contingencia

Objetivo: la persona sólo muestra su entrada y seguridad hace **un escaneo**. Todo lo demás se resuelve antes.

## Antes del evento (con señal)

1. Cada persona de puerta entra a **lintick.com/acceso** con **su propia cuenta** (así queda registrado quién dejó pasar a quién).
2. Abre el evento y escribe su **puerta** (ej. "Norte"). Toca la pantalla una vez para activar el sonido (iPhone lo pide).
3. Espera el aviso **"Lista sin señal: N entradas"**: el celular ya guardó las entradas para validar sin internet.
4. Prueba con una entrada de prueba: pantalla verde + pitido agudo.
5. Lleva batería externa. Brillo alto. Datos móviles prendidos aunque haya WiFi.

## Durante el ingreso

- **Escaneo continuo**: no hay que tocar nada. Verde (1,5 s) = pasa. Rojo (3,5 s) = no pasa. Se puede tocar para seguir antes.
- **Sonidos**: un pitido agudo = pasa; dos graves = no pasa. Además vibra.
- **"Ya ingresó"**: muestra a qué hora, por qué puerta y quién la dejó pasar. **No pasa.**
- **"Transferencia en curso"**: la entrada se está pasando a otra persona. Que la acepte y muestre el QR nuevo.
- **"QR viejo"**: la persona generó un QR nuevo; que muestre el último.
- **Sin QR** (celular sin batería, pantalla rota): botón **Buscar** → nombre, email, Nº de entrada o los 3 últimos del DNI → verificar documento → **Dejar pasar**. Queda registrado como ingreso manual.
- **Varios celulares a la vez**: el primero que escanea gana; el resto ve "Ya ingresó". Se pueden usar todos los que hagan falta.
- **Datos**: botón **Datos** → ingresos del último minuto, últimos 10 minutos, faltan entrar, por puerta y por persona.

## Si se corta internet

- La pantalla muestra **"Sin señal"** y valida con la lista guardada en el celular (firma del QR + estado de la entrada). El ingreso queda en una cola y **se sube solo** cuando vuelve la señal.
- **Límite honesto**: dos celulares sin señal no se ven entre sí. Si la misma entrada se presenta en dos puertas sin señal, las dos pueden dar verde; al volver la señal, el servidor marca el segundo como **duplicado** (queda en el registro). Para minimizarlo:
  - Una persona de puerta por fila; la fila no cambia de puerta.
  - Si el corte dura más de unos minutos, **concentrar el ingreso en una sola puerta** hasta que vuelva la señal.
- **Sin lista descargada y sin señal**: no se puede validar. **No dejar pasar sin validar.** Mover a ese celular a una puerta con señal o esperar.
- Al volver la señal: verificar que diga "En línea" y que **"por subir"** llegue a 0.

## Después del evento

- Revisar en el panel los ingresos y los duplicados registrados.
- "Borrar datos del celular" en cada teléfono de puerta (la lista tiene nombres y últimos 3 del DNI).

## Mediciones (21/11/2026)

| Prueba | Resultado |
|---|---|
| Servidor + base, 5.000 entradas, 8 celulares simultáneos, 10% duplicados, 3% QR falsos | p50 **14,5 ms**, p95 18 ms. 5.000 ingresos, 0 dobles, 500 duplicados y 150 falsos rechazados |
| Servidor + base, 10.000 entradas, 16 celulares simultáneos | p50 30 ms, p95 35 ms. 10.000 ingresos, 0 dobles |
| Producción (lintick.com) por internet, 4 celulares a la vez, 80 entradas + 10 re-escaneos + 6 falsos | ida y vuelta p50 **154 ms**, p95 299 ms (primer pedido 0,8 s por arranque en frío). Todo correcto |
| Dos celulares sin señal con la misma entrada | al sincronizar: uno "ingresó", el otro "duplicado" |

Tiempo total estimado en la puerta (con señal): lectura del QR por la cámara (se analiza ~9 veces por segundo) + ~0,15–0,3 s de
confirmación del servidor → **menos de medio segundo** desde que la persona muestra el QR hasta que seguridad ve verde o rojo.
Sin señal la validación es local (milisegundos). Falta medirlo con celulares reales en un evento (cámara y red móvil del lugar).

Prueba de carga para repetir: `LOAD=1 LOAD_TICKETS=10000 LOAD_SCANNERS=16 npx vitest run apps/api/test/load.test.ts`
