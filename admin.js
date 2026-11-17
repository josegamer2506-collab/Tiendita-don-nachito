"use strict";
/* ============================================================
   admin.js — Panel administrativo (admin.html)
   Acceso solo para roles admin y soporte. Cada operación vuelve a
   comprobar el permiso en servidor.js; aquí solo se oculta lo que
   el rol no puede usar.
   ============================================================ */
(async function admin() {
    const { $, $$, html, raw, pintar, mxn, fecha, fechaCorta, aviso, abrir, cerrar, modal, cerrarModal, confirmar } = UI;
    const clase = s => String(s).replace(/\s+/g, "-");
    const msgError = e => e instanceof Servidor.ErrorApi ? e.message : (console.error(e), "Ocurrió un error inesperado.");
    const mensaje = (el, t, tipo = "error") => { el.textContent = t; el.className = "mensaje-form " + (t ? tipo : ""); };
    const badge = e => html`<span class="estado ${clase(e)}">${e}</span>`;
    const hoy = () => new Date().toISOString().slice(0, 10);
    let usuario = null, seccion = "dashboard";

    try { await Servidor.iniciar(); } catch (e) { $("#adminAcceso").textContent = "No se pudo iniciar: datos locales no disponibles."; console.error(e); return; }

    /* ---------------- Utilidades de interfaz ---------------- */
    function tabla(cols, filas, vacio = "Sin registros.", opciones = {}) {
        if (!filas.length) return html`<p class="lista-vacia">${vacio}</p>`;
        return html`<div class="tabla-scroll" tabindex="0"><table class="tabla-admin"><thead><tr>${cols.map(c => html`<th scope="col">${c.t}</th>`)}</tr></thead>
            <tbody>${filas.map(f => html`<tr class="${opciones.clase ? opciones.clase(f) : ""}">${cols.map(c => html`<td>${c.k(f)}</td>`)}</tr>`)}</tbody></table></div>`;
    }
    function campoHTML(c, v) {
        const id = "f_" + c.id, val = v ?? c.valor ?? "";
        const ayuda = c.ayuda ? html`<small>${c.ayuda}</small>` : "";
        if (c.tipo === "checkbox") return html`<label class="check"><input type="checkbox" id="${id}" ${val ? "checked" : ""}> ${c.label}</label>`;
        if (c.tipo === "textarea") return html`<div class="campo"><label for="${id}">${c.label}</label><textarea id="${id}" rows="3" maxlength="${c.max || 500}">${val}</textarea>${ayuda}</div>`;
        if (c.tipo === "select") return html`<div class="campo"><label for="${id}">${c.label}</label><select id="${id}">${c.opciones.map(o => { const [ov, ot] = Array.isArray(o) ? o : [o, o]; return html`<option value="${ov}" ${String(ov) === String(val) ? "selected" : ""}>${ot}</option>`; })}</select>${ayuda}</div>`;
        return html`<div class="campo"><label for="${id}">${c.label}</label><input id="${id}" type="${c.tipo || "text"}" ${c.step ? raw(`step="${c.step}"`) : ""} ${c.min !== undefined ? raw(`min="${c.min}"`) : ""} maxlength="${c.max || 200}" value="${val}">${ayuda}</div>`;
    }
    /* Formulario modal genérico. `enviar(valores)` puede lanzar ErrorApi: se muestra sin cerrar. */
    function formulario({ titulo, campos, valores = {}, ok = "Guardar", nivel = 1, enviar, intro }) {
        const cont = modal({
            nivel, titulo, cuerpo: html`${intro ? html`<p class="nota">${intro}</p>` : ""}<form novalidate>
                ${campos.map(c => campoHTML(c, valores[c.id]))}<p class="mensaje-form" role="alert"></p><button type="submit" class="btn-siguiente">${ok}</button></form>`
        });
        const f = $("form", cont);
        f.addEventListener("submit", async e => {
            e.preventDefault();
            const v = {};
            campos.forEach(c => { const el = $("#f_" + c.id, f); v[c.id] = c.tipo === "checkbox" ? el.checked : el.value; });
            try { await enviar(v); cerrarModal(nivel); } catch (err) { mensaje($(".mensaje-form", f), msgError(err)); }
        });
    }

    /* ---------------- Acceso y navegación ---------------- */
    const SECCIONES = [
        { id: "dashboard", t: "📊 Dashboard", p: "reportes.ver", f: renderDashboard },
        { id: "pedidos", t: "🧾 Pedidos", p: "pedidos.ver", f: renderPedidos },
        { id: "devoluciones", t: "↩️ Devoluciones y garantías", p: "devoluciones.gestionar", f: renderDevoluciones },
        { id: "productos", t: "📦 Productos", p: "productos.editar", f: renderProductos },
        { id: "categorias", t: "🗂️ Categorías", p: "productos.editar", f: renderCategorias },
        { id: "inventario", t: "🏷️ Inventario", p: "inventario.ajustar", f: renderInventario },
        { id: "clientes", t: "👥 Clientes y usuarios", p: "clientes.ver", f: renderClientes },
        { id: "promociones", t: "🎟️ Promociones", p: "promociones.gestionar", f: renderPromociones },
        { id: "atencion", t: "💬 Atención y facturas", p: "atencion.gestionar", f: renderAtencion },
        { id: "reportes", t: "📈 Reportes", p: "reportes.ver", f: renderReportes },
        { id: "auditoria", t: "🕵️ Bitácora", p: "auditoria.ver", f: renderAuditoria }
    ];
    const permitidas = () => SECCIONES.filter(s => Servidor.tiene(usuario, s.p));

    function pantallaAcceso() {
        $("#adminApp").hidden = true;
        $("#adminSalir").hidden = !usuario;
        $("#adminUsuario").textContent = usuario ? `👤 ${usuario.nombre} (${usuario.rol})` : "";
        const a = $("#adminAcceso");
        a.hidden = false;
        if (usuario) {
            a.className = "admin-acceso acceso-denegado";
            pintar(a, html`<h2>403 — Acceso denegado</h2><p>Tu cuenta (<strong>${usuario.usuario}</strong>, rol <strong>${usuario.rol}</strong>) no tiene permisos administrativos.</p><p><a class="btn-siguiente enlace-bloque" href="index.html">Volver a la tienda</a></p>`);
            return;
        }
        a.className = "admin-acceso";
        pintar(a, html`<h2>Acceso al panel</h2><p class="nota">Solo personal autorizado (roles administrador y soporte).</p>
            <form id="formAdminLogin" novalidate>
                <div class="campo"><label for="adminUser">Usuario o correo</label><input id="adminUser" autocomplete="username" maxlength="120"></div>
                <div class="campo"><label for="adminClave">Contraseña</label><input id="adminClave" type="password" autocomplete="current-password" maxlength="128"></div>
                <p id="mensajeAdminLogin" class="mensaje-form" role="alert"></p>
                <button type="submit" class="btn-siguiente">Iniciar sesión</button>
            </form>`);
        $("#formAdminLogin").addEventListener("submit", async e => {
            e.preventDefault();
            try { await Servidor.iniciarSesion($("#adminUser").value, $("#adminClave").value); arrancar(); }
            catch (err) { mensaje($("#mensajeAdminLogin"), msgError(err)); }
        });
    }
    function arrancar() {
        usuario = Servidor.sesionActual();
        if (!usuario || !permitidas().length) return pantallaAcceso();
        $("#adminAcceso").hidden = true;
        $("#adminApp").hidden = false;
        $("#adminSalir").hidden = false;
        $("#adminUsuario").textContent = `👤 ${usuario.nombre} (${usuario.rol})`;
        const ok = permitidas();
        pintar($("#adminMenu"), html`${ok.map(s => html`<a href="#${s.id}" data-sec="${s.id}">${s.t}</a>`)}`);
        render();
    }
    function render() {
        const ok = usuario ? permitidas() : [];
        if (!ok.length) return pantallaAcceso();
        const id = (location.hash || "").slice(1);
        const s = ok.find(x => x.id === id) || ok[0];
        seccion = s.id;
        $$("#adminMenu a").forEach(a => { if (a.dataset.sec === seccion) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
        const cont = $("#adminContenido");
        try { s.f(cont); } catch (err) {
            if (err.estado === 401) { usuario = null; pantallaAcceso(); aviso("Tu sesión expiró. Inicia sesión de nuevo.", "info"); return; }
            pintar(cont, html`<p class="mensaje-error" role="alert">${msgError(err)}</p>`);
        }
    }
    window.addEventListener("hashchange", () => { UI.cerrarTodos(); if (usuario) { render(); $("#adminContenido").focus(); } });
    $("#adminSalir").onclick = () => { Servidor.cerrarSesion(); usuario = null; pantallaAcceso(); };
    ["click", "keydown"].forEach(ev => document.addEventListener(ev, () => usuario && Servidor.tocarSesion(), true));
    setInterval(() => { if (usuario && !Servidor.sesionActual()) { usuario = null; pantallaAcceso(); aviso("⏱️ Tu sesión expiró por inactividad.", "info", 8000); } }, 15000);

    /* ---------------- Dashboard ---------------- */
    function renderDashboard(c) {
        const d = Servidor.dashboard();
        pintar(c, html`<h2>Dashboard</h2>
            <div class="kpis">
                <div class="kpi"><small>Ventas netas (IVA incl.)</small><strong>${mxn(d.ventasNetas)}</strong></div>
                <div class="kpi"><small>Pedidos</small><strong>${d.pedidos}</strong></div>
                <div class="kpi"><small>Ticket promedio</small><strong>${mxn(d.ticketPromedio)}</strong></div>
                <div class="kpi"><small>Reembolsos</small><strong>${mxn(d.reembolsos)}</strong></div>
                <div class="kpi ${d.devolucionesAbiertas ? "alerta" : ""}"><small>Devoluciones abiertas</small><strong>${d.devolucionesAbiertas}</strong></div>
                <div class="kpi ${d.ticketsAbiertos ? "alerta" : ""}"><small>Folios de atención abiertos</small><strong>${d.ticketsAbiertos}</strong></div>
            </div>
            <div class="dos-columnas">
                <section><h3>Pedidos por estado</h3>${tabla([{ t: "Estado", k: r => badge(r[0]) }, { t: "Pedidos", k: r => r[1] }], Object.entries(d.porEstado))}</section>
                <section><h3>Productos más vendidos</h3>${tabla([{ t: "Modelo", k: r => r.sku }, { t: "Producto", k: r => r.nombre }, { t: "Unidades", k: r => r.unidades }, { t: "Importe", k: r => mxn(r.importe) }], d.masVendidos, "Aún no hay ventas.")}</section>
                <section><h3>⚠️ Alertas de stock bajo (≤ ${POLITICAS.stockBajo})</h3>${tabla([{ t: "Modelo", k: r => r.sku }, { t: "Producto", k: r => r.nombre }, { t: "Existencias", k: r => html`<span class="etiqueta-alerta">${r.stock}</span>` }], d.stockBajo, "Sin alertas.")}</section>
            </div>
            ${Servidor.tiene(usuario, "usuarios.administrar") ? html`<hr><p class="nota">Zona de pruebas: restablece catálogo, usuarios demo, pedidos e inventario a su estado inicial.</p><button type="button" class="btn-secundario" data-accion="reset">Restablecer datos de demostración</button>` : ""}`);
    }

    /* ---------------- Pedidos ---------------- */
    const estPed = { estado: "", texto: "" };
    function renderPedidos(c) {
        const ps = Servidor.listarPedidos(estPed);
        pintar(c, html`<h2>Pedidos</h2>
            <div class="barra-herramientas">
                <div class="campo"><label for="filtroEstadoPed">Estado</label><select id="filtroEstadoPed"><option value="">Todos</option>${Servidor.ESTADOS_PEDIDO.map(e => html`<option ${estPed.estado === e ? "selected" : ""}>${e}</option>`)}</select></div>
                <div class="campo"><label for="filtroTextoPed">Buscar (folio, cliente, correo)</label><input id="filtroTextoPed" value="${estPed.texto}"></div>
            </div>
            ${tabla([{ t: "Folio", k: p => p.folio }, { t: "Fecha", k: p => fecha(p.creado) }, { t: "Cliente", k: p => p.contacto.nombre }, { t: "Estado", k: p => badge(p.estado) }, { t: "Total", k: p => mxn(p.total) },
                { t: "Acciones", k: p => html`<button type="button" class="principal" data-accion="ver-pedido" data-folio="${p.folio}">Ver / gestionar</button>` }], ps, "No hay pedidos con esos filtros.")}`);
        $("#filtroEstadoPed").onchange = e => { estPed.estado = e.target.value; render(); };
        $("#filtroTextoPed").onchange = e => { estPed.texto = e.target.value; render(); };
    }
    function verPedido(folio) {
        const p = Servidor.obtenerPedido(folio), sig = Servidor.TRANSICIONES[p.estado] || [], a = p.entrega.direccion, pg = p.pagoDetalle;
        modal({
            titulo: `Pedido ${p.folio}`, cuerpo: html`
            <p>${badge(p.estado)} · ${fecha(p.creado)}</p>
            <p><strong>Cliente:</strong> ${p.contacto.nombre} · ${p.contacto.correo} · ${p.contacto.telefono} (usuario ${p.usuario})</p>
            <p><strong>Entrega:</strong> ${p.entrega.etiqueta} · ${p.entrega.plazo}<br>${a ? `${a.destinatario}, ${a.calle}, ${a.colonia}, ${a.municipio}, ${a.estado}, C.P. ${a.cp}` : "Recolección en tienda"}</p>
            ${p.guia ? html`<p><strong>Paquetería:</strong> ${p.guia.paqueteria} · <strong>Guía:</strong> ${p.guia.numero}</p>` : ""}
            ${tabla([{ t: "Modelo", k: l => l.sku }, { t: "Producto", k: l => l.nombre + (l.variante ? " (" + l.variante + ")" : "") }, { t: "Cant.", k: l => l.cantidad }, { t: "P. unit.", k: l => mxn(l.precioUnitario) }, { t: "Total", k: l => mxn(l.total) }], p.lineas)}
            <p>Subtotal ${mxn(p.subtotal)} · Descuento ${mxn(p.descuento)}${p.cupon ? " (" + p.cupon + ")" : ""} · Envío ${mxn(p.envio)} · <strong>Total ${mxn(p.total)}</strong> (IVA incl. ${mxn(p.ivaIncluido)})</p>
            <p><strong>Pago:</strong> ${p.pago.metodo} (sandbox) · ${pg.referencia} · ${badge(pg.estado)}${pg.reembolsado ? " · reembolsado " + mxn(pg.reembolsado) : ""}</p>
            <p class="nota">Términos y privacidad aceptados: versión ${p.terminos.version}, ${fecha(p.terminos.aceptadoEn)}.</p>
            <h3>Bitácora del pedido</h3>
            <ol class="linea-tiempo">${p.historial.map(h => html`<li><strong>${h.estado}</strong><small>${fecha(h.fecha)} · ${h.actor}${h.nota ? " — " + h.nota : ""}</small></li>`)}</ol>
            ${p.devoluciones.length ? html`<p><strong>Devoluciones:</strong> ${p.devoluciones.map(d => d.folio + " (" + d.estado + ")").join(", ")}</p>` : ""}
            <div class="fila-acciones">
                ${sig.length ? html`<button type="button" class="principal" data-accion="estado-pedido" data-folio="${p.folio}">Cambiar estado</button>` : ""}
                ${["Preparando", "Enviado"].includes(p.estado) ? html`<button type="button" data-accion="incidencia" data-folio="${p.folio}">Registrar incidencia</button>` : ""}
            </div>`
        });
    }
    function cambiarEstadoPedido(folio) {
        const p = Servidor.obtenerPedido(folio), sig = Servidor.TRANSICIONES[p.estado];
        formulario({
            nivel: 2, titulo: `Cambiar estado de ${folio}`, ok: "Aplicar cambio", intro: `Estado actual: ${p.estado}. Solo se permiten las transiciones válidas. Cancelar o devolver al remitente reembolsa y repone el inventario.`,
            campos: [{ id: "estado", label: "Nuevo estado", tipo: "select", opciones: sig }, { id: "paqueteria", label: "Paquetería (obligatoria al pasar a Enviado)", max: 40 }, { id: "guia", label: "Número de guía (obligatorio al pasar a Enviado)", max: 30 }, { id: "nota", label: "Nota (opcional)", max: 200 }],
            enviar: v => { Servidor.cambiarEstadoPedido(folio, v.estado, v); aviso("✅ Estado actualizado.", "exito", 3000); verPedido(folio); render(); }
        });
    }

    /* ---------------- Devoluciones ---------------- */
    function renderDevoluciones(c) {
        const ds = Servidor.listarDevoluciones();
        pintar(c, html`<h2>Devoluciones y garantías</h2>
            <p class="nota">Flujo: Solicitada → En revisión → Autorizada → Recibida → Resuelta (o Rechazada con explicación). Cada paso queda en bitácora y se notifica al cliente.</p>
            ${tabla([{ t: "Folio", k: d => d.folio }, { t: "Pedido", k: d => d.pedido }, { t: "Motivo", k: d => d.motivoTexto }, { t: "Fecha", k: d => fecha(d.creado) }, { t: "Estado", k: d => badge(d.estado) },
                { t: "Acciones", k: d => html`<button type="button" class="principal" data-accion="ver-dev" data-folio="${d.folio}">Gestionar</button>` }], ds, "No hay solicitudes.")}`);
    }
    function verDevolucion(fd) {
        const d = Servidor.listarDevoluciones().find(x => x.folio === fd);
        const acc = [];
        if (d.estado === "Solicitada") acc.push(["revisar", "Marcar en revisión"]);
        if (["Solicitada", "En revisión"].includes(d.estado)) acc.push(["autorizar", "Autorizar"], ["rechazar", "Rechazar"]);
        if (d.estado === "Autorizada") { if (d.motivo !== "no_recibido") acc.push(["recibir", "Registrar recepción e inspección"]); else acc.push(["resolver", "Resolver"]); }
        if (d.estado === "Recibida") acc.push(["resolver", "Resolver"]);
        modal({
            titulo: `Solicitud ${d.folio}`, cuerpo: html`
            <p>${badge(d.estado)} · Pedido <strong>${d.pedido}</strong> · ${fecha(d.creado)}</p>
            <p><strong>Motivo:</strong> ${d.motivoTexto}</p><p><strong>Descripción del cliente:</strong> ${d.descripcion}</p>
            <p><strong>Productos:</strong> ${d.items.map(i => `${i.cantidad} × ${i.nombre}`).join(", ")}</p>
            ${d.resolucion ? html`<p><strong>Resolución:</strong> ${d.resolucion}${d.reembolso ? " — reembolso " + mxn(d.reembolso) : ""}</p>` : ""}
            <ol class="linea-tiempo">${d.historial.map(h => html`<li><strong>${h.estado}</strong><small>${fecha(h.fecha)} · ${h.actor}${h.nota ? " — " + h.nota : ""}</small></li>`)}</ol>
            <div class="fila-acciones">${acc.map(([k, t]) => html`<button type="button" class="${k === "rechazar" ? "peligro" : "principal"}" data-accion="dev-${k}" data-folio="${d.folio}">${t}</button>`)}</div>`
        });
    }
    function accionDevolucion(accion, fd) {
        const fin = () => { aviso("✅ Solicitud actualizada.", "exito", 3000); verDevolucion(fd); render(); };
        const cfg = {
            revisar: null,
            autorizar: { t: "Autorizar solicitud", campos: [{ id: "instrucciones", label: "Instrucciones para el cliente (recolección o envío de regreso)", tipo: "textarea" }] },
            rechazar: { t: "Rechazar solicitud", campos: [{ id: "explicacion", label: "Explicación fundada de la decisión", tipo: "textarea" }] },
            recibir: { t: "Recepción e inspección", campos: [{ id: "inspeccion", label: "Resultado de la inspección", tipo: "textarea" }, { id: "reingresar", label: "Reingresar las piezas al inventario", tipo: "checkbox" }] },
            resolver: { t: "Resolver solicitud", campos: [{ id: "resolucion", label: "Resolución", tipo: "select", opciones: ["Reembolso", "Cambio", "Reposición"] }] }
        }[accion];
        if (!cfg) { try { Servidor.gestionarDevolucion(fd, accion); fin(); } catch (e) { aviso(msgError(e), "error"); } return; }
        formulario({ nivel: 2, titulo: cfg.t, campos: cfg.campos, enviar: v => { Servidor.gestionarDevolucion(fd, accion, v); fin(); } });
    }

    /* ---------------- Productos y categorías ---------------- */
    const estProd = { texto: "" };
    function renderProductos(c) {
        const t = estProd.texto.toLowerCase();
        const ps = Servidor.listarProductosAdmin().filter(p => !t || (p.nombre + p.sku + p.categoria).toLowerCase().includes(t));
        pintar(c, html`<h2>Productos</h2>
            <div class="barra-herramientas">
                <div class="campo"><label for="buscarProd">Buscar</label><input id="buscarProd" value="${estProd.texto}"></div>
                <button type="button" class="btn-siguiente" data-accion="prod-nuevo">➕ Nuevo producto</button>
            </div>
            ${tabla([{ t: "Modelo", k: p => p.sku }, { t: "Producto", k: p => p.nombre }, { t: "Categoría", k: p => p.categoria },
                { t: "Precio (IVA incl.)", k: p => p.vigente.enOferta ? html`<s>${mxn(p.precio)}</s> ${mxn(p.vigente.precio)} (−${p.vigente.porcentaje}%)` : mxn(p.precio) },
                { t: "Stock", k: p => p.stock }, { t: "Estado", k: p => p.estado },
                { t: "Acciones", k: p => html`<button type="button" data-accion="prod-editar" data-id="${p.id}">Editar</button><button type="button" data-accion="prod-estado" data-id="${p.id}" data-estado="${p.estado === "activo" ? "inactivo" : "activo"}">${p.estado === "activo" ? "Dar de baja" : "Reactivar"}</button>` }], ps, "No hay productos.")}`);
        $("#buscarProd").onchange = e => { estProd.texto = e.target.value; render(); };
    }
    function formProducto(id) {
        const p = id ? Servidor.listarProductosAdmin().find(x => x.id === Number(id)) : null;
        const cats = Servidor.listarCategoriasAdmin().filter(c => c.estado === "activa").map(c => c.nombre);
        const campos = [
            { id: "sku", label: "Modelo (único)", max: 30 }, { id: "nombre", label: "Nombre", max: 80 }, { id: "descripcion", label: "Descripción", tipo: "textarea" },
            { id: "categoria", label: "Categoría", tipo: "select", opciones: cats },
            { id: "precio", label: "Precio de lista en MXN (IVA incluido)", tipo: "number", step: "0.01", min: "0" },
            ...(p ? [] : [{ id: "stock", label: "Existencias iniciales", tipo: "number", step: "1", min: "0", valor: 0 }]),
            { id: "imagen", label: "Imagen (ruta relativa, ej. imagenes/producto.png; vacío = imagen de respaldo)", max: 200 },
            { id: "peso", label: "Peso", max: 40 }, { id: "dimensiones", label: "Dimensiones", max: 60 },
            { id: "variantes", label: "Variantes (separadas por coma)", ayuda: "Ej.: Blanco, Gris. Déjalo vacío si no aplica." },
            { id: "destacado", label: "Producto destacado", tipo: "checkbox" },
            { id: "ofertaPorcentaje", label: "Oferta: % de descuento (vacío = sin oferta)", tipo: "number", step: "1", min: "0" },
            { id: "ofertaHasta", label: "Oferta: vigente hasta", tipo: "date" }
        ];
        const valores = p ? { ...p, variantes: (p.variantes || []).join(", "), ofertaPorcentaje: p.oferta ? p.oferta.porcentaje : "", ofertaHasta: p.oferta ? p.oferta.hasta : "" } : { ofertaHasta: hoy() };
        formulario({
            titulo: p ? `Editar ${p.nombre}` : "Nuevo producto", campos, valores, ok: p ? "Guardar cambios" : "Crear producto",
            enviar: v => {
                Servidor.guardarProducto({ ...v, id: p ? p.id : undefined, oferta: v.ofertaPorcentaje ? { porcentaje: Number(v.ofertaPorcentaje), hasta: v.ofertaHasta } : null });
                aviso("✅ Producto guardado.", "exito", 3000); render();
            }
        });
    }
    function renderCategorias(c) {
        const cs = Servidor.listarCategoriasAdmin(), ps = Servidor.listarProductosAdmin();
        pintar(c, html`<h2>Categorías</h2>
            <div class="barra-herramientas"><button type="button" class="btn-siguiente" data-accion="cat-nueva">➕ Nueva categoría</button></div>
            ${tabla([{ t: "Nombre", k: x => x.nombre }, { t: "Slug", k: x => x.slug }, { t: "Productos", k: x => ps.filter(p => p.categoria === x.nombre).length }, { t: "Estado", k: x => x.estado },
                { t: "Acciones", k: x => html`<button type="button" data-accion="cat-editar" data-id="${x.id}">Renombrar</button><button type="button" data-accion="cat-estado" data-id="${x.id}" data-estado="${x.estado === "activa" ? "inactiva" : "activa"}">${x.estado === "activa" ? "Dar de baja" : "Reactivar"}</button>` }], cs)}
            <p class="nota">Dar de baja una categoría oculta sus productos de la tienda (baja lógica; no se borra información).</p>`);
    }

    /* ---------------- Inventario ---------------- */
    const estInv = { producto: "" };
    function renderInventario(c) {
        const ps = Servidor.listarProductosAdmin(), mv = Servidor.listarMovimientos().filter(m => !estInv.producto || String(m.productoId) === estInv.producto).slice(0, 100);
        pintar(c, html`<h2>Inventario</h2>
            ${tabla([{ t: "Modelo", k: p => p.sku }, { t: "Producto", k: p => p.nombre }, { t: "Existencias", k: p => html`<strong>${p.stock}</strong>${p.stock <= POLITICAS.stockBajo ? html` <span class="etiqueta-alerta">⚠️ stock bajo</span>` : ""}` },
                { t: "Estado", k: p => p.estado }, { t: "Acciones", k: p => html`<button type="button" class="principal" data-accion="inv-ajustar" data-id="${p.id}">Ajustar</button>` }], ps, "", { clase: p => p.stock <= POLITICAS.stockBajo ? "bajo" : "" })}
            <h3>Movimientos de inventario (últimos 100)</h3>
            <div class="barra-herramientas"><div class="campo"><label for="filtroMovProd">Producto</label><select id="filtroMovProd"><option value="">Todos</option>${ps.map(p => html`<option value="${p.id}" ${estInv.producto === String(p.id) ? "selected" : ""}>${p.sku} — ${p.nombre}</option>`)}</select></div></div>
            ${tabla([{ t: "Fecha", k: m => fecha(m.fecha) }, { t: "Producto", k: m => m.producto }, { t: "Tipo", k: m => m.tipo }, { t: "Cant.", k: m => (m.cantidad > 0 ? "+" : "") + m.cantidad }, { t: "Antes → después", k: m => `${m.stockAntes} → ${m.stockDespues}` }, { t: "Motivo / ref.", k: m => m.motivo + (m.referencia ? " · " + m.referencia : "") }, { t: "Usuario", k: m => m.usuario }], mv, "Sin movimientos.")}`);
        $("#filtroMovProd").onchange = e => { estInv.producto = e.target.value; render(); };
    }
    function ajustarInventario(id) {
        const p = Servidor.listarProductosAdmin().find(x => x.id === Number(id));
        formulario({
            titulo: `Ajustar existencias — ${p.nombre}`, ok: "Registrar ajuste", intro: `Existencias actuales: ${p.stock}. El ajuste queda registrado con motivo, usuario y fecha.`,
            campos: [{ id: "stock", label: "Existencias correctas", tipo: "number", step: "1", min: "0", valor: p.stock }, { id: "motivo", label: "Motivo del ajuste (obligatorio)", max: 200 }],
            enviar: v => { Servidor.ajustarInventario(p.id, v.stock, v.motivo); aviso("✅ Ajuste registrado.", "exito", 3000); render(); }
        });
    }

    /* ---------------- Clientes y usuarios ---------------- */
    function renderClientes(c) {
        const us = Servidor.listarUsuarios(), adm = Servidor.tiene(usuario, "usuarios.administrar");
        pintar(c, html`<h2>Clientes y usuarios</h2>
            ${tabla([{ t: "Usuario", k: u => u.usuario }, { t: "Nombre", k: u => u.nombre }, { t: "Correo", k: u => u.correo || "—" }, { t: "Rol", k: u => u.rol }, { t: "Estado", k: u => u.estado },
                { t: "Pedidos", k: u => u.pedidos }, { t: "Compras netas", k: u => mxn(u.gastado) }, { t: "Alta", k: u => fechaCorta(u.creado) },
                ...(adm ? [{ t: "Acciones", k: u => u.id === usuario.id ? "—" : html`<button type="button" data-accion="usr-editar" data-id="${u.id}">Rol / estado</button>` }] : [])], us)}`);
    }
    function editarUsuario(id) {
        const u = Servidor.listarUsuarios().find(x => x.id === Number(id));
        formulario({
            titulo: `Usuario ${u.usuario}`, intro: "Principio de mínimo privilegio: asigna el rol más bajo que permita hacer el trabajo.",
            campos: [{ id: "rol", label: "Rol", tipo: "select", opciones: Object.keys(Servidor.PERMISOS) }, { id: "estado", label: "Estado de la cuenta", tipo: "select", opciones: ["activo", "bloqueado"] }],
            valores: { rol: u.rol, estado: u.estado }, enviar: v => { Servidor.actualizarUsuarioAdmin(u.id, v); aviso("✅ Usuario actualizado.", "exito", 3000); render(); }
        });
    }

    /* ---------------- Promociones ---------------- */
    function renderPromociones(c) {
        const cs = Servidor.listarCupones();
        pintar(c, html`<h2>Promociones y cupones</h2>
            <p class="nota">Los cupones se validan en el “servidor”: vigencia, compra mínima, límite de usos por cuenta y límite total. Las ofertas por producto se configuran en Productos.</p>
            <div class="barra-herramientas"><button type="button" class="btn-siguiente" data-accion="cup-nuevo">➕ Nuevo cupón</button></div>
            ${tabla([{ t: "Código", k: x => x.codigo }, { t: "Beneficio", k: x => x.tipo === "porcentaje" ? x.valor + " %" : mxn(x.valor) }, { t: "Vigencia", k: x => `${x.desde} → ${x.hasta}` }, { t: "Mín. compra", k: x => mxn(x.minimoCompra) },
                { t: "Límites", k: x => `${x.usosPorUsuario ?? "∞"} por cuenta · ${x.usosMaximos ?? "∞"} total` }, { t: "Usos", k: x => (x.usos || []).length }, { t: "Público", k: x => x.publico ? "Sí" : "No" }, { t: "Estado", k: x => x.activo ? "Activo" : "Inactivo" },
                { t: "Acciones", k: x => html`<button type="button" data-accion="cup-editar" data-codigo="${x.codigo}">Editar</button><button type="button" data-accion="cup-estado" data-codigo="${x.codigo}" data-activo="${x.activo ? "0" : "1"}">${x.activo ? "Desactivar" : "Activar"}</button>` }], cs)}`);
    }
    function formCupon(codigo) {
        const x = codigo ? Servidor.listarCupones().find(c => c.codigo === codigo) : null;
        formulario({
            titulo: x ? `Editar cupón ${x.codigo}` : "Nuevo cupón",
            campos: [{ id: "codigo", label: "Código (mayúsculas y números)", max: 20 }, { id: "tipo", label: "Tipo", tipo: "select", opciones: [["porcentaje", "Porcentaje"], ["monto", "Monto fijo (MXN)"]] },
                { id: "valor", label: "Valor", tipo: "number", step: "0.01", min: "0" }, { id: "desde", label: "Vigente desde", tipo: "date" }, { id: "hasta", label: "Vigente hasta", tipo: "date" },
                { id: "minimoCompra", label: "Compra mínima (MXN)", tipo: "number", step: "1", min: "0" },
                { id: "usosPorUsuario", label: "Usos máximos por cuenta (vacío = sin límite)", tipo: "number", min: "0" }, { id: "usosMaximos", label: "Usos máximos totales (vacío = sin límite)", tipo: "number", min: "0" },
                { id: "publico", label: "Mostrar en la política pública de promociones", tipo: "checkbox" }, { id: "activo", label: "Activo", tipo: "checkbox" }],
            valores: x ? { ...x } : { tipo: "porcentaje", desde: hoy(), minimoCompra: 0, activo: true }, enviar: v => { Servidor.guardarCupon(v); aviso("✅ Cupón guardado.", "exito", 3000); render(); }
        });
    }

    /* ---------------- Atención al cliente y facturas ---------------- */
    function renderAtencion(c) {
        const ts = Servidor.listarTickets(), fs = Servidor.listarFacturas();
        pintar(c, html`<h2>Atención al cliente</h2>
            <p class="nota">Objetivo de respuesta: ${POLITICAS.respuestaSoporteHoras} horas hábiles. Todo folio se resuelve con una respuesta registrada.</p>
            ${tabla([{ t: "Folio", k: t => t.folio }, { t: "Fecha", k: t => fecha(t.creado) }, { t: "Tipo", k: t => t.tipo }, { t: "Asunto", k: t => t.asunto }, { t: "Contacto", k: t => t.nombre + " · " + t.correo }, { t: "Estado", k: t => badge(t.estado) },
                { t: "Acciones", k: t => html`<button type="button" class="principal" data-accion="tk-ver" data-folio="${t.folio}">Atender</button>` }], ts, "Sin folios de atención.")}
            <h2>Solicitudes de factura</h2>
            <p class="nota">Esta tienda académica no emite CFDI válidos; aquí solo se da seguimiento a las solicitudes.</p>
            ${tabla([{ t: "Folio", k: f => f.folio }, { t: "Pedido", k: f => f.pedido }, { t: "RFC", k: f => f.rfc }, { t: "Razón social", k: f => f.razonSocial }, { t: "Estado", k: f => badge(f.estado) },
                { t: "Acciones", k: f => html`<button type="button" data-accion="fac-estado" data-folio="${f.folio}">Cambiar estado</button>` }], fs, "Sin solicitudes de factura.")}`);
    }
    function atenderTicket(folio) {
        const t = Servidor.listarTickets().find(x => x.folio === folio);
        formulario({
            titulo: `Folio ${t.folio} — ${t.tipo}`, intro: `${t.nombre} (${t.correo}): ${t.asunto} — ${t.mensaje}`, ok: "Guardar",
            campos: [{ id: "estado", label: "Estado", tipo: "select", opciones: ["Abierto", "En proceso", "Resuelto"] }, { id: "respuesta", label: "Respuesta / resolución", tipo: "textarea", max: 1000 }],
            valores: { estado: t.estado, respuesta: t.respuesta }, enviar: v => { Servidor.actualizarTicket(folio, v.estado, v.respuesta); aviso("✅ Folio actualizado.", "exito", 3000); render(); }
        });
    }

    /* ---------------- Reportes (CSV) ---------------- */
    const COLS = {
        ventas: [{ t: "Folio", k: "folio" }, { t: "Fecha", k: "fecha" }, { t: "Cliente", k: "cliente" }, { t: "Correo", k: "correo" }, { t: "Estado", k: "estado" }, { t: "Subtotal", k: "subtotal" }, { t: "Descuento", k: "descuento" }, { t: "Cupón", k: "cupon" }, { t: "Envío", k: "envio" }, { t: "Total", k: "total" }, { t: "IVA incluido", k: "ivaIncluido" }, { t: "Pago", k: "pago" }],
        productos: [{ t: "Modelo", k: "sku" }, { t: "Producto", k: "producto" }, { t: "Unidades", k: "unidades" }, { t: "Importe", k: "importe" }],
        inventario: [{ t: "Modelo", k: "sku" }, { t: "Producto", k: "producto" }, { t: "Categoría", k: "categoria" }, { t: "Estado", k: "estado" }, { t: "Existencias", k: "existencias" }, { t: "Alerta", k: "alerta" }],
        devoluciones: [{ t: "Folio", k: "folio" }, { t: "Pedido", k: "pedido" }, { t: "Fecha", k: "fecha" }, { t: "Motivo", k: "motivo" }, { t: "Estado", k: "estado" }, { t: "Resolución", k: "resolucion" }, { t: "Reembolso", k: "reembolso" }]
    };
    const estRep = { tipo: "ventas", desde: "", hasta: "" };
    function renderReportes(c) {
        const filas = Servidor.reporte(estRep.tipo, estRep);
        pintar(c, html`<h2>Reportes</h2>
            <div class="barra-herramientas">
                <div class="campo"><label for="repTipo">Reporte</label><select id="repTipo">${[["ventas", "Ventas / pedidos"], ["productos", "Productos más vendidos"], ["inventario", "Inventario"], ["devoluciones", "Devoluciones"]].map(([v, t]) => html`<option value="${v}" ${estRep.tipo === v ? "selected" : ""}>${t}</option>`)}</select></div>
                <div class="campo"><label for="repDesde">Desde</label><input id="repDesde" type="date" value="${estRep.desde}"></div>
                <div class="campo"><label for="repHasta">Hasta</label><input id="repHasta" type="date" value="${estRep.hasta}"></div>
                <button type="button" class="btn-siguiente" data-accion="rep-csv">⬇️ Exportar CSV</button>
            </div>
            <p class="nota">${filas.length} registro(s). El CSV neutraliza fórmulas (=, +, -, @) para evitar inyección en hojas de cálculo.</p>
            ${tabla(COLS[estRep.tipo].map(col => ({ t: col.t, k: f => f[col.k] ?? "" })), filas.slice(0, 200), "Sin datos para el periodo.")}`);
        ["repTipo", "repDesde", "repHasta"].forEach(id => { $("#" + id).onchange = e => { estRep[id === "repTipo" ? "tipo" : id === "repDesde" ? "desde" : "hasta"] = e.target.value; render(); }; });
    }

    /* ---------------- Bitácora ---------------- */
    const estAud = { texto: "" };
    function renderAuditoria(c) {
        const t = estAud.texto.toLowerCase();
        const logs = Servidor.listarAuditoria().filter(a => !t || (a.actor + a.accion + a.entidad + a.entidadId + a.detalle).toLowerCase().includes(t)).slice(0, 300);
        pintar(c, html`<h2>Bitácora de auditoría</h2>
            <p class="nota">Cambios sensibles (inventario, precios, estados, devoluciones, permisos). No se guardan contraseñas ni datos bancarios.</p>
            <div class="barra-herramientas"><div class="campo"><label for="buscarAud">Filtrar</label><input id="buscarAud" value="${estAud.texto}"></div></div>
            ${tabla([{ t: "Fecha", k: a => fecha(a.fecha) }, { t: "Actor", k: a => a.actor }, { t: "Acción", k: a => a.accion }, { t: "Entidad", k: a => `${a.entidad} ${a.entidadId}` }, { t: "Detalle", k: a => a.detalle }], logs, "Sin eventos.")}`);
        $("#buscarAud").onchange = e => { estAud.texto = e.target.value; render(); };
    }

    /* ---------------- Eventos de acciones ---------------- */
    document.addEventListener("click", async e => {
        const b = e.target.closest("[data-accion]");
        if (!b) return;
        const d = b.dataset;
        try {
            switch (d.accion) {
                case "ver-pedido": verPedido(d.folio); break;
                case "estado-pedido": cambiarEstadoPedido(d.folio); break;
                case "incidencia":
                    formulario({ nivel: 2, titulo: `Incidencia en ${d.folio}`, campos: [{ id: "tipo", label: "Tipo", tipo: "select", opciones: Servidor.INCIDENCIAS }, { id: "nota", label: "Detalle", tipo: "textarea", max: 300 }],
                        enviar: v => { Servidor.registrarIncidencia(d.folio, v.tipo, v.nota); verPedido(d.folio); aviso("✅ Incidencia registrada.", "exito", 3000); } });
                    break;
                case "ver-dev": verDevolucion(d.folio); break;
                case "prod-nuevo": formProducto(); break;
                case "prod-editar": formProducto(d.id); break;
                case "prod-estado":
                    if (d.estado === "inactivo" && !(await confirmar({ titulo: "Dar de baja el producto", mensaje: "El producto dejará de mostrarse en la tienda (baja lógica). Podrás reactivarlo.", ok: "Dar de baja", peligro: true }))) break;
                    Servidor.cambiarEstadoProducto(d.id, d.estado); aviso("✅ Estado del producto actualizado.", "exito", 3000); render(); break;
                case "cat-nueva": formulario({ titulo: "Nueva categoría", campos: [{ id: "nombre", label: "Nombre", max: 40 }], enviar: v => { Servidor.guardarCategoria(v); render(); } }); break;
                case "cat-editar": {
                    const c = Servidor.listarCategoriasAdmin().find(x => x.id === Number(d.id));
                    formulario({ titulo: "Renombrar categoría", campos: [{ id: "nombre", label: "Nombre", max: 40 }], valores: { nombre: c.nombre }, enviar: v => { Servidor.guardarCategoria({ id: c.id, nombre: v.nombre }); render(); } });
                    break;
                }
                case "cat-estado": {
                    const c = Servidor.listarCategoriasAdmin().find(x => x.id === Number(d.id));
                    Servidor.guardarCategoria({ id: c.id, nombre: c.nombre, estado: d.estado }); render(); break;
                }
                case "inv-ajustar": ajustarInventario(d.id); break;
                case "usr-editar": editarUsuario(d.id); break;
                case "cup-nuevo": formCupon(); break;
                case "cup-editar": formCupon(d.codigo); break;
                case "cup-estado": Servidor.cambiarEstadoCupon(d.codigo, d.activo === "1"); render(); break;
                case "tk-ver": atenderTicket(d.folio); break;
                case "fac-estado":
                    formulario({ titulo: `Solicitud ${d.folio}`, campos: [{ id: "estado", label: "Estado", tipo: "select", opciones: ["Registrada", "Atendida", "Rechazada"] }],
                        enviar: v => { Servidor.actualizarFactura(d.folio, v.estado); render(); } });
                    break;
                case "rep-csv": {
                    const filas = Servidor.reporte(estRep.tipo, estRep);
                    UI.descargar(`reporte-${estRep.tipo}-${hoy()}.csv`, UI.csv(COLS[estRep.tipo], filas));
                    break;
                }
                case "reset":
                    if (await confirmar({ titulo: "Restablecer datos", mensaje: "Se borrarán pedidos, devoluciones, usuarios creados y cambios de catálogo, y se cargarán los datos de demostración.", ok: "Restablecer", peligro: true })) {
                        await Servidor.restablecerDemo(); aviso("✅ Datos de demostración restablecidos.", "exito"); arrancar();
                    }
                    break;
                default: if (d.accion.startsWith("dev-")) accionDevolucion(d.accion.slice(4), d.folio);
            }
        } catch (err) { aviso(msgError(err), "error"); if (err.estado === 401) arrancar(); }
    });
    // Sincronía con otras pestañas (p. ej. la tienda crea un pedido mientras el panel está abierto)
    window.addEventListener("storage", ev => { if (usuario && (ev.key === "tdn2_db") && !UI.hayAbiertos()) render(); if (ev.key === "tdn2_sesion") arrancar(); });

    arrancar();
})();
