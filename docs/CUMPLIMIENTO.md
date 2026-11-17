# Matriz de cumplimiento — “Diseño y desarrollo de una tienda virtual”

Leyenda: ✅ implementado y probado · ◐ parcial o simulado · ✘ no incluido · — no aplica a un sitio estático

## Alcance (§1.3) y acceso a la compra de prueba
| Requisito | Estado | Evidencia |
|---|---|---|
| Tienda responsive (360 px, tableta, escritorio) | ✅ | `pruebas/t4_teclado_movil.js` (sin scroll horizontal en 360 px) |
| Catálogo, detalle, búsqueda y filtros | ✅ | `index.html`, `app.js` |
| Carrito y checkout de prueba | ✅ | `pruebas/t1_compra.js` |
| Registro / inicio de sesión | ✅ | contraseñas con PBKDF2; `t2_seguridad.js` |
| Pedidos e inventario | ✅ | folio, partidas con copia de precio/SKU, movimientos de inventario |
| Panel administrativo | ✅ | `admin.html` |
| Base de datos | ◐ | modelo equivalente en JSON/`localStorage`; no es relacional |
| Manuales | ◐ | `README.md` (manual breve); faltan manuales formales |
| Políticas | ✅ | `legal.js` (10 documentos) |
| Pruebas | ✅ | `docs/PRUEBAS.md` |
| Pasarela sandbox | ◐ | simulador interno (aprobado/rechazado); sin proveedor externo |
| Correo transaccional | ◐ | mensajes simulados en Mi cuenta → Mensajes |
| Cupones | ✅ | vigencia, mínimo, límites por cuenta; validados en `servidor.js` |
| Reseñas moderadas | ✘ | |
| Lista de deseos | ✅ | Favoritos (por usuario) |
| Cálculo de envío | ✅ | por zona de C.P. y método |
| Analítica | ◐ | dashboard básico |
| Exportación CSV / PDF | ◐ | CSV con neutralización de fórmulas; PDF ✘ |
| Recuperación de contraseña | ◐ | simulada (código mostrado en pantalla) |
| Despliegue en la nube / HTTPS | ✘ | pendiente |
| No almacenar tarjeta/CVV | ✅ | no existe ningún campo; probado |

**Condición de aceptación** (selección → carrito → dirección → envío → pago simulado → pedido → descuento de inventario → consulta administrativa): ✅ sin tocar la base de datos a mano.

## Fase I — Planeación
| Requisito | Estado |
|---|---|
| Catálogo ≥ 15 productos en ≥ 3 categorías con SKU, descripción, precio, existencia, peso/dimensiones, estado | ✅ (15 productos, 4 categorías) |
| Datos ficticios de empresa claramente identificados | ✅ |
| Acta, requisitos, historias de usuario, diagramas, mapa del sitio, backlog, RACI, riesgos | ✘ |
| Buyer persona, competidores, modelo de ingresos | ✘ |

## Fase II — UX/UI (§3)
| Vista | Estado |
|---|---|
| Inicio (marca, propuesta de valor, categorías, destacados/ofertas) | ✅ |
| Catálogo paginado con filtros por categoría/precio/disponibilidad y orden | ✅ |
| Detalle (galería, SKU, precio, descripción, variantes, disponibilidad, envío, agregar) | ✅ (una imagen por producto) |
| Carrito (cantidades editables, subtotal, eliminar, persistencia) | ✅ |
| Checkout (contacto, dirección, entrega, resumen, términos, confirmación) | ✅ |
| Cuenta (registro, sesión, perfil, direcciones, historial y detalle) | ✅ |
| Seguimiento (estado, fecha, folio, guía) | ✅ |
| Ayuda y políticas (contacto, FAQ, privacidad, términos, envío, cancelación, devolución, garantía) | ✅ |
| Panel (dashboard, CRUD productos/categorías, inventario, pedidos, clientes, promociones, reportes) | ✅ |
| Reglas de interfaz: componentes reutilizables, precio/IVA/disponibilidad claros, sin botones decorativos, validación, estados de carga/vacío/éxito/error, sin doble envío, resumen previo | ✅ |
| Entregables de diseño (manual de identidad, wireframes, prototipo) | ✘ |
| Informe de accesibilidad | ◐ axe-core: 0 violaciones en 26 pantallas/estados (WCAG 2.1 A/AA) |

## Fases III y IV — Backend y base de datos
| Requisito | Estado | Nota |
|---|---|---|
| Módulos: usuarios, catálogo, inventario, carrito/checkout, pedidos, pagos, promociones, devoluciones, reportes | ✅ | en `servidor.js` (simulado) |
| Precio y totales calculados en el "servidor"; control de inventario; idempotencia; transacciones; estados con transiciones; auditoría; autorización por rol | ✅ | probado en `t2` y `t3` |
| API REST documentada (OpenAPI/Postman) | ✘ | no hay servidor HTTP |
| SGBD relacional, 3FN, índices, claves, ERD, diccionario, migraciones, respaldos | ✘ | requiere backend real |

## Fase V y §7 — Operación, devoluciones, cancelaciones y garantías
| Requisito | Estado |
|---|---|
| Flujo de compra de 10 pasos | ✅ |
| Logística: métodos, costo y plazo antes de pagar, estados, incidencias, guía | ✅ |
| Atención: folio, FAQ, escalamiento/registro de resolución | ✅ |
| Cancelación con política y reembolso | ✅ |
| Devolución/garantía: solicitud con folio, plazos distintos por supuesto, autorización/rechazo fundado, recepción, resolución, trazabilidad | ✅ |
| Evidencia de ≥ 3 casos de prueba | ✅ `t3_operacion.js` (defectuoso con reembolso, plazo vencido, producto de pedido no entregado, cancelación) |

## §8 — Marco legal (matriz)
| Tema | Evidencia visible | Estado |
|---|---|---|
| Identidad del proveedor | pie de página y Aviso legal (datos ficticios marcados) | ✅ |
| Información comercial | MXN, IVA incluido, envío visible antes de pagar, ofertas con precio anterior | ✅ |
| Términos y condiciones | accesibles antes de contratar; versión, fecha y pedido guardados como evidencia; casilla no premarcada | ✅ |
| Privacidad | aviso integral con ARCO, finalidades necesarias/opcionales; se muestra al recabar datos | ✅ |
| Seguridad | sin datos de tarjeta; CSP; hash | ◐ (HTTPS depende del despliegue) |
| Entrega | cobertura, costos, plazos estimados, incidencias | ✅ |
| Cancelación / devolución | procedimiento, canales, plazos | ✅ |
| Garantías | duración mínima 90 días, exclusiones, procedimiento | ✅ |
| Fiscal | solicitud de factura; aclara que **no** emite CFDI | ✅ |

Los textos son académicos; deben verificarse contra la legislación vigente (LFPC, LFPDPPP, SAT) con asesoría profesional.

## §9 — Seguridad
Hash adaptativo ✅ · roles y mínimo privilegio ✅ · validación de entradas y escape de salida ✅ · límite de intentos ✅ · expiración de sesión ✅ ·
sin secretos en el código (solo contraseñas de demostración documentadas) ✅ · cookies Secure/HttpOnly/SameSite, CSRF, SQL injection, subida de archivos — (no aplican sin servidor) ·
respaldos y plan de incidentes ✘ · análisis de dependencias — (sin dependencias en producción).
Pruebas mínimas de §9.1: acceso de cliente a rutas admin → 403 ✅ · precio alterado → se recalcula ✅ · cantidad mayor al inventario → rechazada ✅ · caracteres especiales ✅ · sesión expirada ✅ · logs sin secretos ✅.

## §10 a §12 — Pruebas, documentación y entregables
Pruebas unitarias/integración/E2E/seguridad/responsive/accesibilidad: ✅ (ver `docs/PRUEBAS.md`) · usabilidad con 5 usuarios ✘ · regresión ◐ (scripts repetibles) ·
recuperación desde respaldo ✘ · casos de aceptación 18–26 ✅, 27 (restauración) ✘ ·
manuales formales, ficha técnica, diccionario de datos, documento de API, arquitectura, plan de continuidad ✘ (el README cubre lo esencial).
