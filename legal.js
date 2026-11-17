"use strict";
/* ============================================================
   legal.js — Políticas y avisos de la tienda (texto informativo).
   Se generan desde EMPRESA / POLITICAS / ZONAS_ENVIO para que lo que
   se promete coincida con lo que el sistema realmente hace.
   AVISO: material académico; no constituye asesoría jurídica. Antes de
   operar una tienda real hay que revisar los textos vigentes de la LFPC,
   la LFPDPPP y las disposiciones fiscales con un profesional.
   ============================================================ */
const TEXTOS_LEGALES = (() => {
    const { esc } = UI;
    const P = POLITICAS, E = EMPRESA;
    const m = n => "$" + n.toLocaleString("es-MX") + " MXN";
    const zonas = () => `<table class="tabla-legal"><thead><tr><th>Zona (2 primeros dígitos del C.P.)</th><th>Costo estándar</th><th>Plazo estimado</th></tr></thead><tbody>${
        ZONAS_ENVIO.map(z => `<tr><td>${z.nombre}: ${String(z.desde).padStart(2, "0")}–${String(z.hasta).padStart(2, "0")}</td><td>${m(z.costo)}</td><td>${z.plazo}</td></tr>`).join("")}</tbody></table>`;
    const datosEmpresa = `<p><strong>${esc(E.razonSocial)}</strong> (nombre comercial: ${esc(E.nombreComercial)})<br>RFC: ${esc(E.rfc)}<br>Domicilio: ${esc(E.domicilio)}<br>Correo: ${esc(E.correo)} · Teléfono: ${esc(E.telefono)}<br>Horario de atención: ${esc(E.horario)}</p><p class="nota-legal">${esc(E.aclaracion)}</p>`;
    const version = `<p class="nota-legal">Versión ${P.version} · vigente desde ${P.fechaVersion}. Texto académico informativo; no es asesoría jurídica.</p>`;

    return {
        avisoLegal: {
            titulo: "Aviso legal e identificación del proveedor",
            cuerpo: () => `
                <p>Conforme a la Ley Federal de Protección al Consumidor (LFPC), en particular su artículo 76 Bis, el proveedor se identifica así:</p>
                ${datosEmpresa}
                <h3>Naturaleza del sitio</h3>
                <p>Este sitio es un <strong>proyecto académico de demostración</strong>. No existe cobro real ni envío real de mercancía. Las políticas describen cómo operaría la tienda si fuera real.</p>
                <h3>Edad mínima</h3>
                <p>Para crear una cuenta y comprar debes ser <strong>mayor de 18 años</strong> (capacidad legal para contratar). Si eres menor de edad, pide a una persona adulta que realice la compra.</p>
                <h3>Procedimiento de compra</h3>
                <p>Explorar el catálogo → agregar al carrito → iniciar sesión → capturar contacto y entrega → revisar el resumen → aceptar términos → pago de prueba → folio de pedido.</p>${version}`
        },
        terminos: {
            titulo: "Términos y condiciones de venta",
            cuerpo: () => `
                <h3>1. Precios, moneda e impuestos</h3>
                <p>Todos los precios están en <strong>pesos mexicanos (MXN)</strong> e <strong>incluyen el IVA (16 %)</strong>. El costo de envío, que también incluye IVA, se muestra antes de pagar. El total del resumen es el importe final a pagar.</p>
                <h3>2. Disponibilidad e inventario</h3>
                <p>Las existencias se verifican al confirmar el pedido. Si un producto se agota antes de pagar, el sistema lo indicará y no permitirá la compra. Máximo ${P.maxPorProducto} unidades por producto y por pedido.</p>
                <h3>3. Pago</h3>
                <p>El pago se realiza mediante un <strong>entorno de pruebas (sandbox)</strong> simulado. La tienda <strong>no solicita, recibe ni almacena</strong> números de tarjeta, CVV ni contraseñas bancarias.</p>
                <h3>4. Cuenta y pedido</h3>
                <p>Para comprar se requiere una cuenta. Al confirmar, el sistema registra tu aceptación (versión de estos términos, fecha y hora, y folio del pedido) como evidencia. La casilla de aceptación nunca viene marcada.</p>
                <h3>5. Errores de precio o existencias</h3>
                <p>Si por un error evidente de captura el precio publicado fuera incorrecto, o el producto no pudiera surtirse, el proveedor podrá cancelar el pedido y <strong>reembolsará el importe pagado</strong> por el mismo método de pago, informándote por los datos de contacto que proporcionaste.</p>
                <h3>6. Entrega, cancelación, devoluciones y garantías</h3>
                <p>Se rigen por las políticas de Envíos, Cancelaciones, Devoluciones y Garantías publicadas en este sitio, que forman parte de estos términos.</p>
                <h3>7. Facturación</h3>
                <p>Puedes registrar una solicitud de factura hasta el último día del mes de tu compra. Este sitio académico no emite CFDI válidos.</p>
                <h3>8. Propiedad intelectual</h3>
                <p>Los nombres, textos e imágenes del sitio son de uso académico. No se concede licencia para reproducirlos con fines comerciales.</p>
                <h3>9. Cambios y controversias</h3>
                <p>Los cambios a estos términos se publicarán con nueva versión y fecha; cada pedido conserva la versión aceptada. Para controversias, el consumidor puede acudir a la Procuraduría Federal del Consumidor (PROFECO).</p>${version}`
        },
        envios: {
            titulo: "Política de envíos y entrega",
            cuerpo: () => `
                <h3>Cobertura</h3>
                <p>Envíos a toda la República Mexicana con código postal válido (01000 a 99999). No se realizan envíos al extranjero. Los productos que requieren instalación (aire acondicionado, estufa de gas) se entregan sin instalar.</p>
                <h3>Métodos de entrega</h3>
                <ul><li><strong>Paquetería estándar:</strong> costo y plazo según tu zona (tabla siguiente).</li><li><strong>Paquetería express:</strong> costo de zona + ${m(150)}; plazo estimado de 1 a 3 días hábiles.</li><li><strong>Recolección en tienda:</strong> sin costo, en el domicilio del proveedor; disponible de 1 a 2 días hábiles después del pago.</li></ul>
                ${zonas()}
                <p>Los plazos son <strong>estimados</strong>, se cuentan desde que el pedido sale del almacén y no están garantizados. El costo y el plazo se muestran antes de confirmar el pedido.</p>
                <h3>Embalaje y despacho</h3>
                <p>Cada pedido se prepara, se embala, se etiqueta y se entrega a la paquetería. Al enviarlo se registra la paquetería y la <strong>guía de rastreo</strong>, visibles en “Seguimiento”.</p>
                <h3>Incidencias</h3>
                <p>Si hay un intento de entrega fallido, dirección incorrecta, retraso o paquete dañado, el proveedor lo registra en el pedido y se pone en contacto contigo. Si el paquete no puede entregarse, puede regresar al remitente y se reembolsará el importe pagado. <strong>Revisa el paquete al recibirlo</strong> y reporta cualquier daño dentro de los primeros días.</p>${version}`
        },
        cancelaciones: {
            titulo: "Política de cancelación",
            cuerpo: () => `
                <h3>¿Cuándo puedo cancelar?</h3>
                <p>Puedes cancelar tu pedido <strong>desde Mi cuenta → Pedidos</strong> mientras esté en estado <strong>Pagado</strong> o <strong>Preparando</strong>. Una vez que el pedido es <strong>Enviado</strong> ya no puede cancelarse; cuando lo recibas puedes solicitar una devolución (ver política de devoluciones).</p>
                <h3>¿Qué ocurre al cancelar?</h3>
                <p>El pedido pasa a “Cancelado”, las piezas regresan al inventario y se registra el <strong>reembolso del importe total pagado</strong> al método de pago original. En un sistema real el abono depende de la institución emisora (normalmente de 5 a 10 días hábiles); en esta demostración el reembolso queda registrado de inmediato.</p>
                <h3>Cancelación por parte de la tienda</h3>
                <p>El proveedor puede cancelar por falta de existencias o error evidente de precio; en ese caso reembolsa el importe y te informa.</p>${version}`
        },
        devoluciones: {
            titulo: "Política de devoluciones y cambios",
            cuerpo: () => `
                <p>Esta política <strong>no limita los derechos que la ley te otorga</strong>; solo describe el procedimiento y los plazos operativos.</p>
                <h3>Procedimiento</h3>
                <ol><li>Entra a <strong>Mi cuenta → Pedidos</strong>, abre el pedido y elige “Solicitar devolución o garantía”.</li><li>Selecciona los productos, el motivo y describe el problema (puedes anotar número de serie o detalles de las evidencias).</li><li>El sistema genera un <strong>folio</strong> (DEV-…) y te lo muestra como acuse de recepción.</li><li>Soporte revisa tu compra, plazo y evidencia y responde en un máximo de ${P.respuestaSoporteHoras} horas hábiles: autoriza (con instrucciones de recolección o envío) o rechaza con una explicación.</li><li>Si se autoriza, se recibe e inspecciona el producto y se resuelve con <strong>reembolso, cambio o reposición</strong>. Se actualizan el pedido, el inventario, el movimiento financiero y la bitácora, y se te notifica.</li></ol>
                <h3>Supuestos y plazos</h3>
                <ul><li><strong>Revocación del consentimiento (art. 56 LFPC):</strong> hasta ${P.diasRevocacionHabiles} días hábiles contados desde que recibes el producto.</li><li><strong>Defectuoso, dañado en tránsito, incorrecto o incompleto:</strong> dentro del periodo de garantía (${P.diasGarantia} días naturales desde la entrega).</li><li><strong>No recibido:</strong> cuando el pedido figure como enviado y no llegue en el plazo estimado.</li><li><strong>Devolución voluntaria por cortesía:</strong> hasta ${P.diasCortesia} días naturales desde la entrega, sujeta a aprobación; es independiente de tus derechos legales.</li></ul>
                <h3>Condiciones del producto</h3>
                <p>Conviene devolver el producto con su empaque, accesorios y número de serie, pero la falta de caja original <strong>no será motivo automático de rechazo</strong>. Se rechazará únicamente con una explicación fundada.</p>
                <h3>Costo del envío de regreso</h3>
                <p>En los casos de producto defectuoso, dañado, incorrecto, incompleto o no recibido, el proveedor cubre el envío de regreso y reembolsa también el envío original si se devuelve todo el pedido. En arrepentimiento o devolución por cortesía, el envío de regreso corre por cuenta del cliente, salvo que la ley indique otra cosa.</p>
                <h3>Reembolso</h3>
                <p>Se hace al método de pago original por el importe proporcional pagado (considerando el cupón usado). Plazo estimado: de 5 a 10 días hábiles en un sistema real.</p>${version}`
        },
        garantias: {
            titulo: "Garantías",
            cuerpo: () => `
                <h3>Duración y cobertura</h3>
                <p>Los electrodomésticos cuentan con garantía por <strong>defectos de fabricación y de funcionamiento</strong> de <strong>no menos de ${P.diasGarantia} días naturales</strong> contados desde la entrega (LFPC, arts. 77 y 78). Si el fabricante otorga una garantía mayor, se aplicará la mayor y se entregará la póliza correspondiente.</p>
                <h3>Exclusiones válidas</h3>
                <p>Daños por mal uso, instalación incorrecta por terceros, golpes o líquidos ajenos al uso normal, fallas de suministro eléctrico o de gas, y modificaciones no autorizadas.</p>
                <h3>Procedimiento</h3>
                <p>Solicita la garantía desde <strong>Mi cuenta → Pedidos → Solicitar devolución o garantía</strong> (motivo “Producto defectuoso”) o escribe a ${esc(E.correo)}. Proveedor responsable: ${esc(E.razonSocial)}, ${esc(E.domicilio)}.</p>
                <h3>Remedios</h3>
                <p>Según corresponda: reparación, reposición del producto, cambio o devolución del dinero, conforme a la ley.</p>${version}`
        },
        promociones: {
            titulo: "Promociones y cupones",
            cuerpo: () => {
                const c = Servidor.cuponesPublicos();
                return `
                <h3>Ofertas de producto</h3>
                <p>Cuando un producto muestra una oferta, se indica el <strong>precio anterior tachado</strong>, el precio vigente y la fecha de vigencia. El precio que ves es el que se cobra.</p>
                <h3>Cupones</h3>
                <p>Los cupones se validan al calcular tu total, tienen vigencia, compra mínima y límite de usos, y no son acumulables entre sí (un cupón por pedido). Se aplican sobre el importe de los productos (no sobre el envío).</p>
                ${c.length ? `<table class="tabla-legal"><thead><tr><th>Código</th><th>Beneficio</th><th>Vigencia</th><th>Condiciones</th></tr></thead><tbody>${c.map(x => `<tr><td><strong>${esc(x.codigo)}</strong></td><td>${x.tipo === "porcentaje" ? x.valor + " % de descuento" : m(x.valor) + " de descuento"}</td><td>${esc(x.desde)} al ${esc(x.hasta)}</td><td>${x.minimoCompra ? "Compra mínima " + m(x.minimoCompra) + ". " : ""}${x.usosPorUsuario ? "Máximo " + x.usosPorUsuario + " uso(s) por cuenta." : "Sin límite por cuenta."}</td></tr>`).join("")}</tbody></table>` : "<p>No hay cupones públicos vigentes por ahora.</p>"}${version}`;
            }
        },
        quejas: {
            titulo: "Atención al cliente, quejas y controversias",
            cuerpo: () => `
                <h3>Canales</h3>
                <p>Formulario de contacto (Ayuda → Contacto), correo ${esc(E.correo)} o teléfono ${esc(E.telefono)}. Horario: ${esc(E.horario)}.</p>
                <h3>Folio de atención y plazo</h3>
                <p>Cada duda, aclaración, queja o reclamación recibe un <strong>folio (AT-…)</strong>. Nuestro objetivo es responder en un máximo de <strong>${P.respuestaSoporteHoras} horas hábiles</strong>. Si tu caso no se resuelve, se escala a una persona responsable de soporte y se registra la resolución.</p>
                <h3>Seguridad</h3>
                <p>Nunca te pediremos por chat o correo tu contraseña, CVV ni datos completos de tarjeta.</p>
                <h3>Controversias</h3>
                <p>Si no queda resuelta tu inconformidad, puedes acudir a la Procuraduría Federal del Consumidor (PROFECO) o a su plataforma de conciliación (Concilianet).</p>${version}`
        },
        privacidad: {
            titulo: "Aviso de privacidad integral",
            cuerpo: () => `
                <p>Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) vigente.</p>
                <h3>Responsable</h3>${datosEmpresa}
                <h3>Datos que tratamos</h3>
                <p>Nombre, correo electrónico, teléfono, domicilio de entrega, historial de pedidos y datos de la cuenta (usuario y contraseña protegida con hash). <strong>No recabamos ni almacenamos datos bancarios</strong> (número de tarjeta, CVV ni contraseñas financieras). Para facturación solo se solicitan los datos fiscales estrictamente necesarios.</p>
                <h3>Finalidades necesarias</h3>
                <p>Crear y administrar tu cuenta, procesar y entregar tus pedidos, atender cancelaciones, devoluciones y garantías, cumplir obligaciones legales y brindarte atención al cliente.</p>
                <h3>Finalidades opcionales</h3>
                <p>Enviarte promociones y novedades. <strong>Solo si lo autorizas</strong> con una casilla separada (nunca premarcada); puedes retirarlo en Mi cuenta → Perfil.</p>
                <h3>Transferencias</h3>
                <p>Para entregar tu pedido se comparten el nombre, el teléfono y el domicilio con la paquetería. En un sistema real, el pago lo procesaría un proveedor externo certificado. No vendemos tus datos.</p>
                <h3>Derechos ARCO y medios para limitar el uso</h3>
                <p>Puedes ejercer tus derechos de <strong>Acceso, Rectificación, Cancelación y Oposición</strong>, o limitar el uso o divulgación de tus datos, escribiendo a ${esc(E.correoPrivacidad)} con tu nombre, medio de contacto y descripción de lo solicitado. También puedes editar tus datos en Mi cuenta.</p>
                <h3>Almacenamiento local y cookies</h3>
                <p>Este sitio usa el almacenamiento local de tu navegador para recordar tu carrito, tu sesión y tu preferencia sobre este aviso. <strong>No usa cookies de publicidad ni de terceros.</strong></p>
                <h3>Conservación y cambios</h3>
                <p>Los datos de pedidos se conservan el tiempo necesario para atender garantías y obligaciones legales. Los cambios a este aviso se publican en esta página con nueva versión y fecha.</p>${version}`
        },
        facturacion: {
            titulo: "Facturación",
            cuerpo: () => `
                <p>Puedes <strong>registrar una solicitud de factura</strong> con el botón “Solicitar factura” del pie de página. Necesitas: folio del pedido, el correo usado en la compra, RFC, razón social, régimen fiscal, uso de CFDI y código postal fiscal. No se piden otros datos.</p>
                <p><strong>Plazo:</strong> hasta el último día del mes en que realizaste la compra.</p>
                <p class="nota-legal"><strong>Importante:</strong> esta tienda académica <strong>no está integrada con el SAT ni con un proveedor de timbrado</strong>, por lo que <strong>no emite CFDI válidos</strong>. La solicitud solo queda registrada para que el negocio la atienda por su proceso fiscal.</p>${version}`
        }
    };
})();
