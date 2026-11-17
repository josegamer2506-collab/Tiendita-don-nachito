"use strict";
/* ============================================================
   datos.js — Datos base y configuración de la tienda.
   TODO es ficticio y con fines académicos.
   Es la ÚNICA fuente de datos de la empresa, políticas y catálogo
   inicial: el pie de página, los textos legales y el checkout leen
   de aquí, para que no existan promesas contradictorias.
   ============================================================ */

const EMPRESA = {
    nombreComercial: "La Tiendita de Don Nacho",
    razonSocial: "Comercializadora Don Nacho S.A. de C.V.",
    rfc: "TNA240301ABC",
    domicilio: "Av. Insurgentes Sur 1000, Col. Del Valle, Benito Juárez, C.P. 03100, Ciudad de México",
    correo: "soporte@tienditadonnacho.mx",
    correoPrivacidad: "privacidad@tienditadonnacho.mx",
    telefono: "55 1234 5678",
    horario: "Lunes a viernes de 9:00 a 18:00 h (hora del centro de México)",
    aclaracion: "Datos ficticios con fines académicos: la razón social, el RFC, el domicilio, el teléfono y los correos no corresponden a una empresa real."
};

const POLITICAS = {
    version: "2026.1",               // versión de Términos / Privacidad que se guarda como evidencia
    fechaVersion: "2026-11-09",
    iva: 0.16,                       // los precios publicados YA incluyen IVA
    maxPorProducto: 10,
    stockBajo: 5,                    // alerta de inventario en el panel
    diasRevocacionHabiles: 5,        // revocación del consentimiento (LFPC art. 56)
    diasGarantia: 90,                // garantía mínima (LFPC art. 77)
    diasCortesia: 15,                // devolución voluntaria por cortesía
    respuestaSoporteHoras: 48,
    sesionMinutos: 30,
    maxDirecciones: 5
};

const ESTADOS_MX = ["Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua",
    "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México", "Guanajuato", "Guerrero", "Hidalgo",
    "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo",
    "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas"];

/* Costos y plazos ESTIMADOS (no garantizados) por zona, según los 2 primeros dígitos del C.P. */
const ZONAS_ENVIO = [
    { id: 1, nombre: "Zona 1", desde: 1, hasta: 9, costo: 100, plazo: "1 a 2 días hábiles" },
    { id: 2, nombre: "Zona 2", desde: 10, hasta: 29, costo: 150, plazo: "2 a 3 días hábiles" },
    { id: 3, nombre: "Zona 3", desde: 30, hasta: 49, costo: 200, plazo: "3 a 5 días hábiles" },
    { id: 4, nombre: "Zona 4", desde: 50, hasta: 99, costo: 250, plazo: "4 a 7 días hábiles" }
];

const METODOS_ENTREGA = [
    { id: "estandar", etiqueta: "Paquetería estándar", recargo: 0, plazo: null, descripcion: "Entrega a domicilio. Costo y plazo según tu C.P." },
    { id: "express", etiqueta: "Paquetería express", recargo: 150, plazo: "1 a 3 días hábiles", descripcion: "Entrega a domicilio más rápida (+ $150 sobre el costo de zona)." },
    { id: "recoleccion", etiqueta: "Recolección en tienda", recargo: 0, plazo: "Disponible 1 a 2 días hábiles después del pago", descripcion: "Sin costo. Recoges en el domicilio de la tienda (ficticio)." }
];

const METODOS_PAGO = [
    { id: "Tarjeta", etiqueta: "💳 Tarjeta (sandbox)" },
    { id: "PayPal", etiqueta: "🅿️ PayPal (sandbox)" },
    { id: "MercadoPago", etiqueta: "💰 MercadoPago (sandbox)" }
];

const MOTIVOS_DEVOLUCION = {
    defectuoso: "Producto defectuoso (garantía)",
    dano_transito: "Dañado en tránsito",
    incorrecto: "Me enviaron un producto incorrecto",
    incompleto: "Producto incompleto (faltan piezas o accesorios)",
    no_recibido: "No lo he recibido",
    arrepentimiento: "Arrepentimiento / revocación del consentimiento (art. 56 LFPC)",
    cortesia: "Devolución voluntaria por cortesía (sujeta a aprobación)"
};

const CUPONES_BASE = [
    { codigo: "NACHO10", tipo: "porcentaje", valor: 10, desde: "2026-01-01", hasta: "2027-12-31", minimoCompra: 0, usosPorUsuario: null, usosMaximos: null, activo: true, publico: true },
    { codigo: "NACHO20", tipo: "porcentaje", valor: 20, desde: "2026-01-01", hasta: "2027-12-31", minimoCompra: 8000, usosPorUsuario: 3, usosMaximos: null, activo: true, publico: true },
    { codigo: "PROFE100", tipo: "monto", valor: 100, desde: "2026-01-01", hasta: "2027-12-31", minimoCompra: 0, usosPorUsuario: 1, usosMaximos: null, activo: true, publico: false }
];

/* Cuentas de demostración (las contraseñas NO se guardan: se almacena su hash PBKDF2). */
const USUARIOS_DEMO = [
    { usuario: "admin", correo: "admin@example.com", nombre: "Administrador Demo", rol: "admin", clave: "Admin#2026" },
    { usuario: "soporte", correo: "soporte@example.com", nombre: "Soporte Demo", rol: "soporte", clave: "Soporte#2026" },
    { usuario: "cliente", correo: "cliente@example.com", nombre: "Cliente Demo", rol: "cliente", clave: "Cliente#2026" }
];

/* Catálogo inicial: 15 productos reales en 4 categorías.
   - "sku" guarda el MODELO del fabricante (p. ej. UN55DU7000); en pantalla se muestra como "Modelo".
   - Los precios son de REFERENCIA (aprox., MXN con IVA) solo para la demostración; no son una oferta real.
   - Medidas y pesos: datos aproximados de las fichas de los fabricantes; "Consultar ficha del fabricante"
     cuando no se verificó el dato.
   - Fotos en imagenes/productos/ (fondo blanco, formato 4:3). Para cambiar una, edita el producto en el panel
     (Productos → Editar → Imagen) o la ruta aquí. Si una imagen no carga, se muestra la ilustración .svg del mismo producto. */
/* Cambia este valor cuando cambie el catálogo base: los navegadores que ya tenían datos guardados
   se actualizan solos (conservando existencias, pedidos y usuarios). */
const VERSION_CATALOGO = "2026-11-fotos-reales-2";

const CATALOGO_BASE = [
    { id: 1, sku: "UN55DU7000", nombre: "Televisión Samsung 55 pulgadas Crystal UHD 4K", categoria: "Entretenimiento", precio: 8999, stock: 10,
      imagen: "imagenes/productos/television.jpg",
      descripcion: "Smart TV de 55 pulgadas con pantalla Crystal UHD 4K, sistema Tizen con apps de streaming, HDR, Wi-Fi y Bluetooth 5.2. Incluye entradas HDMI y USB.",
      peso: "12 kg (aprox., sin base)", dimensiones: "123 × 71 × 6 cm (aprox., sin base)", variantes: [], destacado: true,
      oferta: { porcentaje: 20, hasta: "2027-12-31" } },
    { id: 2, sku: "WA20A3350GW", nombre: "Lavadora Samsung 20 kg carga superior", categoria: "Línea blanca", precio: 10499, stock: 6,
      imagen: "imagenes/productos/lavadora.jpg",
      descripcion: "Lavadora automática de carga superior con capacidad de 20 kg, agitador ActiveWave y tecnología Aqua Saving para ahorrar agua en cada lavado.",
      peso: "Consultar ficha del fabricante", dimensiones: "Consultar ficha del fabricante", variantes: ["Blanco"], destacado: true, oferta: null },
    { id: 3, sku: "RME360FZMRP0", nombre: "Refrigerador Mabe 14 pies Top Mount No Frost", categoria: "Línea blanca", precio: 15999, stock: 4,
      imagen: "imagenes/productos/refrigerador.jpg",
      descripcion: "Refrigerador Top Mount de 14 pies cúbicos con tecnología No Frost (sin escarcha) y despachador de agua. Acabado negro.",
      peso: "90 kg (aprox.)", dimensiones: "68 × 71 × 173.5 cm (aprox.)", variantes: ["Negro"], destacado: true, oferta: null },
    { id: 4, sku: "SETCXC120K", nombre: "Aire acondicionado Mirage Inverter 12,000 BTU frío y calor", categoria: "Climatización", precio: 11999, stock: 5,
      imagen: "imagenes/productos/aire-acondicionado.jpg",
      descripcion: "Minisplit inverter de 12,000 BTU (1 tonelada) con función de frío y calor, a 110 V. Requiere instalación por un técnico.",
      peso: "Consultar ficha del fabricante", dimensiones: "Consultar ficha del fabricante", variantes: [], destacado: false, oferta: null },
    { id: 5, sku: "LASKO-1843", nombre: "Ventilador de pedestal Lasko Cyclone 18 pulgadas", categoria: "Climatización", precio: 1899, stock: 12,
      imagen: "imagenes/productos/ventilador.jpg",
      descripcion: "Ventilador de pedestal de 18 pulgadas con 3 velocidades, oscilación, altura ajustable, temporizador programable y control remoto.",
      peso: "4.5 kg (aprox.)", dimensiones: "52 cm de base × 136 cm de alto máx. (aprox.)", variantes: ["Negro"], destacado: true,
      oferta: { porcentaje: 20, hasta: "2027-12-31" } },
    { id: 6, sku: "EM7620BAIS2", nombre: "Estufa Mabe 76 cm 6 quemadores", categoria: "Cocina", precio: 8999, stock: 7,
      imagen: "imagenes/productos/estufa.jpg",
      descripcion: "Estufa de piso a gas LP de 76 cm (30 pulgadas) con 6 quemadores, temporizador programable, luz interior y cubierta de acero inoxidable. Requiere conexión de gas por un técnico.",
      peso: "Consultar ficha del fabricante", dimensiones: "76 cm (30 pulgadas) de ancho", variantes: [], destacado: false, oferta: null },
    { id: 7, sku: "HT-S100F", nombre: "Barra de sonido Sony HT-S100F 2.0", categoria: "Entretenimiento", precio: 2990, stock: 8,
      imagen: "imagenes/productos/barra-de-sonido.jpg",
      descripcion: "Barra de sonido 2.0 de 120 W con Bluetooth, entrada HDMI ARC, entrada óptica y puerto USB. Incluye modos de sonido Cinema, Music, Voice y Night.",
      peso: "2.4 kg", dimensiones: "90 × 6.4 × 8.8 cm", variantes: [], destacado: false, oferta: null },
    { id: 8, sku: "JBLFLIP6", nombre: "Bocina Bluetooth JBL Flip 6", categoria: "Entretenimiento", precio: 2799, stock: 15,
      imagen: "imagenes/productos/bocina-bluetooth.jpg",
      descripcion: "Bocina portátil con Bluetooth 5.1, resistente al agua y al polvo (IP67), hasta 12 horas de reproducción y PartyBoost para conectar otras bocinas compatibles.",
      peso: "0.55 kg", dimensiones: "17.8 × 6.8 × 7.2 cm", variantes: ["Negro", "Azul", "Rojo"], destacado: false, oferta: null },
    { id: 9, sku: "7MWED1900EW", nombre: "Secadora de ropa Whirlpool 19 kg eléctrica", categoria: "Línea blanca", precio: 10999, stock: 3,
      imagen: "imagenes/productos/secadora-de-ropa.jpg",
      descripcion: "Secadora de ropa eléctrica de 19 kg de capacidad, a 220-240 V. Requiere una toma de corriente adecuada para su instalación.",
      peso: "Consultar ficha del fabricante", dimensiones: "110 cm de alto × 74 × 72 cm (aprox.)", variantes: ["Blanco"], destacado: false, oferta: null },
    { id: 10, sku: "LASKO-754200", nombre: "Calefactor cerámico Lasko 754200", categoria: "Climatización", precio: 899, stock: 12,
      imagen: "imagenes/productos/calefactor.jpg",
      descripcion: "Calefactor cerámico portátil de 1,500 W (900 W en baja) con termostato ajustable y opción de solo ventilador. Pensado para espacios pequeños de uso personal.",
      peso: "Consultar ficha del fabricante", dimensiones: "15 × 11 × 23 cm (aprox.)", variantes: [], destacado: false, oferta: null },
    { id: 11, sku: "NN-SN686S", nombre: "Microondas Panasonic 1.2 pies cúbicos Inverter", categoria: "Cocina", precio: 4499, stock: 9,
      imagen: "imagenes/productos/microondas.jpg",
      descripcion: "Horno de microondas de 1.2 pies cúbicos y 1,200 W con tecnología Inverter para una cocción más uniforme, sensor Genius y descongelado turbo.",
      peso: "11.5 kg", dimensiones: "52.5 × 40 × 31 cm", variantes: [], destacado: false, oferta: null },
    { id: 12, sku: "BL610", nombre: "Licuadora Ninja Professional 72 oz", categoria: "Cocina", precio: 2499, stock: 20,
      imagen: "imagenes/productos/licuadora.jpg",
      descripcion: "Licuadora de 1,000 W con jarra de 72 oz, tres velocidades y control de pulso, ideal para licuados, hielo triturado y purés.",
      peso: "4 kg (aprox.)", dimensiones: "21 × 27 × 40 cm (aprox.)", variantes: [], destacado: false, oferta: null },
    { id: 13, sku: "CM1160B", nombre: "Cafetera Black+Decker 12 tazas programable", categoria: "Cocina", precio: 999, stock: 14,
      imagen: "imagenes/productos/cafetera.jpg",
      descripcion: "Cafetera programable de 12 tazas con pantalla digital y canasta lavable, para tener tu café listo a la hora que elijas.",
      peso: "2 kg (aprox.)", dimensiones: "31 × 21 × 28 cm (aprox.)", variantes: [], destacado: false, oferta: null },
    { id: 14, sku: "AF101", nombre: "Freidora de aire Ninja 3.8 L (4 qt)", categoria: "Cocina", precio: 1799, stock: 7,
      imagen: "imagenes/productos/freidora-de-aire.jpg",
      descripcion: "Freidora de aire de 4 cuartos (3.8 L) y 1,550 W con canasta antiadherente de cerámica, para cocinar con poco o nada de aceite.",
      peso: "4.8 kg (aprox.)", dimensiones: "28 × 34 × 34 cm (aprox.)", variantes: [], destacado: false, oferta: null },
    { id: 15, sku: "TO1313SBD", nombre: "Horno eléctrico Black+Decker 4 rebanadas", categoria: "Cocina", precio: 1399, stock: 0,
      imagen: "imagenes/productos/horno-electrico.jpg",
      descripcion: "Horno eléctrico de mesa de 1,150 W para 4 rebanadas de pan o una pizza de 9 pulgadas. Hornea, asa, tuesta y mantiene caliente; incluye temporizador de 30 minutos y charola de migajas.",
      peso: "2.3 kg (aprox.)", dimensiones: "39 × 28 × 21 cm (aprox.)", variantes: [], destacado: false, oferta: null }
];

const FAQ = [
    { p: "¿Necesito una cuenta para comprar?",
      r: "Sí. Para comprar debes crear una cuenta o iniciar sesión (y ser mayor de 18 años). Puedes explorar el catálogo y llenar el carrito sin cuenta." },
    { p: "¿Los precios incluyen IVA?",
      r: "Sí. Todos los precios están en pesos mexicanos (MXN) e incluyen el IVA del 16 %. El costo de envío se muestra antes de pagar y también incluye IVA." },
    { p: "¿Cómo se paga? ¿Guardan los datos de mi tarjeta?",
      r: "Esta tienda de demostración usa un pago simulado (sandbox): no se hace ningún cobro real y la tienda no pide, recibe ni guarda números de tarjeta, CVV ni contraseñas bancarias." },
    { p: "¿Cuánto tarda mi pedido y cuánto cuesta el envío?",
      r: "Depende de tu código postal y del método elegido. Antes de pagar verás el costo y el plazo estimado. Los plazos son estimados y no están garantizados." },
    { p: "¿Cómo doy seguimiento a mi pedido?",
      r: "Con el botón “Seguimiento” escribe tu folio y el correo que usaste al comprar. También puedes verlo en Mi cuenta → Pedidos. Cuando el pedido sale, verás la paquetería y la guía." },
    { p: "¿Puedo cancelar mi pedido?",
      r: "Sí, desde Mi cuenta → Pedidos mientras el pedido esté en estado Pagado o Preparando. Si ya fue enviado, solicita una devolución cuando lo recibas." },
    { p: "¿Cómo solicito una devolución, cambio o garantía?",
      r: "En Mi cuenta → Pedidos, abre el pedido entregado y elige “Solicitar devolución o garantía”. Recibirás un folio y podrás consultar su estado. Consulta las políticas completas en el pie de página." },
    { p: "¿Puedo pedir factura?",
      r: "Puedes registrar una solicitud de factura con el botón “Solicitar factura” del pie de página, hasta el último día del mes de tu compra. Esta tienda académica no emite CFDI válidos." },
    { p: "¿Cómo contacto a la tienda?",
      r: `Con el formulario de contacto de esta ventana, por correo (${EMPRESA.correo}) o por teléfono (${EMPRESA.telefono}), ${EMPRESA.horario.charAt(0).toLowerCase() + EMPRESA.horario.slice(1)}. Cada solicitud recibe un folio de atención.` }
];
