# Informe de pruebas

**Entorno:** Chromium (Playwright), escritorio 1280×900 y móvil 360×740. También se verificó la apertura con `file://`.
**Cómo repetirlas:** ver `README.md` → *Pruebas automáticas*. Cada ejecución parte de un navegador limpio (datos de demostración recién sembrados).
**Resultado global:** 180 comprobaciones automáticas aprobadas, 0 fallidas · axe-core (WCAG 2.1 A/AA + buenas prácticas): 0 violaciones en 26 pantallas/estados.
**No cubierto:** Firefox y Safari, pruebas de usabilidad con personas, restauración desde respaldo, despliegue con HTTPS.

| Script | Comprobaciones | Resultado |
|---|---|---|
| `t1_compra.js` — compra de principio a fin | 44 | ✅ |
| `t2_seguridad.js` — seguridad y reglas de negocio | 48 | ✅ |
| `t3_operacion.js` — panel, estados, devoluciones, cancelación, legal | 68 | ✅ |
| `t4_teclado_movil.js` — teclado, doble clic, 360 px | 20 | ✅ |
| `accesibilidad.js` — axe-core | 0 violaciones | ✅ |

## Casos principales
| ID | Caso | Datos / pasos | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| CP-01 | Búsqueda y filtros | texto, categoría, precio, disponibilidad | lista coherente, paginada | ✅ aprobado |
| CP-02 | Editar carrito | +, −, cantidad escrita, 99 | tope de 10 por producto y por existencias | ✅ aprobado |
| CP-03 | Validación del envío | formulario vacío, C.P. 87300 | errores por campo; costo de zona $250 | ✅ aprobado |
| CP-04 | Registro | contraseña débil; sin mayoría de edad; sin aviso de privacidad | rechazo con mensaje; casillas no premarcadas | ✅ aprobado |
| CP-05 | Cupones | NACHO20 con $4,000; inexistente; NACHO10; vencido | mínimo de compra, rechazo, −10 %, rechazo por vigencia | ✅ aprobado |
| CP-06 | Pago rechazado | simulación “rechazado” | error, carrito intacto, sin pedido ni descuento de inventario | ✅ aprobado |
| CP-07 | Pago aprobado | simulación “aprobado” | folio `DN-…`, inventario 10→9, carrito vacío, evidencia de términos | ✅ aprobado |
| CP-08 | Sin datos bancarios | inspección de campos y almacenamiento | no hay campos de tarjeta/CVV; contraseña solo como hash | ✅ aprobado |
| CP-09 | Cliente en rutas admin | cliente en `admin.html`; 9 operaciones de la API | 403 | ✅ aprobado |
| CP-10 | Precio alterado | `precioUnitario:1`, `total:1` | se cobra el precio del catálogo | ✅ aprobado |
| CP-11 | Cantidad mayor al inventario | 4 de 3; 11; producto agotado | 409; inventario sin cambios y nunca negativo | ✅ aprobado |
| CP-12 | Doble clic / reintento | misma clave de idempotencia; doble clic en “Pagar” | un solo pedido y un solo descuento | ✅ aprobado |
| CP-13 | XSS | nombre con `<img onerror>` y `<script>` | no se ejecuta; se muestra literal | ✅ aprobado |
| CP-14 | Sesión y acceso | sesión vencida; 5 contraseñas malas; cuenta bloqueada; recuperación | 401; bloqueo temporal; 403; mensaje sin enumerar cuentas | ✅ aprobado |
| CP-15 | Migración de cuentas antiguas | usuario con contraseña en texto plano | inicia sesión y se convierte a hash | ✅ aprobado |
| CP-16 | Transiciones de pedido | Pagado→Entregado; envío sin guía | rechazadas; solo flujo válido | ✅ aprobado |
| CP-17 | Seguimiento público | folio con correo ajeno / correcto | no revela el pedido / muestra estado y guía sin datos personales | ✅ aprobado |
| CP-18 | Devolución por garantía | defectuoso → revisar → autorizar → recibir → reembolso | folio `DEV-…`, reingreso a inventario, reembolso parcial, notificación | ✅ aprobado |
| CP-19 | Plazos de devolución | revocación fuera de 5 días hábiles; garantía a 20 días | rechazo explicado; garantía vigente | ✅ aprobado |
| CP-20 | Cancelación | cancelar pedido Pagado (UI) y pedido ya entregado | reembolso e inventario repuestos / rechazo | ✅ aprobado |
| CP-21 | Inventario | ajuste sin motivo, negativo, con motivo | rechazo; movimiento con usuario y fecha | ✅ aprobado |
| CP-22 | Catálogo (admin) | SKU duplicado, precio negativo, ruta con `..`, baja lógica | rechazo; el producto sale de la tienda sin borrarse | ✅ aprobado |
| CP-23 | Rol soporte | menú y operaciones restringidas | solo 4 secciones; 403 en inventario, productos, roles | ✅ aprobado |
| CP-24 | Reportes | exportar CSV; celdas con `=HYPERLINK(...)` | CSV con el pedido; fórmulas neutralizadas | ✅ aprobado |
| CP-25 | Bitácora | cambios de estado e inventario | autor y fecha; sin contraseñas | ✅ aprobado |
| CP-26 | Documentos legales | abrir los 10 desde el pie de página | disponibles; coherentes con IVA incluido, privacidad y facturación | ✅ aprobado |
| CP-27 | Teclado | Tab/Shift+Tab, Esc, flechas en pestañas | foco atrapado y devuelto; navegable | ✅ aprobado |
| CP-28 | Responsive | 360 px en tienda, checkout, cuenta, ayuda y panel | sin scroll horizontal; controles táctiles ≥ 24 px | ✅ aprobado |

## Defectos encontrados y corregidos durante las pruebas
- Re-renderizar el carrito con el campo de cantidad enfocado lanzaba un `change` anidado → protegido.
- El límite de intentos contaba también errores de captura y podía bloquear a una persona legítima → ahora solo cuenta solicitudes completadas (excepto inicio de sesión).
- El panel admin fallaba si otra pestaña modificaba datos mientras una cuenta sin permisos veía el 403 → guarda añadida.
- Un modal abierto del panel no se cerraba al cambiar de sección → se cierra.
- Contraste insuficiente en pasos inactivos del checkout y en el botón del aviso de almacenamiento; controles táctiles pequeños → corregidos.
