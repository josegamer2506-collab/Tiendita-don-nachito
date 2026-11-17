"use strict";
/* ============================================================
   app.js — Interfaz de la tienda (Tiendita Don Nacho)
   Depende de: ui.js, datos.js, servidor.js, legal.js
   La interfaz solo MUESTRA y captura datos; los precios, totales,
   inventario, pagos y permisos los resuelve servidor.js.
   ============================================================ */
(async function tienda() {
    const { $, $$, html, raw, pintar, mxn, fecha, fechaCorta, validar, aviso, abrir, cerrar, modal, cerrarModal, confirmar } = UI;
    const POR_PAGINA = 8;

    const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const leerJSON = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } };
    const guardarJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
    const clase = s => String(s).replace(/\s+/g, "-");
    const nuevaClave = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
    const msgError = e => {
        if (e instanceof Servidor.ErrorApi) return e.message;
        console.error(e);
        return "Ocurrió un error inesperado. Intenta de nuevo.";
    };
    const estadoBadge = e => html`<span class="estado ${clase(e)}">${e}</span>`;
    const mensaje = (el, texto, tipo = "error") => { el.textContent = texto; el.className = "mensaje-form " + (texto ? tipo : ""); };

    try { await Servidor.iniciar(); }
    catch (e) {
        document.body.insertAdjacentHTML("afterbegin", '<p role="alert" class="error-arranque">No se pudo iniciar la tienda: los datos locales no están disponibles. Recarga la página.</p>');
        console.error(e);
        return;
    }

    /* ---------------- Estado ---------------- */
    const est = { catalogo: [], categorias: [], pagina: 1, usuario: null, pendiente: null, dirEdit: undefined, ultimoFolio: null };
    const co = { paso: 1, metodoEntrega: "estandar", cupon: "", cuponMsg: null, metodoPago: "", claveIdem: null, procesando: false, datos: null };

    /* ---------------- Pestañas accesibles (reutilizable) ---------------- */
    function iniciarTabs(lista) {
        const btns = $$('[role="tab"]', lista);
        const activar = (b, foco) => {
            btns.forEach(x => {
                const sel = x === b;
                x.setAttribute("aria-selected", sel ? "true" : "false");
                x.tabIndex = sel ? 0 : -1;
                const p = document.getElementById(x.getAttribute("aria-controls"));
                if (p) p.hidden = !sel;
            });
            if (foco) b.focus();
            b.dispatchEvent(new CustomEvent("tab-activada", { bubbles: true }));
        };
        lista.addEventListener("click", e => { const b = e.target.closest('[role="tab"]'); if (b) activar(b); });
        lista.addEventListener("keydown", e => {
            const i = btns.indexOf(document.activeElement);
            if (i < 0) return;
            const dest = e.key === "ArrowRight" ? btns[(i + 1) % btns.length] : e.key === "ArrowLeft" ? btns[(i - 1 + btns.length) % btns.length] : e.key === "Home" ? btns[0] : e.key === "End" ? btns[btns.length - 1] : null;
            if (dest) { e.preventDefault(); activar(dest, true); }
        });
        return btn => activar(typeof btn === "string" ? document.getElementById(btn) : btn);
    }
    const tabsLogin = iniciarTabs($("#loginPopup [role=tablist]"));
    const tabsCuenta = iniciarTabs($("#cuentaPopup [role=tablist]"));
    const tabsAyuda = iniciarTabs($("#ayudaPopup [role=tablist]"));

    /* ============================================================
       SESIÓN
       ============================================================ */
    function pintarSesion() {
        const u = est.usuario;
        $("#nombreUsuario").textContent = u ? "👤 Hola, " + u.nombre.split(" ")[0] : "👤 Invitado";
        $("#loginBtn").hidden = !!u;
        $("#cuentaBtn").hidden = !u;
        $("#logoutBtn").hidden = !u;
        $("#adminLink").hidden = !(u && (u.rol === "admin" || u.rol === "soporte"));
    }
    function refrescarSesion() { est.usuario = Servidor.sesionActual(); pintarSesion(); renderFavoritosEstado(); }

    function abrirLogin(texto, tab = "tabLogin") {
        const a = $("#avisoLogin");
        a.hidden = !texto;
        a.textContent = texto || "";
        tabsLogin(tab);
        abrir("loginPopup");
    }
    /* Si no hay sesión, abre el inicio de sesión y reanuda la acción al terminar. */
    function requerirSesion(texto, reanudar) {
        if (est.usuario) return true;
        est.pendiente = reanudar || null;
        abrirLogin(texto);
        return false;
    }
    function terminarLogin(u, texto) {
        est.usuario = u;
        pintarSesion();
        renderFavoritosEstado();
        cerrar("loginPopup");
        aviso(texto, "exito");
        const f = est.pendiente;
        est.pendiente = null;
        if (f) setTimeout(f, 150);
    }

    async function onLogin(e) {
        e.preventDefault();
        const m = $("#mensajeLogin"), b = $("#iniciarSesion");
        mensaje(m, "");
        b.disabled = true;
        try {
            const u = await Servidor.iniciarSesion($("#usuarioLogin").value, $("#claveLogin").value);
            $("#formLogin").reset();
            terminarLogin(u, `👋 Hola, ${u.nombre.split(" ")[0]}. Iniciaste sesión.`);
        } catch (err) { mensaje(m, msgError(err)); }
        finally { b.disabled = false; }
    }
    async function onRegistro(e) {
        e.preventDefault();
        const m = $("#mensajeRegistro"), b = $("#registrarUsuario");
        mensaje(m, "");
        b.disabled = true;
        try {
            const u = await Servidor.registrar({
                nombre: $("#regNombre").value, usuario: $("#usuarioRegistro").value, correo: $("#regCorreo").value, telefono: $("#regTelefono").value,
                clave: $("#claveRegistro").value, mayorEdad: $("#regMayor").checked, privacidad: $("#regPrivacidad").checked, marketing: $("#regMarketing").checked
            });
            $("#formRegistro").reset();
            terminarLogin(u, "✅ Cuenta creada correctamente. ¡Bienvenido!");
        } catch (err) { mensaje(m, msgError(err)); }
        finally { b.disabled = false; }
    }
    function onRecuperar(e) {
        e.preventDefault();
        const m = $("#mensajeRecuperar");
        mensaje(m, "");
        try {
            const r = Servidor.recuperarSolicitar($("#recCorreo").value);
            const c = $("#recCodigo");
            c.hidden = false;
            c.textContent = `Simulación de correo: tu código es ${r.codigoSimulado} (vence en 10 minutos). Si el correo está registrado, podrás usarlo para cambiar tu contraseña.`;
            $("#recPaso2").hidden = false;
            $("#recCodigoIn").focus();
        } catch (err) { mensaje(m, msgError(err)); }
    }
    async function onRecuperarConfirmar() {
        const m = $("#mensajeRecuperar");
        mensaje(m, "");
        try {
            await Servidor.recuperarConfirmar({ correo: $("#recCorreo").value, codigo: $("#recCodigoIn").value, clave: $("#recClave").value });
            mensaje(m, "✅ Contraseña actualizada. Ya puedes iniciar sesión.", "ok");
            $("#formRecuperar").reset();
            $("#recPaso2").hidden = true;
            $("#recCodigo").hidden = true;
            setTimeout(() => tabsLogin("tabLogin"), 1200);
        } catch (err) { mensaje(m, msgError(err)); }
    }
    function cerrarSesion() {
        Servidor.cerrarSesion();
        Servidor.carritoGuardar([]);        // en equipos compartidos no se deja el carrito de otra persona
        est.usuario = null;
        co.cupon = ""; co.cuponMsg = null; co.claveIdem = null;
        pintarSesion();
        pintarContador();
        renderCatalogo();
        renderFavoritosEstado();
        cerrar("cuentaPopup");
        aviso("👋 Sesión cerrada correctamente.", "info");
    }

    /* ============================================================
       FAVORITOS (por usuario)
       ============================================================ */
    const claveFav = () => "tdn2_fav_" + (est.usuario ? est.usuario.id : "invitado");
    const leerFav = () => leerJSON(claveFav(), []).map(Number);
    const esFavorito = id => leerFav().includes(Number(id));
    function alternarFavorito(id) {
        id = Number(id);
        let f = leerFav();
        const ya = f.includes(id);
        f = ya ? f.filter(x => x !== id) : [...f, id];
        guardarJSON(claveFav(), f);
        const p = est.catalogo.find(x => x.id === id);
        aviso(ya ? `Quitaste ${p ? p.nombre : "el producto"} de tus favoritos.` : `❤️ ${p ? p.nombre : "Producto"} agregado a favoritos.`, "info", 2500);
        renderFavoritosEstado();
        if ($("#favoritosPopup").classList.contains("visible")) renderFavoritos();
    }
    function renderFavoritosEstado() {
        $$(".btn-favorito").forEach(b => {
            const fav = esFavorito(b.dataset.fav), p = est.catalogo.find(x => x.id === Number(b.dataset.fav));
            b.textContent = fav ? "❤️" : "🤍";
            b.setAttribute("aria-pressed", fav ? "true" : "false");
            b.setAttribute("aria-label", `${fav ? "Quitar de" : "Agregar a"} favoritos: ${p ? p.nombre : ""}`);
        });
    }
    function renderFavoritos() {
        const ids = leerFav(), lista = $("#listaFavoritos");
        const prods = ids.map(id => est.catalogo.find(p => p.id === id)).filter(Boolean);
        if (!prods.length) { pintar(lista, html`<p class="lista-vacia">🤍 Aún no tienes favoritos. Toca el corazón de un producto para guardarlo.</p>`); return; }
        pintar(lista, html`${prods.map(p => html`
            <div class="favorito-item">
                <img src="${p.imagen || UI.imagenRespaldo(p.nombre)}" alt="${p.nombre}">
                <div class="info">
                    <strong>${p.nombre}</strong>
                    <p class="precio">${mxn(p.vigente.precio)}</p>
                    <p class="nota">${p.stock > 0 ? "Disponibles: " + p.stock : "Agotado"}</p>
                </div>
                <div class="fila-acciones">
                    <button type="button" data-detalle="${p.id}">Ver</button>
                    <button type="button" data-fav="${p.id}">Quitar</button>
                </div>
            </div>`)}`);
    }

    /* ============================================================
       CATÁLOGO: búsqueda, filtros, orden y paginación
       ============================================================ */
    function cargarCatalogo() {
        const c = Servidor.catalogo();
        est.catalogo = c.productos;
        est.categorias = c.categorias;
    }
    function llenarFiltros() {
        const sel = $("#filtroCategoria"), actual = sel.value;
        sel.innerHTML = '<option value="todas">Todas las categorías</option>' + est.categorias.map(c => `<option value="${UI.esc(c.nombre)}">${UI.esc(c.nombre)}</option>`).join("");
        sel.value = est.categorias.some(c => c.nombre === actual) ? actual : "todas";
        pintar($("#listaCategorias"), html`${est.categorias.map(c => html`
            <button type="button" class="tarjeta-categoria" data-categoria="${c.nombre}" aria-pressed="${sel.value === c.nombre ? "true" : "false"}">
                ${c.nombre}<small>${est.catalogo.filter(p => p.categoria === c.nombre).length} productos</small>
            </button>`)}`);
        const sd = $("#envEstado");
        if (sd.options.length <= 1) ESTADOS_MX.forEach(n => sd.add(new Option(n, n)));
    }
    const filtros = () => ({
        texto: norm($("#buscador").value.trim()), categoria: $("#filtroCategoria").value, precio: $("#filtroPrecio").value,
        disp: $("#filtroDisponibilidad").value, orden: $("#ordenProductos").value
    });
    function productosFiltrados() {
        const f = filtros();
        let l = est.catalogo.filter(p => {
            if (f.texto && ![p.nombre, p.sku, p.categoria, p.descripcion].some(x => norm(x).includes(f.texto))) return false;
            if (f.categoria !== "todas" && p.categoria !== f.categoria) return false;
            if (f.precio !== "todos") { const [a, b] = f.precio.split("-").map(Number); if (p.vigente.precio < a || p.vigente.precio > b) return false; }
            if (f.disp === "disponibles" && p.stock <= 0) return false;
            if (f.disp === "agotados" && p.stock > 0) return false;
            return true;
        });
        if (f.orden === "menor") l.sort((a, b) => a.vigente.precio - b.vigente.precio);
        else if (f.orden === "mayor") l.sort((a, b) => b.vigente.precio - a.vigente.precio);
        else if (f.orden === "popularidad") { const pop = Servidor.popularidad(); l.sort((a, b) => (pop[b.id] || 0) - (pop[a.id] || 0)); }
        return l;
    }
    function tarjetaProducto(p) {
        const v = p.vigente, fav = esFavorito(p.id), enCarro = cantidadEnCarrito(p.id);
        const tope = Math.min(POLITICAS.maxPorProducto, p.stock);
        const opciones = p.variantes && p.variantes.length;
        const stockTxt = p.stock <= 0 ? "❌ Agotado" : p.stock <= 3 ? `⚠️ ¡Últimas ${p.stock} piezas!` : `📦 Disponibles: ${p.stock}`;
        const claseStock = p.stock <= 0 ? "agotado" : p.stock <= 3 ? "pocas" : "";
        const boton = p.stock <= 0 ? "Agotado" : enCarro >= tope ? "Máximo en tu carrito" : opciones ? "🛒 Elegir opciones" : "🛒 Agregar";
        return html`
        <article class="producto" data-id="${p.id}">
            <button class="btn-favorito" type="button" data-fav="${p.id}" aria-pressed="${fav ? "true" : "false"}" aria-label="${fav ? "Quitar de" : "Agregar a"} favoritos: ${p.nombre}">${fav ? "❤️" : "🤍"}</button>
            ${v.enOferta ? html`<span class="badge-oferta">${v.porcentaje}% OFF</span>` : ""}
            <button type="button" class="imagen-btn" data-detalle="${p.id}" aria-label="Ver detalles de ${p.nombre}">
                <img src="${p.imagen || UI.imagenRespaldo(p.nombre)}" alt="${p.nombre}" loading="lazy" decoding="async">
            </button>
            <h3><button type="button" data-detalle="${p.id}">${p.nombre}</button></h3>
            <p class="sku">Modelo ${p.sku} · ${p.categoria}</p>
            <p class="precio">${v.enOferta ? html`<s class="precio-anterior"><span class="sr-only">Precio anterior </span>${mxn(v.lista)}</s>` : ""}${mxn(v.precio)}</p>
            <p class="nota-iva">MXN · IVA incluido${v.enOferta ? " · oferta hasta " + fechaCorta(v.hasta + "T12:00:00") : ""}</p>
            <p class="stock-producto ${claseStock}">${stockTxt}</p>
            <div class="acciones">
                <button class="btn-agregar" type="button" data-agregar="${p.id}" ${p.stock <= 0 || enCarro >= tope ? "disabled" : ""}>${boton}</button>
                <button class="btn-quick-view" type="button" data-detalle="${p.id}">👀 Vista rápida</button>
            </div>
        </article>`;
    }
    function renderCatalogo() {
        const lista = productosFiltrados();
        const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
        est.pagina = Math.min(Math.max(1, est.pagina), paginas);
        const ini = (est.pagina - 1) * POR_PAGINA, vista = lista.slice(ini, ini + POR_PAGINA);
        $("#resultados").textContent = lista.length
            ? `Mostrando ${ini + 1}–${ini + vista.length} de ${lista.length} producto${lista.length === 1 ? "" : "s"}.`
            : "Sin resultados.";
        pintar($("#productos"), vista.length ? html`${vista.map(tarjetaProducto)}` :
            html`<div class="sin-resultados"><p><strong>No encontramos productos con esos filtros.</strong></p><button type="button" class="btn-siguiente" data-accion="limpiar-filtros">Limpiar filtros</button></div>`);
        pintar($("#paginacion"), paginas > 1 ? html`
            <button type="button" data-pagina="${est.pagina - 1}" ${est.pagina === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
            ${Array.from({ length: paginas }, (_, i) => html`<button type="button" data-pagina="${i + 1}" ${i + 1 === est.pagina ? raw('aria-current="page"') : ""} aria-label="Página ${i + 1}">${i + 1}</button>`)}
            <button type="button" data-pagina="${est.pagina + 1}" ${est.pagina === paginas ? "disabled" : ""} aria-label="Página siguiente">›</button>` : "");
        $$(".tarjeta-categoria").forEach(b => b.setAttribute("aria-pressed", b.dataset.categoria === filtros().categoria ? "true" : "false"));
    }
    function limpiarFiltros() {
        $("#buscador").value = ""; $("#filtroCategoria").value = "todas"; $("#filtroPrecio").value = "todos";
        $("#filtroDisponibilidad").value = "todos"; $("#ordenProductos").value = "normal";
        est.pagina = 1; renderCatalogo();
    }

    /* ============================================================
       CARRITO
       ============================================================ */
    const lineas = () => Servidor.carritoLeer();
    const cantidadEnCarrito = id => lineas().filter(l => l.id === Number(id)).reduce((s, l) => s + l.cantidad, 0);
    let contadorPrevio = 0;
    function pintarContador() {
        const n = lineas().reduce((s, l) => s + l.cantidad, 0);
        $("#contador").textContent = n;
        $("#contadorFab").textContent = n;
        const fab = $("#carritoFab");
        fab.hidden = n === 0;
        fab.setAttribute("aria-label", `Abrir carrito (${n} ${n === 1 ? "producto" : "productos"})`);
        if (n > contadorPrevio) { // pequeña animación al agregar un producto
            for (const el of [fab, $("#carritoBtn")]) { el.classList.remove("rebote"); void el.offsetWidth; el.classList.add("rebote"); }
        }
        contadorPrevio = n;
    }
    function guardarLineas(l) { Servidor.carritoGuardar(l); pintarContador(); }

    function agregar(id, variante, cant = 1) {
        const p = est.catalogo.find(x => x.id === Number(id));
        if (!p) { aviso("Ese producto ya no está disponible.", "error"); return false; }
        const total = cantidadEnCarrito(p.id) + cant;
        if (total > POLITICAS.maxPorProducto) { aviso(`⚠️ Máximo ${POLITICAS.maxPorProducto} unidades de este producto por pedido.`, "error"); return false; }
        if (total > p.stock) { aviso(p.stock > 0 ? `⚠️ Solo hay ${p.stock} unidades disponibles de ${p.nombre}.` : `❌ ${p.nombre} está agotado.`, "error"); return false; }
        const ls = lineas(), ex = ls.find(l => l.id === p.id && l.variante === (variante || ""));
        if (ex) ex.cantidad += cant; else ls.push({ id: p.id, variante: variante || "", cantidad: cant });
        guardarLineas(ls);
        renderCatalogo();
        if ($("#carritoPopup").classList.contains("visible")) renderCarrito();
        aviso(`✅ ${p.nombre} agregado al carrito.`, "exito", 3000);
        return true;
    }
    let renderizando = false;
    function cambiarCantidad(id, variante, nueva) {
        if (renderizando) return;
        id = Number(id);
        const ls = lineas(), l = ls.find(x => x.id === id && x.variante === variante), p = est.catalogo.find(x => x.id === id);
        if (!l) return;
        if (nueva < 1) { quitarLinea(id, variante); return; }
        const otras = ls.filter(x => x.id === id && x !== l).reduce((s, x) => s + x.cantidad, 0);
        const tope = p ? Math.min(POLITICAS.maxPorProducto, p.stock) : POLITICAS.maxPorProducto;
        if (otras + nueva > tope) {
            aviso(p && p.stock < POLITICAS.maxPorProducto ? `⚠️ Solo hay ${p.stock} unidades disponibles.` : `⚠️ Máximo ${POLITICAS.maxPorProducto} unidades por producto.`, "error");
            nueva = Math.max(1, tope - otras);
        }
        l.cantidad = nueva;
        guardarLineas(ls);
        renderCarrito(); renderCatalogo();
    }
    function quitarLinea(id, variante) {
        guardarLineas(lineas().filter(l => !(l.id === Number(id) && l.variante === variante)));
        renderCarrito(); renderCatalogo();
        aviso("Producto quitado del carrito.", "info", 2500);
    }

    const entregaActual = () => ({ metodo: co.metodoEntrega, cp: $("#codigoPostal").value.trim() });
    const cotizar = () => Servidor.cotizar({ lineas: lineas(), cupon: co.cupon, entrega: entregaActual() });

    function totalesHTML(cot) {
        return html`<dl>
            <dt>Subtotal productos (IVA incluido)</dt><dd>${mxn(cot.subtotal)}</dd>
            ${cot.descuento > 0 ? html`<dt>Descuento (${cot.cupon.codigo})</dt><dd>−${mxn(cot.descuento)}</dd>` : ""}
            <dt>Envío (IVA incluido)</dt><dd>${cot.envio === null ? "Por calcular" : mxn(cot.envio)}</dd>
            <dt class="total-dt">Total a pagar (MXN)</dt><dd class="total">${mxn(cot.total)}</dd>
            <dt>IVA (${POLITICAS.iva * 100} %) incluido en el total</dt><dd>${mxn(cot.ivaIncluido)}</dd>
        </dl>`;
    }

    function renderCarrito() {
        const ls = lineas(), vacio = !ls.length;
        $("#carritoVacio").hidden = !vacio;
        $("#carritoContenido").hidden = vacio;
        pintarContador();
        if (vacio) { co.cupon = ""; co.cuponMsg = null; co.paso = 1; return; }
        const cot = cotizar();
        // el cupón puede dejar de ser válido si cambió el carrito
        if (cot.cupon && !cot.cupon.ok) { co.cuponMsg = { ok: false, texto: cot.cupon.mensaje }; co.cupon = ""; return renderCarrito(); }
        renderizando = true;   // evita un "change" anidado si se quita un input con foco
        pintar($("#listaCarrito"), html`${ls.map(l => {
            const p = est.catalogo.find(x => x.id === l.id);
            if (!p) return html`<div class="producto-carrito"><div class="info-producto"><p class="problema">Un producto de tu carrito ya no está disponible.</p></div>
                <button type="button" class="btn-eliminar" data-quitar="${l.id}" data-variante="${l.variante}" aria-label="Quitar del carrito">❌</button></div>`;
            const v = p.vigente;
            return html`<div class="producto-carrito">
                <img src="${p.imagen || UI.imagenRespaldo(p.nombre)}" alt="${p.nombre}">
                <div class="info-producto">
                    <strong>${p.nombre}</strong>
                    ${l.variante ? html`<p class="variante">Variante: ${l.variante}</p>` : ""}
                    <p>${v.enOferta ? html`<s class="precio-anterior">${mxn(v.lista)}</s>` : ""}${mxn(v.precio)} c/u <span class="nota">(IVA incl.)</span></p>
                    <p class="nota">Disponibles: ${p.stock}</p>
                    <div class="cantidad-control">
                        <button type="button" data-menos="${l.id}" data-variante="${l.variante}" aria-label="Disminuir cantidad de ${p.nombre}">−</button>
                        <input type="number" min="1" max="${Math.min(POLITICAS.maxPorProducto, p.stock)}" value="${l.cantidad}" data-cant="${l.id}" data-variante="${l.variante}" aria-label="Cantidad de ${p.nombre}">
                        <button type="button" data-mas="${l.id}" data-variante="${l.variante}" aria-label="Aumentar cantidad de ${p.nombre}">+</button>
                    </div>
                    <p class="linea-total">Total: ${mxn(v.precio * l.cantidad)}</p>
                </div>
                <button type="button" class="btn-eliminar" data-quitar="${l.id}" data-variante="${l.variante}" aria-label="Quitar ${p.nombre} del carrito">❌</button>
            </div>`;
        })}`);
        renderizando = false;
        const er = $("#erroresCarrito");
        er.hidden = !cot.errores.length;
        er.textContent = cot.errores.join(" ");
        $("#btnPaso2").disabled = !!cot.errores.length;
        // cupón y totales
        const cm = $("#mensajeCupon");
        cm.className = co.cuponMsg ? (co.cuponMsg.ok ? "ok" : "error") : "";
        cm.textContent = co.cuponMsg ? co.cuponMsg.texto : "";
        $("#quitarCupon").hidden = !co.cupon;
        $("#codigoCupon").value = co.cupon || $("#codigoCupon").value;
        pintar($("#resumenTotales"), totalesHTML(cot));
        pintar($("#resumenPago"), totalesHTML(cot));
        actualizarInfoEnvio();
    }

    /* ============================================================
       CHECKOUT: 1) contacto y entrega  2) resumen  3) pago sandbox
       ============================================================ */
    function pintarMetodos() {
        pintar($("#metodosEntrega"), html`<legend>Método de entrega</legend>${METODOS_ENTREGA.map(m => html`
            <label class="opcion"><input type="radio" name="entrega" value="${m.id}" ${co.metodoEntrega === m.id ? "checked" : ""}>
                <span><strong>${m.etiqueta}</strong><small>${m.descripcion}</small></span></label>`)}`);
        pintar($("#metodosPago"), html`<legend>Método de pago</legend>${METODOS_PAGO.map(m => html`
            <label class="opcion"><input type="radio" name="pago" value="${m.id}" ${co.metodoPago === m.id ? "checked" : ""}>
                <span><strong>${m.etiqueta}</strong></span></label>`)}`);
    }
    function actualizarInfoEnvio() {
        const info = $("#infoEnvio"), ent = Servidor.calcularEntrega(entregaActual());
        const recoger = co.metodoEntrega === "recoleccion";
        $("#bloqueDireccion").hidden = recoger;
        info.classList.remove("error");
        if (ent && !ent.error) info.textContent = `🚚 ${ent.etiqueta}: ${mxn(ent.costo)} (IVA incluido) · Plazo estimado: ${ent.plazo}`;
        else if (ent && ent.error && $("#codigoPostal").value.length === 5) { info.textContent = "❌ " + ent.error; info.classList.add("error"); }
        else info.textContent = "Escribe tu código postal para calcular el costo y el plazo estimado.";
    }
    function llenarDireccion(d) {
        $("#envDestinatario").value = d.destinatario || ""; $("#envCalle").value = d.calle || ""; $("#envColonia").value = d.colonia || "";
        $("#envMunicipio").value = d.municipio || ""; $("#envEstado").value = d.estado || ""; $("#codigoPostal").value = d.cp || "";
        actualizarInfoEnvio();
    }
    function prepararCheckout() {
        const u = est.usuario;
        if (u) {
            if (!$("#envNombre").value) $("#envNombre").value = u.nombre || "";
            if (!$("#envCorreo").value) $("#envCorreo").value = u.correo || "";
            if (!$("#envTelefono").value) $("#envTelefono").value = u.telefono || "";
            const dirs = u.direcciones || [], sel = $("#envDirGuardada");
            $("#campoDirGuardada").hidden = !dirs.length;
            sel.innerHTML = '<option value="">— Capturar una dirección nueva —</option>' + dirs.map(d => `<option value="${UI.esc(d.id)}">${UI.esc(d.calle + ", " + d.colonia + " (" + d.cp + ")")}</option>`).join("");
            if (dirs.length && !$("#codigoPostal").value) { sel.value = dirs[0].id; llenarDireccion(dirs[0]); }
        } else $("#campoDirGuardada").hidden = true;
        $("#etiquetaGuardarDir").hidden = !u;
    }
    function irPaso(n) {
        co.paso = n;
        $("#pasoEnvio").hidden = n !== 1;
        $("#pasoResumen").hidden = n !== 2;
        $("#pasoPago").hidden = n !== 3;
        $$(".checkout-paso").forEach(p => {
            const k = Number(p.dataset.paso);
            p.classList.toggle("activo", k === n);
            p.classList.toggle("completado", k < n);
            if (k === n) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
        });
        const h = $(n === 1 ? "#h-envio" : n === 2 ? "#h-resumen" : "#h-pago");
        h.tabIndex = -1;
        h.focus({ preventScroll: false });
    }
    function reiniciarCheckout() { co.paso = 1; co.claveIdem = null; $("#errorPago").hidden = true; irPaso(1); }

    function validarEnvio() {
        let ok = true, primero = null;
        const chk = (id, cond, msg) => {
            const el = $("#" + id);
            if (!cond(el.value.trim())) { UI.error(el, msg); ok = false; primero = primero || el; } else UI.ok(el);
            return el.value.trim();
        };
        const nombre = chk("envNombre", v => v.length >= 2, "Escribe tu nombre completo.");
        const correo = chk("envCorreo", validar.correo, "Escribe un correo electrónico válido.");
        const telefono = chk("envTelefono", validar.telefono, "El teléfono debe tener 10 dígitos.");
        let direccion = null, cp = "";
        if (co.metodoEntrega !== "recoleccion") {
            direccion = {
                destinatario: chk("envDestinatario", v => v.length >= 2, "Escribe quién recibe el pedido."),
                calle: chk("envCalle", v => v.length >= 3, "Escribe la calle y el número."),
                colonia: chk("envColonia", v => v.length >= 2, "Escribe la colonia."),
                municipio: chk("envMunicipio", v => v.length >= 2, "Escribe el municipio o alcaldía."),
                estado: chk("envEstado", v => !!v, "Elige un estado.")
            };
            cp = chk("codigoPostal", validar.cp, "Escribe un código postal válido de 5 dígitos.");
            if (validar.cp(cp) && !Servidor.zonaPorCP(cp)) { UI.error($("#codigoPostal"), "No tenemos cobertura para ese código postal."); ok = false; }
        }
        if (!ok) { primero && primero.focus(); return null; }
        return { contacto: { nombre, correo, telefono }, entrega: { metodo: co.metodoEntrega, cp, direccion } };
    }
    function onEnvio(e) {
        e.preventDefault();
        const d = validarEnvio();
        if (!d) return;
        const continuar = () => {
            co.datos = d;
            if (d.entrega.direccion && $("#envGuardar").checked && est.usuario) {
                try {
                    const dup = (est.usuario.direcciones || []).some(a => a.calle === d.entrega.direccion.calle && a.cp === d.entrega.cp);
                    if (!dup) { Servidor.guardarDireccion({ ...d.entrega.direccion, cp: d.entrega.cp }); refrescarSesion(); }
                } catch (err) { aviso(msgError(err), "error"); }
            }
            renderResumenEntrega();
            renderCarrito();
            irPaso(2);
        };
        if (!requerirSesion("Para comprar necesitas iniciar sesión o crear una cuenta. Tus datos del carrito se conservan.", () => { abrirCarrito(true); continuar(); })) return;
        continuar();
    }
    function renderResumenEntrega() {
        const d = co.datos; if (!d) return;
        const ent = Servidor.calcularEntrega(d.entrega), a = d.entrega.direccion;
        pintar($("#resumenEntrega"), html`
            <p><strong>Contacto:</strong> ${d.contacto.nombre} · ${d.contacto.correo} · ${d.contacto.telefono}</p>
            <p><strong>Entrega:</strong> ${ent.etiqueta} — plazo estimado: ${ent.plazo}</p>
            <p><strong>${a ? "Dirección" : "Recolección"}:</strong> ${a ? `${a.destinatario}, ${a.calle}, ${a.colonia}, ${a.municipio}, ${a.estado}, C.P. ${d.entrega.cp}` : EMPRESA.domicilio + " (domicilio ficticio)"}</p>`);
    }
    function onAplicarCupon() {
        const codigo = $("#codigoCupon").value.trim().toUpperCase();
        if (!codigo) { co.cuponMsg = { ok: false, texto: "Escribe un código de cupón." }; renderCarrito(); return; }
        co.cupon = codigo;
        const cot = cotizar();
        if (cot.cupon && cot.cupon.ok) co.cuponMsg = { ok: true, texto: "✅ " + cot.cupon.mensaje };
        else { co.cuponMsg = { ok: false, texto: "❌ " + (cot.cupon ? cot.cupon.mensaje : "Cupón no válido.") }; co.cupon = ""; }
        renderCarrito();
    }
    function onPaso3() {
        const cot = cotizar();
        if (cot.errores.length) { aviso(cot.errores[0], "error"); return; }
        co.claveIdem = co.claveIdem || nuevaClave();
        pintar($("#resumenPago"), totalesHTML(cot));
        irPaso(3);
    }
    function errorPago(texto) { const p = $("#errorPago"); p.hidden = !texto; p.textContent = texto || ""; }

    async function onPagar(e) {
        e.preventDefault();
        if (co.procesando) return;                           // prevención de doble envío
        errorPago("");
        if (!requerirSesion("Tu sesión expiró. Inicia sesión para terminar tu compra.", () => abrirCarrito(true))) return;
        if (!co.metodoPago) { errorPago("Selecciona un método de pago."); $$("input[name=pago]")[0]?.focus(); return; }
        if (!$("#aceptoTerminosCheckout").checked) { errorPago("Para continuar debes aceptar los Términos y condiciones, la política de devoluciones y el Aviso de privacidad."); $("#aceptoTerminosCheckout").focus(); return; }
        if (!co.datos) { irPaso(1); return; }
        const sol = {
            lineas: lineas(), cupon: co.cupon, contacto: co.datos.contacto, entrega: co.datos.entrega,
            pago: { metodo: co.metodoPago, simulacion: $("#simulacion").value },
            terminos: { aceptado: true, version: POLITICAS.version }, claveIdempotencia: co.claveIdem
        };
        co.procesando = true;
        $("#confirmarCompra").disabled = true;
        abrir("procesandoPopup");
        try {
            await UI.espera(1300);
            const r = Servidor.crearPedido(sol);
            Servidor.carritoGuardar([]);
            co.cupon = ""; co.cuponMsg = null; co.claveIdem = null; co.metodoPago = ""; co.datos = null;
            $("#aceptoTerminosCheckout").checked = false;
            $$("input[name=pago]").forEach(x => { x.checked = false; });
            cerrar("procesandoPopup");
            cerrar("carritoPopup");
            cargarCatalogo(); renderCatalogo(); pintarContador();
            mostrarConfirmacion(r.pedido);
        } catch (err) {
            cerrar("procesandoPopup");
            if (err.estado === 402) errorPago("❌ " + err.message + " Puedes elegir “Pago aprobado” en la simulación y volver a intentar; tu carrito sigue intacto.");
            else { errorPago("⚠️ " + msgError(err)); if (err.estado === 409) { cargarCatalogo(); renderCatalogo(); renderCarrito(); } }
            if (err.estado === 401) refrescarSesion();
        } finally {
            co.procesando = false;
            $("#confirmarCompra").disabled = false;
        }
    }
    function mostrarConfirmacion(p) {
        est.ultimoFolio = p.folio;
        $("#numeroOrden").textContent = p.folio;
        pintar($("#resumenConfirmacion"), html`<div class="resumen-final">
            <h3>🧾 Resumen de compra</h3>
            ${p.lineas.map(l => html`<p>${l.cantidad} × ${l.nombre}${l.variante ? " (" + l.variante + ")" : ""} — ${mxn(l.total)}</p>`)}
            <p><strong>Total pagado:</strong> ${mxn(p.total)} (IVA incluido: ${mxn(p.ivaIncluido)})</p>
            <p><strong>Pago:</strong> ${p.pago.metodo} (sandbox) · ref. ${p.pago.referencia}</p>
            <p><strong>Entrega:</strong> ${p.entrega.etiqueta} · plazo estimado ${p.entrega.plazo}</p>
            <p><strong>Estado:</strong> ${p.estado}. Recibirás avisos de estado en Mi cuenta → Mensajes (simulados).</p>
        </div>`);
        abrir("confirmacionPopup");
    }
    function abrirCarrito(mantenerPaso) {
        cargarCatalogo();
        if (!mantenerPaso) reiniciarCheckout();
        prepararCheckout();
        renderCarrito();
        abrir("carritoPopup");
        if (mantenerPaso) irPaso(co.paso);
    }

    /* ============================================================
       DETALLE DE PRODUCTO
       ============================================================ */
    function abrirDetalle(id) {
        const p = est.catalogo.find(x => x.id === Number(id));
        if (!p) return;
        const v = p.vigente, tope = Math.min(POLITICAS.maxPorProducto, p.stock - 0);
        $("#detalleNombre").textContent = p.nombre;
        const zMin = Math.min(...ZONAS_ENVIO.map(z => z.costo));
        pintar($("#detalleCuerpo"), html`<div class="detalle-grid">
            <img src="${p.imagen || UI.imagenRespaldo(p.nombre)}" alt="${p.nombre}">
            <p class="detalle-precio">${v.enOferta ? html`<s class="precio-anterior">${mxn(v.lista)}</s> <span class="badge-oferta estatico">${v.porcentaje}% OFF</span> ` : ""}${mxn(v.precio)}</p>
            <p class="nota-iva">Precio en MXN, IVA incluido.${v.enOferta ? " Oferta vigente hasta el " + fechaCorta(v.hasta + "T12:00:00") + "." : ""}</p>
            <p id="detalleStock" class="stock-producto ${p.stock <= 0 ? "agotado" : p.stock <= 3 ? "pocas" : ""}">${p.stock <= 0 ? "❌ Agotado" : p.stock <= 3 ? `⚠️ ¡Últimas ${p.stock} piezas!` : `📦 Disponibles: ${p.stock}`}</p>
            <p id="detalleDescripcion">${p.descripcion}</p>
            <table class="especificaciones"><caption class="sr-only">Especificaciones</caption><tbody>
                <tr><th scope="row">Modelo</th><td>${p.sku}</td></tr>
                <tr><th scope="row">Categoría</th><td>${p.categoria}</td></tr>
                ${p.peso ? html`<tr><th scope="row">Peso</th><td>${p.peso}</td></tr>` : ""}
                ${p.dimensiones ? html`<tr><th scope="row">Dimensiones</th><td>${p.dimensiones}</td></tr>` : ""}
                <tr><th scope="row">Garantía</th><td>Mínimo ${POLITICAS.diasGarantia} días naturales (LFPC)</td></tr>
                <tr><th scope="row">Envío</th><td>Desde ${mxn(zMin)} según tu C.P.; costo y plazo exactos en el carrito. Recolección en tienda sin costo.</td></tr>
            </tbody></table>
            <div class="fila-detalle">
                ${p.variantes && p.variantes.length ? html`<div class="campo"><label for="detalleVariante">Variante</label>
                    <select id="detalleVariante">${p.variantes.map(x => html`<option value="${x}">${x}</option>`)}</select></div>` : ""}
                <div class="campo"><label for="detalleCantidad">Cantidad</label>
                    <input type="number" id="detalleCantidad" min="1" max="${Math.max(1, tope)}" value="1" ${p.stock <= 0 ? "disabled" : ""}></div>
            </div>
            <div class="botones-paso">
                <button type="button" class="btn-favorito-detalle btn-secundario" data-fav="${p.id}">${esFavorito(p.id) ? "❤️ Quitar de favoritos" : "🤍 Agregar a favoritos"}</button>
                <button id="agregarDetalle" type="button" class="btn-siguiente" data-id="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock <= 0 ? "Agotado" : "🛒 Agregar al carrito"}</button>
            </div>
        </div>`);
        abrir("productoPopup");
    }
    function onAgregarDetalle(btn) {
        const id = Number(btn.dataset.id), c = $("#detalleCantidad"), v = $("#detalleVariante");
        const cant = Math.floor(Number(c.value));
        if (!Number.isFinite(cant) || cant < 1) { UI.error(c, "Escribe una cantidad válida (mínimo 1)."); c.focus(); return; }
        UI.ok(c);
        if (agregar(id, v ? v.value : "", cant)) cerrar("productoPopup");
    }

    /* ============================================================
       MI CUENTA: perfil, direcciones, pedidos, devoluciones, mensajes
       ============================================================ */
    function abrirCuenta(tab = "tabPerfil", folio) {
        if (!requerirSesion("Inicia sesión para ver tu cuenta.", () => abrirCuenta(tab, folio))) return;
        tabsCuenta(tab);
        abrir("cuentaPopup");
        if (folio) abrirDetallePedido(folio);
    }
    function renderCuenta(idTab) {
        if (!est.usuario) return;
        ({ tabPerfil: renderPerfil, tabDirecciones: renderDirecciones, tabPedidos: renderPedidos, tabDevoluciones: renderDevoluciones, tabMensajes: renderMensajes }[idTab] || (() => {}))();
    }
    function renderPerfil() {
        const u = est.usuario;
        pintar($("#cuentaPerfil"), html`
            <form id="formPerfil" novalidate>
                <p class="nota">Usuario: <strong>${u.usuario}</strong> · Rol: ${u.rol}</p>
                <div class="campo"><label for="perfNombre">Nombre completo</label><input id="perfNombre" type="text" maxlength="80" value="${u.nombre}"></div>
                <div class="campo"><label for="perfCorreo">Correo electrónico</label><input id="perfCorreo" type="email" maxlength="120" value="${u.correo}"></div>
                <div class="campo"><label for="perfTelefono">Teléfono (10 dígitos)</label><input id="perfTelefono" type="tel" maxlength="14" value="${u.telefono}"></div>
                <label class="check"><input type="checkbox" id="perfMarketing" ${u.consentimiento && u.consentimiento.marketing ? "checked" : ""}> Quiero recibir promociones y novedades (opcional).</label>
                <p id="mensajePerfil" class="mensaje-form" role="alert"></p>
                <button type="submit" class="btn-siguiente">Guardar cambios</button>
            </form>
            <h3>Cambiar contraseña</h3>
            <form id="formClave" novalidate>
                <div class="campo"><label for="claveActual">Contraseña actual</label><input id="claveActual" type="password" autocomplete="current-password" maxlength="128"></div>
                <div class="campo"><label for="claveNueva">Nueva contraseña (mín. 8, letras y números)</label><input id="claveNueva" type="password" autocomplete="new-password" maxlength="128"></div>
                <p id="mensajeClave" class="mensaje-form" role="alert"></p>
                <button type="submit" class="btn-secundario">Cambiar contraseña</button>
            </form>
            <p class="nota">Para ejercer tus derechos ARCO consulta el <button type="button" class="enlace" data-legal="privacidad">Aviso de privacidad</button>.</p>`);
    }
    function onPerfil(e) {
        e.preventDefault();
        const m = $("#mensajePerfil");
        try {
            Servidor.actualizarPerfil({ nombre: $("#perfNombre").value, correo: $("#perfCorreo").value, telefono: $("#perfTelefono").value, marketing: $("#perfMarketing").checked });
            refrescarSesion();
            mensaje(m, "✅ Datos actualizados.", "ok");
        } catch (err) { mensaje(m, msgError(err)); }
    }
    async function onClave(e) {
        e.preventDefault();
        const m = $("#mensajeClave");
        try {
            await Servidor.cambiarClave({ actual: $("#claveActual").value, nueva: $("#claveNueva").value });
            $("#formClave").reset();
            mensaje(m, "✅ Contraseña actualizada.", "ok");
        } catch (err) { mensaje(m, msgError(err)); }
    }

    function renderDirecciones() {
        const dirs = est.usuario.direcciones || [], editar = est.dirEdit;
        const d = editar && editar !== "nueva" ? dirs.find(x => x.id === editar) || {} : {};
        pintar($("#cuentaDirecciones"), html`
            ${dirs.length ? dirs.map(x => html`<div class="tarjeta-direccion">
                <strong>${x.destinatario}</strong><br>${x.calle}, ${x.colonia}<br>${x.municipio}, ${x.estado}, C.P. ${x.cp}
                <div class="fila-acciones"><button type="button" data-accion="dir-editar" data-id="${x.id}">Editar</button><button type="button" data-accion="dir-borrar" data-id="${x.id}">Eliminar</button></div>
            </div>`) : html`<p class="lista-vacia">Aún no tienes direcciones guardadas.</p>`}
            ${editar === undefined ? html`<button type="button" class="btn-siguiente" data-accion="dir-nueva" ${dirs.length >= POLITICAS.maxDirecciones ? "disabled" : ""}>➕ Agregar dirección</button>` : html`
            <form id="formDireccion" novalidate>
                <h3>${editar === "nueva" ? "Nueva dirección" : "Editar dirección"}</h3>
                <input type="hidden" id="dirId" value="${editar === "nueva" ? "" : editar}">
                <div class="campo"><label for="dirDestinatario">Quién recibe</label><input id="dirDestinatario" maxlength="80" value="${d.destinatario || ""}"></div>
                <div class="campo"><label for="dirCalle">Calle y número</label><input id="dirCalle" maxlength="120" value="${d.calle || ""}"></div>
                <div class="campo"><label for="dirColonia">Colonia</label><input id="dirColonia" maxlength="80" value="${d.colonia || ""}"></div>
                <div class="campo"><label for="dirMunicipio">Municipio o alcaldía</label><input id="dirMunicipio" maxlength="80" value="${d.municipio || ""}"></div>
                <div class="campo"><label for="dirEstado">Estado</label><select id="dirEstado"><option value="">Elige un estado</option>${ESTADOS_MX.map(s => html`<option value="${s}" ${d.estado === s ? "selected" : ""}>${s}</option>`)}</select></div>
                <div class="campo"><label for="dirCP">Código postal</label><input id="dirCP" inputmode="numeric" maxlength="5" value="${d.cp || ""}"></div>
                <p id="mensajeDireccion" class="mensaje-form" role="alert"></p>
                <div class="botones-paso"><button type="button" class="btn-secundario" data-accion="dir-cancelar">Cancelar</button><button type="submit" class="btn-siguiente">Guardar</button></div>
            </form>`}`);
    }
    function onDireccion(e) {
        e.preventDefault();
        try {
            Servidor.guardarDireccion({ id: $("#dirId").value || undefined, destinatario: $("#dirDestinatario").value, calle: $("#dirCalle").value, colonia: $("#dirColonia").value, municipio: $("#dirMunicipio").value, estado: $("#dirEstado").value, cp: $("#dirCP").value.trim() });
            est.dirEdit = undefined;
            refrescarSesion(); renderDirecciones();
            aviso("✅ Dirección guardada.", "exito", 3000);
        } catch (err) { mensaje($("#mensajeDireccion"), msgError(err)); }
    }

    function renderPedidos() {
        let ps = [];
        try { ps = Servidor.misPedidos(); } catch (err) { aviso(msgError(err), "error"); }
        pintar($("#cuentaPedidos"), ps.length ? html`${ps.map(p => html`<article class="tarjeta-pedido">
            <div class="encabezado-pedido"><h3>🧾 ${p.folio}</h3>${estadoBadge(p.estado)}</div>
            <p class="nota">${fecha(p.creado)} · ${p.lineas.reduce((s, l) => s + l.cantidad, 0)} artículo(s) · <strong>${mxn(p.total)}</strong></p>
            <div class="fila-acciones"><button type="button" class="principal" data-accion="ver-pedido" data-folio="${p.folio}">Ver detalle</button></div>
        </article>`)}` : html`<p class="lista-vacia">📋 Aún no tienes pedidos. ¡Explora el catálogo!</p>`);
    }
    function detallePedido(p) {
        const accionesCancel = ["Pagado", "Preparando"].includes(p.estado);
        const puedeDevolver = ["Enviado", "Entregado"].includes(p.estado) && p.estado !== "Reembolsado";
        const a = p.entrega.direccion, pg = p.pagoDetalle;
        return html`
            <div class="encabezado-pedido"><strong>${fecha(p.creado)}</strong>${estadoBadge(p.estado)}</div>
            <h3>Productos</h3>
            ${p.lineas.map(l => html`<div class="linea-pedido"><span>${l.cantidad} × ${l.nombre}${l.variante ? " (" + l.variante + ")" : ""}<br><small>Modelo ${l.sku} · ${mxn(l.precioUnitario)} c/u</small></span><strong>${mxn(l.total)}</strong></div>`)}
            <div class="resumen-compra"><dl>
                <dt>Subtotal productos (IVA incl.)</dt><dd>${mxn(p.subtotal)}</dd>
                ${p.descuento > 0 ? html`<dt>Descuento (${p.cupon})</dt><dd>−${mxn(p.descuento)}</dd>` : ""}
                <dt>Envío (IVA incl.)</dt><dd>${mxn(p.envio)}</dd>
                <dt class="total-dt">Total pagado (MXN)</dt><dd class="total">${mxn(p.total)}</dd>
                <dt>IVA incluido</dt><dd>${mxn(p.ivaIncluido)}</dd></dl></div>
            <h3>Entrega</h3>
            <p>${p.entrega.etiqueta} · plazo estimado: ${p.entrega.plazo}<br>${a ? `${a.destinatario}, ${a.calle}, ${a.colonia}, ${a.municipio}, ${a.estado}, C.P. ${a.cp}` : "Recolección en tienda: " + EMPRESA.domicilio + " (ficticio)"}</p>
            ${p.guia ? html`<p><strong>Paquetería:</strong> ${p.guia.paqueteria} · <strong>Guía:</strong> ${p.guia.numero}</p>` : ""}
            ${p.incidencias.length ? html`<p><strong>Incidencias:</strong></p><ul>${p.incidencias.map(i => html`<li>${fecha(i.fecha)} — ${i.tipo}: ${i.nota}</li>`)}</ul>` : ""}
            <h3>Pago</h3>
            <p>${p.pago.metodo} (sandbox) · ref. ${p.pago.referencia} · estado: ${pg ? pg.estado : "—"}${pg && pg.reembolsado ? ` · reembolsado ${mxn(pg.reembolsado)}` : ""}</p>
            <p class="nota">Aceptaste Términos y Aviso de privacidad versión ${p.terminos.version} el ${fecha(p.terminos.aceptadoEn)}.</p>
            <h3>Seguimiento</h3>
            <ol class="linea-tiempo">${p.historial.map(h => html`<li><strong>${h.estado}</strong><small>${fecha(h.fecha)}${h.nota ? " — " + h.nota : ""}</small></li>`)}</ol>
            ${p.devoluciones.length ? html`<h3>Devoluciones y garantías</h3>${p.devoluciones.map(d => html`<p>${d.folio} — ${estadoBadge(d.estado)} (${d.motivoTexto})</p>`)}` : ""}
            <div class="fila-acciones">
                ${accionesCancel ? html`<button type="button" class="peligro" data-accion="cancelar" data-folio="${p.folio}">Cancelar pedido</button>` : ""}
                ${puedeDevolver ? html`<button type="button" class="principal" data-accion="devolver" data-folio="${p.folio}">Solicitar devolución o garantía</button>` : ""}
                <button type="button" data-accion="factura" data-folio="${p.folio}" data-correo="${p.contacto.correo}">Solicitar factura</button>
            </div>`;
    }
    function abrirDetallePedido(folio) {
        try { modal({ titulo: "Pedido " + folio, cuerpo: detallePedido(Servidor.obtenerPedido(folio)) }); }
        catch (err) { aviso(msgError(err), "error"); }
    }
    async function onCancelar(folio) {
        modal({
            nivel: 2, titulo: "Cancelar pedido " + folio, cuerpo: html`
            <form id="formCancelar" data-folio="${folio}" novalidate>
                <p>Se reembolsará el importe pagado y las piezas regresarán al inventario. Esta acción no se puede deshacer.</p>
                <div class="campo"><label for="cancelMotivo">Motivo de la cancelación</label><textarea id="cancelMotivo" rows="3" maxlength="300"></textarea></div>
                <p id="mensajeCancelar" class="mensaje-form" role="alert"></p>
                <button type="submit" class="btn-siguiente peligro">Confirmar cancelación</button>
            </form>`
        });
    }
    function onCancelarSubmit(e) {
        e.preventDefault();
        const folio = e.target.dataset.folio;
        try {
            Servidor.cancelarPedido(folio, $("#cancelMotivo").value);
            cerrarModal(2);
            cargarCatalogo(); renderCatalogo(); renderPedidos(); abrirDetallePedido(folio);
            aviso("✅ Pedido cancelado y reembolso registrado.", "exito");
        } catch (err) { mensaje($("#mensajeCancelar"), msgError(err)); }
    }
    function abrirDevolucion(folio) {
        let disp;
        try { disp = Servidor.disponiblesParaDevolver(folio); } catch (err) { aviso(msgError(err), "error"); return; }
        if (!disp.length) { aviso("Ya solicitaste la devolución de todos los productos de este pedido.", "info"); return; }
        modal({
            nivel: 2, titulo: "Solicitar devolución o garantía", cuerpo: html`
            <form id="formDevolucion" data-folio="${folio}" novalidate>
                <p class="nota">Pedido ${folio}. Recibirás un folio como acuse de recepción. Consulta la <button type="button" class="enlace" data-legal="devoluciones">política de devoluciones</button> y las <button type="button" class="enlace" data-legal="garantias">garantías</button>.</p>
                <div class="campo"><label for="devMotivo">Motivo</label>
                    <select id="devMotivo"><option value="">Elige un motivo</option>${Object.entries(MOTIVOS_DEVOLUCION).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
                <fieldset><legend>Productos a devolver</legend>
                    ${disp.map((x, i) => html`<div class="linea-pedido"><label class="check"><input type="checkbox" data-dev-item="${i}" data-id="${x.id}" data-variante="${x.variante}"> ${x.nombre}${x.variante ? " (" + x.variante + ")" : ""}</label>
                        <input type="number" min="1" max="${x.disponible}" value="1" data-dev-cant="${i}" class="cant-dev" aria-label="Cantidad de ${x.nombre} a devolver (máximo ${x.disponible})"></div>`)}
                </fieldset>
                <div class="campo"><label for="devDescripcion">Describe el problema y tus evidencias</label>
                    <textarea id="devDescripcion" rows="4" maxlength="500" placeholder="Ej.: no enciende desde el primer uso. Número de serie: ..."></textarea>
                    <small>No incluyas contraseñas ni datos de tarjeta.</small></div>
                <p id="avisoPlazo" class="nota" role="status"></p>
                <p id="mensajeDevolucion" class="mensaje-form" role="alert"></p>
                <button type="submit" class="btn-siguiente">Enviar solicitud</button>
            </form>`
        });
        $("#devMotivo").addEventListener("change", () => {
            try {
                const p = Servidor.obtenerPedido(folio), err = $("#devMotivo").value ? Servidor.plazoDevolucion(p, $("#devMotivo").value) : null;
                mensaje($("#avisoPlazo"), err ? "⚠️ " + err : "", "error");
            } catch { /* se valida al enviar */ }
        });
    }
    function onDevolucionSubmit(e) {
        e.preventDefault();
        const m = $("#mensajeDevolucion"), f = e.target;
        const items = $$("[data-dev-item]", f).filter(c => c.checked).map(c => ({ id: Number(c.dataset.id), variante: c.dataset.variante, cantidad: Number($(`[data-dev-cant="${c.dataset.devItem}"]`, f).value) }));
        try {
            const d = Servidor.solicitarDevolucion({ folio: f.dataset.folio, motivo: $("#devMotivo").value, descripcion: $("#devDescripcion").value, items });
            pintar($(".modal-cuerpo", $("#modalGeneral2")), html`
                <p class="aviso-sandbox">✅ Recibimos tu solicitud. <strong>Folio: ${d.folio}</strong><br>Pedido ${d.pedido} · ${d.motivoTexto}. Soporte te responderá en un máximo de ${POLITICAS.respuestaSoporteHoras} horas hábiles. Puedes seguir el estado en Mi cuenta → Devoluciones.</p>
                <button type="button" class="btn-siguiente" data-cerrar>Entendido</button>`);
            renderDevoluciones();
            abrirDetallePedido(d.pedido);
        } catch (err) { mensaje(m, msgError(err)); }
    }
    function renderDevoluciones() {
        let ds = [];
        try { ds = Servidor.misDevoluciones(); } catch (err) { aviso(msgError(err), "error"); }
        pintar($("#cuentaDevoluciones"), ds.length ? html`${ds.map(d => html`<article class="tarjeta-pedido">
            <div class="encabezado-pedido"><h3>↩️ ${d.folio}</h3>${estadoBadge(d.estado)}</div>
            <p class="nota">Pedido ${d.pedido} · ${d.motivoTexto} · ${fecha(d.creado)}</p>
            <p>${d.items.map(i => `${i.cantidad} × ${i.nombre}`).join(", ")}</p>
            ${d.respuesta ? html`<p><strong>Respuesta de soporte:</strong> ${d.respuesta}</p>` : ""}
            ${d.resolucion ? html`<p><strong>Resolución:</strong> ${d.resolucion}${d.reembolso ? " — reembolso de " + mxn(d.reembolso) : ""}</p>` : ""}
            <ol class="linea-tiempo">${d.historial.map(h => html`<li><strong>${h.estado}</strong><small>${fecha(h.fecha)}${h.nota ? " — " + h.nota : ""}</small></li>`)}</ol>
        </article>`)}` : html`<p class="lista-vacia">No tienes solicitudes de devolución o garantía.</p>`);
    }
    function renderMensajes() {
        let ms = [];
        try { ms = Servidor.misNotificaciones(); Servidor.marcarLeidas(); } catch (err) { aviso(msgError(err), "error"); }
        pintar($("#cuentaMensajes"), ms.length ? html`<p class="nota">Mensajes simulados: esta tienda no envía correos reales.</p>${ms.map(n => html`<article class="tarjeta-direccion"><strong>${n.asunto}</strong><br><small>${fecha(n.fecha)}</small><p>${n.mensaje}</p></article>`)}` : html`<p class="lista-vacia">No tienes mensajes.</p>`);
    }

    /* ============================================================
       SEGUIMIENTO PÚBLICO (folio + correo)
       ============================================================ */
    function abrirSeguimiento(folio, correo) {
        if (folio) $("#segFolio").value = folio;
        if (correo) $("#segCorreo").value = correo;
        else if (est.usuario && !$("#segCorreo").value) $("#segCorreo").value = est.usuario.correo || "";
        abrir("seguimientoPopup");
    }
    function onSeguimiento(e) {
        e.preventDefault();
        const out = $("#resultadoSeguimiento"), f = $("#segFolio"), c = $("#segCorreo");
        let ok = true;
        if (!f.value.trim()) { UI.error(f, "Escribe el folio de tu pedido."); ok = false; } else UI.ok(f);
        if (!validar.correo(c.value)) { UI.error(c, "Escribe el correo usado en la compra."); ok = false; } else UI.ok(c);
        if (!ok) return;
        try {
            const s = Servidor.seguimiento(f.value, c.value);
            pintar(out, html`<div class="tarjeta-pedido">
                <div class="encabezado-pedido"><h3>${s.folio}</h3>${estadoBadge(s.estado)}</div>
                <p class="nota">Pedido del ${fecha(s.creado)} · ${s.entrega.etiqueta} · plazo estimado: ${s.entrega.plazo}</p>
                ${s.guia ? html`<p><strong>Paquetería:</strong> ${s.guia.paqueteria} · <strong>Guía:</strong> ${s.guia.numero}</p>` : html`<p class="nota">Aún no hay guía de rastreo: se asigna cuando el pedido es enviado.</p>`}
                ${s.fechaEntrega ? html`<p><strong>Entregado:</strong> ${fecha(s.fechaEntrega)}</p>` : ""}
                ${s.incidencias.length ? html`<p><strong>Incidencias:</strong> ${s.incidencias.map(i => i.tipo).join("; ")}</p>` : ""}
                <ol class="linea-tiempo">${s.historial.map(h => html`<li><strong>${h.estado}</strong><small>${fecha(h.fecha)}</small></li>`)}</ol>
            </div>`);
        } catch (err) { pintar(out, html`<p class="mensaje-error" role="alert">${msgError(err)}</p>`); }
    }

    /* ============================================================
       AYUDA, CONTACTO, LEGAL Y FACTURACIÓN
       ============================================================ */
    function abrirLegal(clave) {
        const t = TEXTOS_LEGALES[clave];
        if (!t) return;
        modal({ titulo: t.titulo, cuerpo: raw(t.cuerpo()) });      // contenido propio y estático (no proviene del usuario)
    }
    function pintarAyuda() {
        pintar($("#ayudaFaq"), html`${FAQ.map(f => html`<details class="faq"><summary>${f.p}</summary><p>${f.r}</p></details>`)}`);
        pintar($("#ayudaPoliticas"), html`<ul class="lista-politicas">${Object.entries(TEXTOS_LEGALES).map(([k, t]) => html`<li><button type="button" data-legal="${k}">${t.titulo}</button></li>`)}</ul>`);
        $("#datosContacto").textContent = `${EMPRESA.correo} · ${EMPRESA.telefono} · ${EMPRESA.horario}`;
    }
    function onContacto(e) {
        e.preventDefault();
        const m = $("#mensajeContacto");
        try {
            const t = Servidor.crearTicket({ nombre: $("#ctNombre").value, correo: $("#ctCorreo").value, tipo: $("#ctTipo").value, asunto: $("#ctAsunto").value, mensaje: $("#ctMensaje").value });
            e.target.reset();
            mensaje(m, `✅ Recibimos tu solicitud. Tu folio de atención es ${t.folio}. Respuesta en máximo ${POLITICAS.respuestaSoporteHoras} horas hábiles.`, "ok");
        } catch (err) { mensaje(m, msgError(err)); }
    }
    function abrirFactura(folio = "", correo = "") {
        modal({
            titulo: "Solicitar factura", cuerpo: html`
            <p class="nota-legal">Esta tienda académica <strong>no emite CFDI válidos</strong>: la solicitud solo queda registrada. Plazo: hasta el último día del mes de la compra. <button type="button" class="enlace" data-legal="facturacion">Más información</button></p>
            <form id="formFactura" novalidate>
                <div class="campo"><label for="facFolio">Folio del pedido</label><input id="facFolio" maxlength="20" value="${folio}"></div>
                <div class="campo"><label for="facCorreo">Correo usado en la compra</label><input id="facCorreo" type="email" maxlength="120" value="${correo}"></div>
                <div class="campo"><label for="facRfc">RFC</label><input id="facRfc" maxlength="13" autocapitalize="characters"></div>
                <div class="campo"><label for="facRazon">Razón social o nombre</label><input id="facRazon" maxlength="150"></div>
                <div class="campo"><label for="facRegimen">Régimen fiscal</label><input id="facRegimen" maxlength="100" placeholder="Ej. 612 Personas físicas con actividad empresarial"></div>
                <div class="campo"><label for="facUso">Uso de CFDI</label><input id="facUso" maxlength="100" placeholder="Ej. G03 Gastos en general"></div>
                <div class="campo"><label for="facCP">Código postal fiscal</label><input id="facCP" inputmode="numeric" maxlength="5"></div>
                <p id="mensajeFactura" class="mensaje-form" role="alert"></p>
                <button type="submit" class="btn-siguiente">Registrar solicitud</button>
            </form>`
        });
    }
    function onFactura(e) {
        e.preventDefault();
        const m = $("#mensajeFactura");
        try {
            const s = Servidor.solicitarFactura({ folio: $("#facFolio").value, correo: $("#facCorreo").value, rfc: $("#facRfc").value, razonSocial: $("#facRazon").value, regimen: $("#facRegimen").value, usoCfdi: $("#facUso").value, cp: $("#facCP").value.trim() });
            mensaje(m, `✅ Solicitud registrada con el folio ${s.folio}. (No se generó ningún CFDI.)`, "ok");
            e.target.querySelector("button[type=submit]").disabled = true;
        } catch (err) { mensaje(m, msgError(err)); }
    }
    function pintarPie() {
        pintar($("#pieEmpresa"), html`
            <h2 class="pie-titulo">${EMPRESA.razonSocial}</h2>
            <p><strong>Nombre comercial:</strong> ${EMPRESA.nombreComercial}</p>
            <p><strong>RFC:</strong> ${EMPRESA.rfc}</p>
            <p><strong>Domicilio:</strong> ${EMPRESA.domicilio}</p>
            <p><strong>Contacto:</strong> ${EMPRESA.correo} · Tel. ${EMPRESA.telefono}</p>
            <p><strong>Horario:</strong> ${EMPRESA.horario}</p>
            <p class="pie-aclaracion">${EMPRESA.aclaracion}</p>
            <p class="pie-nota">Para comprar debes ser mayor de 18 años.</p>`);
    }

    /* ============================================================
       EVENTOS (delegación)
       ============================================================ */
    document.addEventListener("click", e => {
        const t = e.target;
        let b;
        if ((b = t.closest("[data-legal]"))) { e.preventDefault(); abrirLegal(b.dataset.legal); return; }
        if ((b = t.closest("[data-fav]"))) { alternarFavorito(b.dataset.fav); if (b.classList.contains("btn-favorito-detalle")) b.textContent = esFavorito(b.dataset.fav) ? "❤️ Quitar de favoritos" : "🤍 Agregar a favoritos"; return; }
        if ((b = t.closest("[data-detalle]"))) { cerrar("favoritosPopup"); abrirDetalle(b.dataset.detalle); return; }
        if ((b = t.closest("[data-agregar]"))) {
            const p = est.catalogo.find(x => x.id === Number(b.dataset.agregar));
            if (p && p.variantes && p.variantes.length) { abrirDetalle(p.id); aviso("Elige la variante que deseas.", "info", 2500); } else agregar(b.dataset.agregar, "");
            return;
        }
        if ((b = t.closest("#agregarDetalle"))) { onAgregarDetalle(b); return; }
        if ((b = t.closest("[data-categoria]"))) {
            const sel = $("#filtroCategoria");
            sel.value = sel.value === b.dataset.categoria ? "todas" : b.dataset.categoria;
            est.pagina = 1; renderCatalogo();
            $("#catalogo").scrollIntoView({ behavior: "smooth" });
            return;
        }
        if ((b = t.closest("[data-pagina]"))) { est.pagina = Number(b.dataset.pagina); renderCatalogo(); $("#catalogo").scrollIntoView({ behavior: "smooth" }); return; }
        if ((b = t.closest("[data-menos]"))) { const l = lineas().find(x => x.id === Number(b.dataset.menos) && x.variante === b.dataset.variante); if (l) cambiarCantidad(l.id, l.variante, l.cantidad - 1); return; }
        if ((b = t.closest("[data-mas]"))) { const l = lineas().find(x => x.id === Number(b.dataset.mas) && x.variante === b.dataset.variante); if (l) cambiarCantidad(l.id, l.variante, l.cantidad + 1); return; }
        if ((b = t.closest("[data-quitar]"))) { quitarLinea(b.dataset.quitar, b.dataset.variante); return; }
        if ((b = t.closest("[data-accion]"))) {
            const d = b.dataset;
            switch (d.accion) {
                case "limpiar-filtros": limpiarFiltros(); break;
                case "ver-pedido": abrirDetallePedido(d.folio); break;
                case "cancelar": onCancelar(d.folio); break;
                case "devolver": abrirDevolucion(d.folio); break;
                case "factura": abrirFactura(d.folio, d.correo); break;
                case "dir-nueva": est.dirEdit = "nueva"; renderDirecciones(); break;
                case "dir-editar": est.dirEdit = d.id; renderDirecciones(); break;
                case "dir-cancelar": est.dirEdit = undefined; renderDirecciones(); break;
                case "dir-borrar":
                    confirmar({ titulo: "Eliminar dirección", mensaje: "¿Seguro que quieres eliminar esta dirección?", ok: "Eliminar", peligro: true }).then(ok => {
                        if (ok) { Servidor.eliminarDireccion(d.id); refrescarSesion(); renderDirecciones(); aviso("Dirección eliminada.", "info", 2500); }
                    });
                    break;
            }
        }
    });
    document.addEventListener("submit", e => {
        const id = e.target.id;
        const mapa = {
            formEnvio: onEnvio, formPago: onPagar, formLogin: onLogin, formRegistro: onRegistro, formRecuperar: onRecuperar, formSeguimiento: onSeguimiento,
            formContacto: onContacto, formPerfil: onPerfil, formClave: onClave, formDireccion: onDireccion, formCancelar: onCancelarSubmit,
            formDevolucion: onDevolucionSubmit, formFactura: onFactura
        };
        if (mapa[id]) mapa[id](e);
    });
    document.addEventListener("change", e => {
        const t = e.target;
        if (t.name === "entrega") { co.metodoEntrega = t.value; actualizarInfoEnvio(); renderCarrito(); }
        else if (t.name === "pago") { co.metodoPago = t.value; errorPago(""); }
        else if (t.id === "envDirGuardada") { const d = (est.usuario.direcciones || []).find(x => x.id === t.value); if (d) llenarDireccion(d); }
        else if (t.dataset && t.dataset.cant) { cambiarCantidad(t.dataset.cant, t.dataset.variante, Math.floor(Number(t.value)) || 1); }
    });
    document.addEventListener("input", e => {
        const t = e.target;
        if (t.id === "codigoPostal" || t.id === "dirCP") t.value = t.value.replace(/\D/g, "");
        if (t.id === "codigoPostal") { actualizarInfoEnvio(); renderCarrito(); }
        if (t.id === "buscador") { est.pagina = 1; debBuscar(); }
        if (t.matches && t.matches(".campo-error")) UI.ok(t);
    });
    const debBuscar = UI.debounce(renderCatalogo, 200);

    $("#carritoBtn").onclick = () => abrirCarrito(false);
    $("#carritoFab").onclick = () => abrirCarrito(false);
    $("#loginBtn").onclick = () => abrirLogin();
    $("#logoutBtn").onclick = cerrarSesion;
    $("#cuentaBtn").onclick = () => abrirCuenta("tabPerfil");
    $("#seguimientoBtn").onclick = () => abrirSeguimiento();
    $("#favoritosBtn").onclick = () => { renderFavoritos(); abrir("favoritosPopup"); };
    $("#ayudaBtn").onclick = () => {
        if (est.usuario) { if (!$("#ctNombre").value) $("#ctNombre").value = est.usuario.nombre; if (!$("#ctCorreo").value) $("#ctCorreo").value = est.usuario.correo; }
        tabsAyuda("tabFaq"); abrir("ayudaPopup");
    };
    $("#btnFactura").onclick = () => abrirFactura();
    $("#aplicarCupon").onclick = onAplicarCupon;
    $("#codigoCupon").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); onAplicarCupon(); } });
    $("#quitarCupon").onclick = () => { co.cupon = ""; co.cuponMsg = null; $("#codigoCupon").value = ""; renderCarrito(); };
    $("#atras2").onclick = () => irPaso(1);
    $("#atras3").onclick = () => irPaso(2);
    $("#btnPaso3").onclick = onPaso3;
    $("#recConfirmar").onclick = onRecuperarConfirmar;
    $("#verSeguimiento").onclick = () => { cerrar("confirmacionPopup"); abrirCuenta("tabPedidos", est.ultimoFolio); };
    ["filtroCategoria", "filtroPrecio", "filtroDisponibilidad", "ordenProductos"].forEach(id => $("#" + id).addEventListener("change", () => { est.pagina = 1; renderCatalogo(); }));
    $("#limpiarFiltros").onclick = limpiarFiltros;
    $("#cuentaPopup").addEventListener("tab-activada", e => renderCuenta(e.target.id));
    $("#loginPopup").addEventListener("tab-activada", () => { $("#avisoLogin").hidden = !$("#avisoLogin").textContent; });

    /* Cookies / almacenamiento local: solo se informa (no hay cookies no esenciales). */
    try { if (!localStorage.getItem("cookiesAceptadas")) $("#cookieBanner").hidden = false; } catch { $("#cookieBanner").hidden = false; }
    $("#cookiesAceptar").onclick = () => { try { localStorage.setItem("cookiesAceptadas", "true"); } catch { /* nada */ } $("#cookieBanner").hidden = true; };

    /* Sesión: expiración por inactividad y sincronía entre pestañas */
    let ultimoToque = 0;
    ["click", "keydown"].forEach(ev => document.addEventListener(ev, () => {
        if (est.usuario && Date.now() - ultimoToque > 10000) { Servidor.tocarSesion(); ultimoToque = Date.now(); }
    }, true));
    setInterval(() => {
        if (est.usuario && !Servidor.sesionActual()) {
            est.usuario = null; pintarSesion(); renderFavoritosEstado(); cerrar("cuentaPopup");
            aviso("⏱️ Tu sesión expiró por inactividad. Inicia sesión de nuevo para continuar.", "info", 8000);
        }
    }, 15000);
    window.addEventListener("storage", e => {
        if (e.key === "tdn2_db") { cargarCatalogo(); llenarFiltros(); renderCatalogo(); if ($("#carritoPopup").classList.contains("visible")) renderCarrito(); }
        if (e.key === "tdn2_sesion") refrescarSesion();
        if (e.key === "tdn2_carrito") { pintarContador(); renderCatalogo(); }
    });

    /* ---------------- Arranque ---------------- */
    // migración: favoritos de la versión anterior (lista global) → invitado
    if (localStorage.getItem("tdn2_fav_invitado") === null && localStorage.getItem("favoritos")) guardarJSON("tdn2_fav_invitado", leerJSON("favoritos", []).map(Number));
    pintarPie();
    pintarAyuda();
    pintarMetodos();
    cargarCatalogo();
    llenarFiltros();
    refrescarSesion();
    renderCatalogo();
    pintarContador();
    prepararCheckout();
    actualizarInfoEnvio();
})();
