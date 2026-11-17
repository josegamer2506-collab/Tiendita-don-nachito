# Tiendita Don Nacho — tienda virtual (proyecto académico)

Tienda de electrodomésticos (productos reales de marcas como Samsung, Mabe, LG, Sony, JBL, Ninja o Black+Decker; precios de referencia) hecha con HTML, CSS y JavaScript puro (sin dependencias ni compilación).
**Es una demostración**: los datos de la empresa son ficticios, el pago es una simulación (sandbox) y no hay cobros ni envíos reales.

## Cómo ejecutarla

Opción 1 — doble clic en `index.html` (funciona con `file://`).

Opción 2 — servidor local (recomendado, más parecido a un despliegue real):

```bash
python3 -m http.server 8080
```

y abre `http://localhost:8080/index.html`. Panel administrativo: `http://localhost:8080/admin.html`.

### Catálogo
Los 15 productos son modelos reales; el código de cada uno (`sku` en `datos.js`) es el **modelo del fabricante** y se muestra como «Modelo».
Los precios son de referencia para la demostración. Si cambias el catálogo base, cambia también `VERSION_CATALOGO` en `datos.js`
para que los navegadores con datos guardados se actualicen solos (se conservan existencias, pedidos y usuarios).

### Imágenes y estilo
Los productos usan fotos en `imagenes/productos/` (fondo blanco, formato 4:3, p. ej. `television.jpg`). Las ilustraciones `.svg` quedan como respaldo si una foto no carga.
Para cambiar una imagen: panel (Productos → Editar → Imagen) o la ruta en `datos.js`. Registra la fuente/licencia de cada foto (el PDF lo exige).

La estética (beige, blanco y azul claro) se controla con las variables de color al inicio de `style.css` (`:root`); el banner principal es `.hero`.

## Cuentas de demostración

| Rol | Usuario | Contraseña | Acceso |
|---|---|---|---|
| Administrador | `admin` | `Admin#2026` | todo el panel |
| Soporte | `soporte` | `Soporte#2026` | pedidos, devoluciones, clientes, atención |
| Cliente | `cliente` | `Cliente#2026` | tienda y Mi cuenta |

Las contraseñas **no se guardan**: solo su hash PBKDF2-SHA256 con sal. Las cuentas creadas con la versión anterior
(contraseña en texto plano) se migran solas: al iniciar sesión se convierten a hash.
Cupones de prueba: `NACHO10` (10 %), `NACHO20` (20 %, compra mínima $8,000), `PROFE100` ($100, un uso por cuenta).

## Estructura

| Archivo | Función |
|---|---|
| `index.html`, `style.css`, `app.js` | Tienda (interfaz) |
| `admin.html`, `admin.css`, `admin.js` | Panel administrativo |
| `servidor.js` | Capa de "servidor" simulada: precios, totales, inventario, pedidos, pagos sandbox, devoluciones, roles, bitácora |
| `datos.js` | Empresa, políticas, catálogo inicial, zonas de envío, cupones, FAQ (única fuente de configuración) |
| `legal.js` | Textos legales generados desde `datos.js` |
| `ui.js` | Componentes: escape de HTML, avisos, modales accesibles, CSV |
| `pruebas/` | Pruebas automáticas (Playwright + axe-core) |
| `docs/CUMPLIMIENTO.md`, `docs/PRUEBAS.md` | Matriz contra el documento del proyecto e informe de pruebas |

## Qué cambió respecto a la versión original

- **Bug:** `comprar()` estaba definida dos veces y la segunda anulaba a la primera (no descontaba inventario ni validaba). Ahora hay un único flujo.
- **Pago:** ya no se capturan número de tarjeta ni CVV. Pago simulado con resultado elegible (aprobado/rechazado) para probar errores.
- **Precios:** los precios publicados incluyen IVA (como ya decía el texto legal); el resumen desglosa el IVA incluido.
- **Ofertas:** el "20 % OFF" ahora es real (precio anterior tachado + precio vigente + vigencia).
- **Inventario:** global (antes era por usuario), con movimientos y alertas de stock bajo.
- **Totales:** los calcula `servidor.js` desde el catálogo; el carrito solo guarda id, variante y cantidad (nunca precios).
- **Seguridad:** hash de contraseñas, escape de HTML en toda la salida, política CSP, límite de intentos de inicio de sesión, expiración de sesión por inactividad, roles verificados en cada operación.
- **Cuenta y pedidos:** perfil, direcciones, historial por usuario (antes el historial era global), seguimiento por folio, cancelación, devoluciones/garantías.
- **Legal:** textos adaptados a electrodomésticos (antes mencionaban ropa interior y cosméticos), datos ficticios marcados, versión de términos guardada como evidencia, sin promesas contradictorias.

## Manual breve

**Comprador:** explora o busca → agrega al carrito → *Continuar* (inicia sesión o crea cuenta) → contacto y entrega → resumen y cupón →
pago de prueba, aceptando términos → folio `DN-…`. Después: *Seguimiento* (folio + correo) o *Mi cuenta → Pedidos*.
Desde el pedido puede cancelarlo (Pagado/Preparando) o solicitar devolución/garantía (folio `DEV-…`).

**Administración:** entra a `admin.html` → Pedidos: cambia estado (Pagado → Preparando → Enviado con paquetería y guía → Entregado; las transiciones inválidas se rechazan) →
Devoluciones: revisar → autorizar/rechazar → recibir → resolver (reembolso, cambio o reposición) →
Inventario: ajustes con motivo obligatorio → Reportes: exportar CSV → Bitácora: quién cambió qué.
*Restablecer datos de demostración* (Dashboard, solo admin) regresa todo al estado inicial.

## Limitaciones (importante)

- **No hay servidor real ni base de datos relacional.** Todo vive en `localStorage` del navegador (clave `tdn2_db`). `servidor.js` imita una API con
  validaciones, transacciones y permisos, pero una persona técnica podría alterar su propio `localStorage`; la seguridad real exige un backend.
  Está aislado para reemplazarlo por llamadas `fetch()` a una API.
- El correo, la factura (CFDI) y la recuperación de contraseña están **simulados**; la solicitud de factura solo se registra.
- Probado en Chromium (escritorio y móvil de 360 px). Falta probar en Firefox y Safari.
- Los textos legales son material académico, no asesoría jurídica; deben revisarse con la legislación vigente antes de operar una tienda real.

## Pruebas automáticas

```bash
cd pruebas
npm install
python3 -m http.server 8080 --directory ..   # en otra terminal
TIENDA_URL=http://localhost:8080/ npm run compra
npm run seguridad && npm run operacion && npm run teclado-movil && npm run accesibilidad
```

Requieren Node 18+ y los navegadores de Playwright instalados (`npx playwright install chromium`).
