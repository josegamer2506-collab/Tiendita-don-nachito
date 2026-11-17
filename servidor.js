"use strict";
/* ============================================================
   servidor.js — Capa de "servidor" SIMULADA en el navegador.

   El proyecto exige backend + base de datos relacional. Esta tienda es
   un sitio estático, así que aquí se SIMULA esa capa con la misma
   disciplina que tendría una API real:
     · La interfaz nunca calcula precios ni totales "oficiales": los
       recalcula esta capa desde el catálogo (no confía en el navegador).
     · Cada operación crítica es una transacción (todo o nada).
     · Autorización por rol en CADA función (no solo ocultar botones).
     · Contraseñas con hash (PBKDF2-SHA256 + sal), nunca en texto plano.
     · No existe ningún campo para número de tarjeta ni CVV.
     · Inventario con movimientos, estados de pedido con transiciones
       controladas, idempotencia en la creación del pedido y bitácora.
   Los datos viven en localStorage (clave tdn2_db). Para pasar a un
   backend real basta reemplazar estas funciones por llamadas fetch().
   LIMITACIÓN: al correr en el navegador, un usuario técnico puede
   alterar su propio localStorage; la seguridad real exige un servidor.
   ============================================================ */
const Servidor = (() => {
    const K = { db: "tdn2_db", sesion: "tdn2_sesion", carrito: "tdn2_carrito", limites: "tdn2_limites" };

    const ESTADOS_PEDIDO = ["Pagado", "Preparando", "Enviado", "Entregado", "Cancelado", "Devuelto al remitente", "Reembolsado"];
    const TRANSICIONES = {
        "Pagado": ["Preparando", "Cancelado"],
        "Preparando": ["Enviado", "Cancelado"],
        "Enviado": ["Entregado", "Devuelto al remitente"],
        "Entregado": [], "Cancelado": [], "Devuelto al remitente": [], "Reembolsado": []
    };
    const ESTADOS_SIN_VENTA = ["Cancelado", "Devuelto al remitente", "Reembolsado"];
    const PERMISOS = {
        admin: ["*"],
        soporte: ["pedidos.ver", "pedidos.estado", "devoluciones.gestionar", "atencion.gestionar", "clientes.ver"],
        cliente: []
    };
    const INCIDENCIAS = ["Intento de entrega fallido", "Dirección incorrecta o incompleta", "Paquete dañado", "Retraso en la entrega", "Otra"];

    class ErrorApi extends Error {
        constructor(estado, mensaje, extra) { super(mensaje); this.name = "ErrorApi"; this.estado = estado; Object.assign(this, extra || {}); }
    }
    const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const ahoraISO = () => new Date().toISOString();
    const folio = (pref, n, ancho = 6) => `${pref}-${String(n).padStart(ancho, "0")}`;
    const texto = (v, min, max, campo) => {
        const s = String(v ?? "").trim().replace(/\s+/g, " ");
        if (s.length < min || s.length > max) throw new ErrorApi(422, `${campo}: escribe entre ${min} y ${max} caracteres.`);
        return s;
    };

    /* ---------------- Almacenamiento (tolerante a modo privado / cuota) ---------------- */
    const mem = {};
    const almacen = {
        leer(k) { try { const v = localStorage.getItem(k); return v === null ? (mem[k] ?? null) : v; } catch { return mem[k] ?? null; } },
        escribir(k, v) { try { localStorage.setItem(k, v); delete mem[k]; } catch { mem[k] = v; } },
        borrar(k) { try { localStorage.removeItem(k); } catch { /* sin acceso */ } delete mem[k]; }
    };
    const leerDB = () => {
        const raw = almacen.leer(K.db);
        if (!raw) throw new ErrorApi(500, "La base de datos local no está inicializada.");
        try { return JSON.parse(raw); } catch { throw new ErrorApi(500, "Los datos locales están dañados. Restablece los datos de demostración."); }
    };
    const escribirDB = d => almacen.escribir(K.db, JSON.stringify(d));
    /* Transacción: la función trabaja sobre una copia; solo si termina sin error se guarda. */
    const tx = fn => { const d = leerDB(); const r = fn(d); escribirDB(d); return r; };
    const lectura = fn => fn(leerDB());
    const siguiente = (d, n) => (d.contadores[n] = (d.contadores[n] || 0) + 1);

    /* ---------------- Hash de contraseñas ---------------- */
    const enc = new TextEncoder();
    const aB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const hayWebCrypto = () => !!(globalThis.crypto && crypto.subtle);

    function sha256(bytes) { // SHA-256 en JS puro: solo si el navegador no ofrece crypto.subtle (p. ej. http sin TLS)
        const K32 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        const l = bytes.length, n = (((l + 9 + 63) >> 6) << 6), b = new Uint8Array(n);
        b.set(bytes); b[l] = 0x80;
        const dv = new DataView(b.buffer); dv.setUint32(n - 4, l * 8, false); dv.setUint32(n - 8, Math.floor(l * 8 / 4294967296), false);
        const w = new Uint32Array(64), rotr = (x, k) => (x >>> k) | (x << (32 - k));
        for (let o = 0; o < n; o += 64) {
            for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4, false);
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3), s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
                w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
            }
            let [a, bb, c, d, e, f, g, h] = H;
            for (let i = 0; i < 64; i++) {
                const t1 = (h + (rotr(e,6) ^ rotr(e,11) ^ rotr(e,25)) + ((e & f) ^ (~e & g)) + K32[i] + w[i]) | 0;
                const t2 = ((rotr(a,2) ^ rotr(a,13) ^ rotr(a,22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
            }
            H[0] = (H[0]+a)|0; H[1] = (H[1]+bb)|0; H[2] = (H[2]+c)|0; H[3] = (H[3]+d)|0; H[4] = (H[4]+e)|0; H[5] = (H[5]+f)|0; H[6] = (H[6]+g)|0; H[7] = (H[7]+h)|0;
        }
        const out = new Uint8Array(32), o = new DataView(out.buffer);
        H.forEach((v, i) => o.setUint32(i * 4, v, false));
        return out;
    }
    async function derivar(clave, salB64, algoritmo) {
        const sal = deB64(salB64);
        if (algoritmo.startsWith("pbkdf2-sha256-") && hayWebCrypto()) {
            const base = await crypto.subtle.importKey("raw", enc.encode(clave), "PBKDF2", false, ["deriveBits"]);
            return aB64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: Number(algoritmo.split("-")[2]) }, base, 256));
        }
        const iter = algoritmo.startsWith("sha256js-") ? Number(algoritmo.split("-")[1]) : 20000;
        let h = sha256(new Uint8Array([...sal, ...enc.encode(clave)]));
        for (let i = 0; i < iter; i++) h = sha256(new Uint8Array([...h, ...sal]));
        return aB64(h);
    }
    async function nuevoHash(clave) {
        const sal = aB64(crypto.getRandomValues(new Uint8Array(16)));
        const algoritmo = hayWebCrypto() ? "pbkdf2-sha256-150000" : "sha256js-20000";
        return { sal, algoritmo, hash: await derivar(clave, sal, algoritmo) };
    }
    const igualConstante = (a, b) => {
        a = String(a); b = String(b);
        let x = a.length ^ b.length;
        for (let i = 0; i < Math.max(a.length, b.length); i++) x |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
        return x === 0;
    };
    const claveValida = c => {
        c = String(c ?? "");
        if (c.length < 8 || c.length > 128 || !/[A-Za-z]/.test(c) || !/\d/.test(c))
            throw new ErrorApi(422, "La contraseña debe tener al menos 8 caracteres, con letras y números.");
        return c;
    };

    /* ---------------- Límite de intentos (rate limiting simulado) ---------------- */
    const leerLimites = () => { try { return JSON.parse(almacen.leer(K.limites)) || {}; } catch { return {}; } };
    function verificarLimite(clave, max, ventanaMs, mensaje) {
        const ahora = Date.now(), lista = (leerLimites()[clave] || []).filter(x => ahora - x < ventanaMs);
        if (lista.length >= max) {
            const seg = Math.ceil((ventanaMs - (ahora - lista[0])) / 1000);
            throw new ErrorApi(429, `${mensaje || "Demasiados intentos."} Intenta de nuevo en ${seg > 90 ? Math.ceil(seg / 60) + " min" : seg + " s"}.`);
        }
    }
    function registrarIntento(clave, ventanaMs) {
        const t = leerLimites(), ahora = Date.now();
        t[clave] = (t[clave] || []).filter(x => ahora - x < ventanaMs).concat(ahora);
        almacen.escribir(K.limites, JSON.stringify(t));
    }
    /* limitar(): cuenta el intento aunque falle (login, seguimiento, recuperación).
       limitarExito(): solo cuenta si la operación se completó (no castiga errores de captura). */
    function limitar(clave, max, ventanaMs, mensaje) { verificarLimite(clave, max, ventanaMs, mensaje); registrarIntento(clave, ventanaMs); }
    function limitarExito(clave, max, ventanaMs, mensaje, fn) { verificarLimite(clave, max, ventanaMs, mensaje); const r = fn(); registrarIntento(clave, ventanaMs); return r; }
    const hayBloqueo = (clave, max, ventanaMs) => {
        let t; try { t = JSON.parse(almacen.leer(K.limites)) || {}; } catch { t = {}; }
        return (t[clave] || []).filter(x => Date.now() - x < ventanaMs).length >= max;
    };
    const limpiarLimite = clave => { try { const t = JSON.parse(almacen.leer(K.limites)) || {}; delete t[clave]; almacen.escribir(K.limites, JSON.stringify(t)); } catch { /* nada */ } };

    /* ---------------- Sesión, roles y permisos ---------------- */
    const sesionLeer = () => { try { return JSON.parse(almacen.leer(K.sesion)); } catch { return null; } };
    const crearSesion = u => almacen.escribir(K.sesion, JSON.stringify({ usuarioId: u.id, expira: Date.now() + POLITICAS.sesionMinutos * 60000 }));
    const tiene = (u, p) => { const l = PERMISOS[u.rol] || []; return l.includes("*") || l.includes(p); };
    function usuarioEn(d) {
        const s = sesionLeer();
        if (!s || Date.now() > s.expira) return null;
        const u = d.usuarios.find(x => x.id === s.usuarioId);
        return u && u.estado === "activo" ? u : null;
    }
    function requerir(d, permiso) {
        const u = usuarioEn(d);
        if (!u) throw new ErrorApi(401, "Debes iniciar sesión para continuar.");
        if (permiso && !tiene(u, permiso)) throw new ErrorApi(403, "Acceso denegado: no tienes permiso para esta acción.");
        return u;
    }
    const publico = u => { const { hash, sal, algoritmo, claveLegacy, ...resto } = u; return { ...resto, permisos: PERMISOS[u.rol] || [] }; };
    const sesionActual = () => {
        const s = sesionLeer();
        if (!s) return null;
        if (Date.now() > s.expira) { almacen.borrar(K.sesion); return null; }
        try { const u = usuarioEn(leerDB()); if (!u) { almacen.borrar(K.sesion); return null; } return publico(u); } catch { return null; }
    };
    const tocarSesion = () => { const s = sesionLeer(); if (s && Date.now() <= s.expira) { s.expira = Date.now() + POLITICAS.sesionMinutos * 60000; almacen.escribir(K.sesion, JSON.stringify(s)); } };
    const cerrarSesion = () => { const u = sesionActual(); almacen.borrar(K.sesion); if (u) { try { tx(d => audit(d, u, "logout", "usuario", u.id)); } catch { /* nada */ } } };

    /* ---------------- Bitácora y notificaciones ---------------- */
    function audit(d, actor, accion, entidad, entidadId, detalle) {
        d.auditoria.push({ id: siguiente(d, "auditoria"), fecha: ahoraISO(), actor: actor ? `${actor.usuario} (#${actor.id}, ${actor.rol})` : "sistema", accion, entidad, entidadId: String(entidadId ?? ""), detalle: detalle || "" });
        if (d.auditoria.length > 2000) d.auditoria.splice(0, d.auditoria.length - 2000);
    }
    function notificar(d, usuarioId, asunto, mensaje) {
        if (!usuarioId) return;
        d.notificaciones.push({ id: siguiente(d, "notificacion"), usuarioId, fecha: ahoraISO(), asunto, mensaje, leida: false });
    }

    /* ---------------- Precios y catálogo ---------------- */
    function precioVigente(p, ahora = new Date()) {
        const lista = r2(p.precio);
        if (p.oferta && p.oferta.porcentaje > 0 && ahora <= new Date(p.oferta.hasta + "T23:59:59")) {
            return { lista, precio: r2(lista * (1 - p.oferta.porcentaje / 100)), enOferta: true, porcentaje: p.oferta.porcentaje, hasta: p.oferta.hasta };
        }
        return { lista, precio: lista, enOferta: false, porcentaje: 0, hasta: null };
    }
    const vistaProducto = p => ({ ...p, vigente: precioVigente(p) });

    function catalogo() {
        return lectura(d => {
            const activas = d.categorias.filter(c => c.estado === "activa");
            const nombres = new Set(activas.map(c => c.nombre));
            return {
                categorias: activas,
                productos: d.productos.filter(p => p.estado === "activo" && nombres.has(p.categoria)).map(vistaProducto)
            };
        });
    }
    function obtenerProducto(id) {
        return lectura(d => { const p = d.productos.find(x => x.id === Number(id) && x.estado === "activo"); return p ? vistaProducto(p) : null; });
    }
    function popularidad() {
        return lectura(d => {
            const m = {};
            d.pedidos.filter(p => !ESTADOS_SIN_VENTA.includes(p.estado)).forEach(p => p.lineas.forEach(l => { m[l.id] = (m[l.id] || 0) + l.cantidad; }));
            return m;
        });
    }
    const zonaPorCP = cp => {
        cp = String(cp ?? "").trim();
        if (!/^\d{5}$/.test(cp) || Number(cp) < 1000) return null;
        const n = Number(cp.slice(0, 2));
        return ZONAS_ENVIO.find(z => n >= z.desde && n <= z.hasta) || null;
    };
    function calcularEntrega(entrega) {
        if (!entrega || !entrega.metodo) return null;
        const m = METODOS_ENTREGA.find(x => x.id === entrega.metodo);
        if (!m) return { error: "Método de entrega no válido." };
        if (m.id === "recoleccion") return { metodo: m.id, etiqueta: m.etiqueta, costo: 0, plazo: m.plazo, zona: "Recolección" };
        const z = zonaPorCP(entrega.cp);
        if (!z) return { error: "Escribe un código postal válido de 5 dígitos." };
        return { metodo: m.id, etiqueta: m.etiqueta, costo: r2(z.costo + m.recargo), plazo: m.plazo || z.plazo, zona: z.nombre };
    }

    /* ---------------- Cupones (validación del lado "servidor") ---------------- */
    function evaluarCupon(d, codigo, subtotal, usuarioId, ahora = new Date()) {
        codigo = String(codigo || "").trim().toUpperCase();
        if (!codigo) return null;
        const c = d.cupones.find(x => x.codigo === codigo);
        if (!c || !c.activo) return { ok: false, codigo, mensaje: "Cupón no válido." };
        if (ahora < new Date(c.desde + "T00:00:00")) return { ok: false, codigo, mensaje: `El cupón aún no está vigente (inicia el ${c.desde}).` };
        if (ahora > new Date(c.hasta + "T23:59:59")) return { ok: false, codigo, mensaje: `El cupón venció el ${c.hasta}.` };
        if (subtotal < c.minimoCompra) return { ok: false, codigo, mensaje: `Este cupón requiere una compra mínima de $${c.minimoCompra.toLocaleString("es-MX")} MXN.` };
        const usos = c.usos || [];
        if (c.usosMaximos != null && usos.length >= c.usosMaximos) return { ok: false, codigo, mensaje: "El cupón alcanzó su límite de usos." };
        if (c.usosPorUsuario != null && usuarioId != null && usos.filter(u => u.usuarioId === usuarioId).length >= c.usosPorUsuario)
            return { ok: false, codigo, mensaje: `Ya usaste este cupón el máximo de veces permitido (${c.usosPorUsuario}).` };
        const descuento = c.tipo === "porcentaje" ? r2(subtotal * c.valor / 100) : Math.min(r2(c.valor), subtotal);
        return { ok: true, codigo, descuento, mensaje: c.tipo === "porcentaje" ? `Cupón aplicado: ${c.valor}% de descuento.` : `Cupón aplicado: $${c.valor} MXN de descuento.` };
    }

    /* ---------------- Cotización: ÚNICA fuente de precios y totales ---------------- */
    function cotizarEn(d, { lineas, cupon, entrega, usuarioId }) {
        const ahora = new Date(), errores = [], items = [], porProducto = {};
        for (const l of (Array.isArray(lineas) ? lineas : [])) {
            const p = d.productos.find(x => x.id === Number(l.id));
            const cant = Math.floor(Number(l.cantidad));
            if (!p || p.estado !== "activo" || !d.categorias.some(c => c.nombre === p.categoria && c.estado === "activa")) { errores.push("Un producto de tu carrito ya no está disponible."); continue; }
            if (!Number.isFinite(cant) || cant < 1) { errores.push(`Cantidad no válida para ${p.nombre}.`); continue; }
            if (p.variantes && p.variantes.length && !p.variantes.includes(l.variante)) { errores.push(`Elige una variante válida de ${p.nombre}.`); continue; }
            porProducto[p.id] = (porProducto[p.id] || 0) + cant;
            const v = precioVigente(p, ahora);
            items.push({ id: p.id, sku: p.sku, nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria, imagen: p.imagen, variante: l.variante || "", cantidad: cant, precioLista: v.lista, precioUnitario: v.precio, total: r2(v.precio * cant) });
        }
        for (const [id, cant] of Object.entries(porProducto)) {
            const p = d.productos.find(x => x.id === Number(id));
            if (cant > POLITICAS.maxPorProducto) errores.push(`Máximo ${POLITICAS.maxPorProducto} unidades de ${p.nombre} por pedido.`);
            if (cant > p.stock) errores.push(p.stock > 0 ? `No hay suficientes existencias de ${p.nombre} (disponibles: ${p.stock}).` : `${p.nombre} está agotado.`);
        }
        if (!items.length && !errores.length) errores.push("El carrito está vacío.");
        const subtotal = r2(items.reduce((s, i) => s + i.total, 0));
        const cup = evaluarCupon(d, cupon, subtotal, usuarioId, ahora);
        const descuento = cup && cup.ok ? cup.descuento : 0;
        const ent = calcularEntrega(entrega);
        const envio = ent && !ent.error ? ent.costo : null;
        const total = r2(subtotal - descuento + (envio || 0));
        return {
            lineas: items, subtotal, descuento, cupon: cup, entrega: ent, envio, total,
            ivaIncluido: r2(total - total / (1 + POLITICAS.iva)), errores
        };
    }
    const cotizar = sol => lectura(d => { const u = usuarioEn(d); return cotizarEn(d, { ...sol, usuarioId: u ? u.id : null }); });

    /* ---------------- Carrito (solo guarda id, variante y cantidad; nunca precios) ---------------- */
    const carritoLeer = () => { try { const c = JSON.parse(almacen.leer(K.carrito)); return Array.isArray(c) ? c : []; } catch { return []; } };
    const carritoGuardar = l => almacen.escribir(K.carrito, JSON.stringify(l));

    /* ---------------- Inventario ---------------- */
    function moverStock(d, p, delta, tipo, motivo, actor, referencia) {
        const antes = p.stock, despues = antes + delta;
        if (despues < 0) throw new ErrorApi(409, `Inventario insuficiente de ${p.nombre}.`);
        p.stock = despues;
        d.movimientos.push({ id: siguiente(d, "movimiento"), productoId: p.id, sku: p.sku, producto: p.nombre, tipo, cantidad: delta, stockAntes: antes, stockDespues: despues, motivo: motivo || "", usuario: actor ? actor.usuario : "sistema", referencia: referencia || "", fecha: ahoraISO() });
    }

    /* ---------------- Validaciones de datos ---------------- */
    const validarContacto = c => {
        c = c || {};
        const correo = String(c.correo ?? "").trim();
        if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi(422, "Escribe un correo electrónico válido.");
        const tel = String(c.telefono ?? "").replace(/[\s-]/g, "");
        if (!/^\d{10}$/.test(tel)) throw new ErrorApi(422, "El teléfono debe tener 10 dígitos.");
        return { nombre: texto(c.nombre, 2, 80, "Nombre"), correo, telefono: tel };
    };
    const validarDireccion = a => {
        a = a || {};
        const cp = String(a.cp ?? "").trim();
        if (!zonaPorCP(cp)) throw new ErrorApi(422, "El código postal no es válido.");
        if (!ESTADOS_MX.includes(a.estado)) throw new ErrorApi(422, "Elige un estado de la lista.");
        return { destinatario: texto(a.destinatario, 2, 80, "Destinatario"), calle: texto(a.calle, 3, 120, "Calle y número"), colonia: texto(a.colonia, 2, 80, "Colonia"), municipio: texto(a.municipio, 2, 80, "Municipio o alcaldía"), estado: a.estado, cp };
    };

    /* ---------------- Pasarela SANDBOX (simulada) ----------------
       Nunca recibe datos de tarjeta: solo método, monto y el resultado de prueba. */
    function pasarelaSandbox({ metodo, monto, simulacion }) {
        const referencia = "SBX-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(7, "0");
        if (simulacion === "rechazado") return { estado: "rechazado", referencia, mensaje: "El pago de prueba fue rechazado por el simulador. No se realizó ningún cargo." };
        return { estado: "aprobado", referencia, mensaje: `Pago de prueba aprobado en ${metodo} (sandbox).` };
    }

    /* ---------------- Pedidos ---------------- */
    function crearPedido(sol) {
        const r = tx(d => {
            const u = requerir(d);
            if (!sol || typeof sol !== "object") throw new ErrorApi(400, "Solicitud no válida.");
            if (sol.claveIdempotencia) {
                const previo = d.pedidos.find(p => p.claveIdempotencia === sol.claveIdempotencia && p.usuarioId === u.id);
                if (previo) return { pedido: previo, pago: d.pagos.find(x => x.id === previo.pago.id), repetido: true };
            }
            const contacto = validarContacto(sol.contacto);
            if (!sol.terminos || sol.terminos.aceptado !== true || sol.terminos.version !== POLITICAS.version)
                throw new ErrorApi(422, "Debes aceptar los Términos y Condiciones, la política de devoluciones y el Aviso de privacidad vigentes.");
            if (!METODOS_PAGO.some(m => m.id === sol.pago?.metodo)) throw new ErrorApi(422, "Elige un método de pago.");
            const cot = cotizarEn(d, { lineas: sol.lineas, cupon: sol.cupon, entrega: sol.entrega, usuarioId: u.id });
            if (cot.errores.length) throw new ErrorApi(409, cot.errores[0], { detalles: cot.errores });
            if (cot.cupon && !cot.cupon.ok) throw new ErrorApi(422, cot.cupon.mensaje);
            if (!cot.entrega || cot.entrega.error) throw new ErrorApi(422, cot.entrega?.error || "Elige un método de entrega.");
            let direccion = null;
            if (cot.entrega.metodo !== "recoleccion") {
                direccion = validarDireccion({ ...(sol.entrega.direccion || {}), cp: sol.entrega.cp });
            }
            const pasarela = pasarelaSandbox({ metodo: sol.pago.metodo, monto: cot.total, simulacion: sol.pago.simulacion });
            const pago = { id: siguiente(d, "pago"), pedido: null, usuarioId: u.id, proveedor: "Sandbox " + sol.pago.metodo, referencia: pasarela.referencia, monto: cot.total, estado: pasarela.estado, reembolsado: 0, fecha: ahoraISO() };
            if (pasarela.estado !== "aprobado") {
                d.pagos.push(pago);
                audit(d, u, "pago_rechazado", "pago", pago.id, `ref ${pago.referencia}`);
                return { rechazado: true, mensaje: pasarela.mensaje, pago };
            }
            // Todo o nada: existencias, movimientos, cupón y pedido en la misma transacción.
            const resumen = {};
            cot.lineas.forEach(l => { resumen[l.id] = (resumen[l.id] || 0) + l.cantidad; });
            const num = siguiente(d, "pedido"), f = folio("DN", num);
            Object.entries(resumen).forEach(([id, cant]) => moverStock(d, d.productos.find(p => p.id === Number(id)), -cant, "venta", "Venta en línea", u, f));
            if (cot.cupon && cot.cupon.ok) d.cupones.find(c => c.codigo === cot.cupon.codigo).usos.push({ usuarioId: u.id, pedido: f, fecha: ahoraISO() });
            pago.pedido = f;
            d.pagos.push(pago);
            const ahora = ahoraISO();
            const pedido = {
                folio: f, claveIdempotencia: sol.claveIdempotencia || null, usuarioId: u.id, usuario: u.usuario, contacto,
                entrega: { metodo: cot.entrega.metodo, etiqueta: cot.entrega.etiqueta, costo: cot.entrega.costo, plazo: cot.entrega.plazo, direccion },
                lineas: cot.lineas, subtotal: cot.subtotal, descuento: cot.descuento, cupon: cot.cupon?.ok ? cot.cupon.codigo : "",
                envio: cot.envio, total: cot.total, ivaIncluido: cot.ivaIncluido,
                pago: { id: pago.id, metodo: sol.pago.metodo, referencia: pago.referencia },
                estado: "Pagado", guia: null, incidencias: [], fechaEntrega: null, creado: ahora,
                terminos: { version: POLITICAS.version, aceptadoEn: ahora, pedido: f },
                historial: [{ fecha: ahora, estado: "Pagado", actor: u.usuario, nota: "Pedido creado y pago de prueba aprobado." }]
            };
            d.pedidos.push(pedido);
            audit(d, u, "crear_pedido", "pedido", f, `total ${cot.total}`);
            notificar(d, u.id, `Confirmación de tu pedido ${f}`, `Recibimos tu pedido ${f} por ${cot.total.toFixed(2)} MXN (IVA incluido). Te avisaremos cuando cambie de estado. (Mensaje simulado: esta tienda no envía correos reales.)`);
            return { pedido, pago };
        });
        if (r.rechazado) throw new ErrorApi(402, r.mensaje, { pago: r.pago });
        return r;
    }
    const puedeVer = (u, p) => p.usuarioId === u.id || tiene(u, "pedidos.ver");
    function misPedidos() {
        return lectura(d => { const u = requerir(d); return d.pedidos.filter(p => p.usuarioId === u.id).sort((a, b) => b.creado.localeCompare(a.creado)); });
    }
    function obtenerPedido(f) {
        return lectura(d => {
            const u = requerir(d), p = d.pedidos.find(x => x.folio === f);
            if (!p || !puedeVer(u, p)) throw new ErrorApi(404, "Pedido no encontrado.");
            return { ...p, pagoDetalle: d.pagos.find(x => x.id === p.pago.id), devoluciones: d.devoluciones.filter(x => x.pedido === f) };
        });
    }
    function seguimiento(f, correo) {
        limitar("seguimiento", 10, 60000, "Demasiadas consultas.");
        return lectura(d => {
            const p = d.pedidos.find(x => x.folio === String(f || "").trim().toUpperCase());
            if (!p || p.contacto.correo.toLowerCase() !== String(correo || "").trim().toLowerCase()) throw new ErrorApi(404, "No encontramos un pedido con ese folio y correo.");
            return { folio: p.folio, estado: p.estado, creado: p.creado, entrega: { etiqueta: p.entrega.etiqueta, plazo: p.entrega.plazo }, guia: p.guia, incidencias: p.incidencias.map(i => ({ fecha: i.fecha, tipo: i.tipo })), fechaEntrega: p.fechaEntrega, historial: p.historial.map(h => ({ fecha: h.fecha, estado: h.estado })), total: p.total };
        });
    }
    function reembolsarEn(d, pedido, monto, actor, motivo) {
        const pago = d.pagos.find(x => x.id === pedido.pago.id);
        monto = Math.min(r2(monto), r2(pago.monto - pago.reembolsado));
        if (monto <= 0) return 0;
        pago.reembolsado = r2(pago.reembolsado + monto);
        pago.estado = pago.reembolsado >= pago.monto ? "reembolsado" : "reembolso parcial";
        audit(d, actor, "reembolso", "pago", pago.id, `${monto} MXN — ${motivo}`);
        return monto;
    }
    function reponerEn(d, pedido, actor, tipo, motivo) {
        const resumen = {};
        pedido.lineas.forEach(l => { resumen[l.id] = (resumen[l.id] || 0) + l.cantidad; });
        Object.entries(resumen).forEach(([id, c]) => { const p = d.productos.find(x => x.id === Number(id)); if (p) moverStock(d, p, c, tipo, motivo, actor, pedido.folio); });
    }
    function cambiarEstadoEn(d, pedido, nuevo, actor, nota) {
        pedido.estado = nuevo;
        pedido.historial.push({ fecha: ahoraISO(), estado: nuevo, actor: actor.usuario, nota: nota || "" });
        audit(d, actor, "estado_pedido", "pedido", pedido.folio, nuevo);
        notificar(d, pedido.usuarioId, `Tu pedido ${pedido.folio} está: ${nuevo}`, `El estado de tu pedido ${pedido.folio} cambió a “${nuevo}”.${pedido.guia && nuevo === "Enviado" ? ` Paquetería: ${pedido.guia.paqueteria}, guía ${pedido.guia.numero}.` : ""} (Mensaje simulado.)`);
    }
    function cancelarPedido(f, motivo) {
        return tx(d => {
            const u = requerir(d), p = d.pedidos.find(x => x.folio === f);
            if (!p || !puedeVer(u, p)) throw new ErrorApi(404, "Pedido no encontrado.");
            if (!["Pagado", "Preparando"].includes(p.estado)) throw new ErrorApi(409, `Un pedido en estado “${p.estado}” ya no puede cancelarse. Si ya lo recibiste, solicita una devolución.`);
            const m = texto(motivo, 5, 300, "Motivo");
            reponerEn(d, p, u, "cancelacion", `Cancelación ${p.folio}`);
            const monto = reembolsarEn(d, p, p.total, u, "Cancelación de pedido");
            cambiarEstadoEn(d, p, "Cancelado", u, `Cancelado por ${p.usuarioId === u.id ? "el cliente" : "soporte"}: ${m}. Reembolso de ${monto.toFixed(2)} MXN registrado.`);
            return p;
        });
    }
    function cambiarEstadoPedido(f, nuevo, datos = {}) {
        return tx(d => {
            const u = requerir(d, "pedidos.estado"), p = d.pedidos.find(x => x.folio === f);
            if (!p) throw new ErrorApi(404, "Pedido no encontrado.");
            if (!(TRANSICIONES[p.estado] || []).includes(nuevo)) throw new ErrorApi(409, `Transición no permitida: de “${p.estado}” a “${nuevo}”.`);
            if (nuevo === "Enviado") {
                const paq = texto(datos.paqueteria, 2, 40, "Paquetería");
                const num = String(datos.guia ?? "").trim().toUpperCase();
                if (!/^[A-Z0-9-]{6,30}$/.test(num)) throw new ErrorApi(422, "La guía debe tener entre 6 y 30 letras, números o guiones.");
                p.guia = { paqueteria: paq, numero: num, fecha: ahoraISO() };
            }
            if (nuevo === "Entregado") p.fechaEntrega = ahoraISO();
            if (nuevo === "Cancelado" || nuevo === "Devuelto al remitente") {
                reponerEn(d, p, u, nuevo === "Cancelado" ? "cancelacion" : "devolucion", `${nuevo} ${p.folio}`);
                reembolsarEn(d, p, p.total, u, nuevo);
            }
            cambiarEstadoEn(d, p, nuevo, u, datos.nota);
            return p;
        });
    }
    function registrarIncidencia(f, tipo, nota) {
        return tx(d => {
            const u = requerir(d, "pedidos.estado"), p = d.pedidos.find(x => x.folio === f);
            if (!p) throw new ErrorApi(404, "Pedido no encontrado.");
            if (!INCIDENCIAS.includes(tipo)) throw new ErrorApi(422, "Tipo de incidencia no válido.");
            if (!["Preparando", "Enviado"].includes(p.estado)) throw new ErrorApi(409, "Solo se registran incidencias de pedidos en preparación o enviados.");
            const n = texto(nota, 5, 300, "Nota");
            p.incidencias.push({ fecha: ahoraISO(), tipo, nota: n, actor: u.usuario });
            p.historial.push({ fecha: ahoraISO(), estado: p.estado, actor: u.usuario, nota: `Incidencia: ${tipo}. ${n}` });
            audit(d, u, "incidencia", "pedido", p.folio, tipo);
            return p;
        });
    }
    function listarPedidos({ estado, texto: q } = {}) {
        return lectura(d => {
            requerir(d, "pedidos.ver");
            const t = String(q || "").trim().toLowerCase();
            return d.pedidos.filter(p => (!estado || p.estado === estado) && (!t || p.folio.toLowerCase().includes(t) || p.contacto.nombre.toLowerCase().includes(t) || p.contacto.correo.toLowerCase().includes(t))).sort((a, b) => b.creado.localeCompare(a.creado));
        });
    }

    /* ---------------- Devoluciones y garantías ---------------- */
    function diasHabilesDesde(iso, hasta = new Date()) {
        let n = 0; const d = new Date(iso); d.setHours(0, 0, 0, 0);
        const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
        while (d < fin) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
        return n;
    }
    const diasNaturales = (iso, hasta = new Date()) => Math.floor((hasta - new Date(iso)) / 86400000);
    function plazoDevolucion(pedido, motivo) {
        if (motivo === "no_recibido") return pedido.estado === "Enviado" || pedido.estado === "Entregado" ? null : "Solo puedes reportar “no recibido” cuando el pedido ya fue enviado.";
        if (pedido.estado !== "Entregado" || !pedido.fechaEntrega) return "La devolución se solicita cuando el pedido ya fue entregado.";
        if (motivo === "arrepentimiento") return diasHabilesDesde(pedido.fechaEntrega) <= POLITICAS.diasRevocacionHabiles ? null : `El plazo de revocación (${POLITICAS.diasRevocacionHabiles} días hábiles desde la entrega) ya venció.`;
        if (motivo === "cortesia") return diasNaturales(pedido.fechaEntrega) <= POLITICAS.diasCortesia ? null : `El plazo de devolución por cortesía (${POLITICAS.diasCortesia} días) ya venció.`;
        return diasNaturales(pedido.fechaEntrega) <= POLITICAS.diasGarantia ? null : `El plazo de garantía (${POLITICAS.diasGarantia} días desde la entrega) ya venció.`;
    }
    const devolucionesActivas = (d, f) => d.devoluciones.filter(x => x.pedido === f && x.estado !== "Rechazada");
    function disponiblesParaDevolver(d, pedido) {
        const usados = {};
        devolucionesActivas(d, pedido.folio).forEach(x => x.items.forEach(i => { const k = i.id + "|" + i.variante; usados[k] = (usados[k] || 0) + i.cantidad; }));
        return pedido.lineas.map(l => ({ id: l.id, variante: l.variante, nombre: l.nombre, disponible: l.cantidad - (usados[l.id + "|" + l.variante] || 0), precioUnitario: l.precioUnitario })).filter(x => x.disponible > 0);
    }
    const solicitarDevolucion = args => limitarExito("devolucion", 5, 600000, "Demasiadas solicitudes.", () => solicitarDevolucionSinLimite(args));
    function solicitarDevolucionSinLimite({ folio: f, motivo, descripcion, items }) {
        return tx(d => {
            const u = requerir(d), p = d.pedidos.find(x => x.folio === f);
            if (!p || p.usuarioId !== u.id) throw new ErrorApi(404, "Pedido no encontrado.");
            if (!MOTIVOS_DEVOLUCION[motivo]) throw new ErrorApi(422, "Elige un motivo.");
            const errPlazo = plazoDevolucion(p, motivo);
            if (errPlazo) throw new ErrorApi(409, errPlazo);
            const desc = texto(descripcion, 10, 500, "Descripción");
            const disp = disponiblesParaDevolver(d, p);
            const sel = (Array.isArray(items) ? items : []).map(i => ({ id: Number(i.id), variante: i.variante || "", cantidad: Math.floor(Number(i.cantidad)) })).filter(i => i.cantidad > 0);
            if (!sel.length) throw new ErrorApi(422, "Selecciona al menos un producto.");
            const fin = sel.map(i => {
                const x = disp.find(y => y.id === i.id && y.variante === i.variante);
                if (!x || i.cantidad > x.disponible) throw new ErrorApi(422, "La cantidad a devolver no es válida.");
                return { ...i, nombre: x.nombre, precioUnitario: x.precioUnitario };
            });
            const n = siguiente(d, "devolucion"), fd = folio("DEV", n), ahora = ahoraISO();
            const dev = { folio: fd, pedido: p.folio, usuarioId: u.id, contacto: p.contacto.correo, motivo, motivoTexto: MOTIVOS_DEVOLUCION[motivo], descripcion: desc, items: fin, estado: "Solicitada", respuesta: "", resolucion: null, reembolso: 0, creado: ahora, historial: [{ fecha: ahora, estado: "Solicitada", actor: u.usuario, nota: "Solicitud creada por el cliente." }] };
            d.devoluciones.push(dev);
            audit(d, u, "solicitar_devolucion", "devolucion", fd, `pedido ${p.folio}`);
            notificar(d, u.id, `Recibimos tu solicitud ${fd}`, `Registramos tu solicitud ${fd} del pedido ${p.folio}. Soporte te responderá en un máximo de ${POLITICAS.respuestaSoporteHoras} horas hábiles. (Mensaje simulado.)`);
            return dev;
        });
    }
    const misDevoluciones = () => lectura(d => { const u = requerir(d); return d.devoluciones.filter(x => x.usuarioId === u.id).sort((a, b) => b.creado.localeCompare(a.creado)); });
    const listarDevoluciones = () => lectura(d => { requerir(d, "devoluciones.gestionar"); return [...d.devoluciones].sort((a, b) => b.creado.localeCompare(a.creado)); });
    function gestionarDevolucion(fd, accion, datos = {}) {
        return tx(d => {
            const u = requerir(d, "devoluciones.gestionar"), dev = d.devoluciones.find(x => x.folio === fd);
            if (!dev) throw new ErrorApi(404, "Solicitud no encontrada.");
            const p = d.pedidos.find(x => x.folio === dev.pedido);
            const pasa = (...est) => { if (!est.includes(dev.estado)) throw new ErrorApi(409, `La acción no aplica a una solicitud en estado “${dev.estado}”.`); };
            let nuevo, nota = "";
            switch (accion) {
                case "revisar": pasa("Solicitada"); nuevo = "En revisión"; nota = "Soporte verifica compra, plazo y evidencia."; break;
                case "autorizar":
                    pasa("Solicitada", "En revisión"); nuevo = "Autorizada";
                    dev.respuesta = texto(datos.instrucciones, 10, 500, "Instrucciones para el cliente"); nota = dev.respuesta; break;
                case "rechazar":
                    pasa("Solicitada", "En revisión"); nuevo = "Rechazada";
                    dev.respuesta = texto(datos.explicacion, 10, 500, "Explicación"); nota = dev.respuesta + " Puedes aclarar esta decisión con soporte o ante PROFECO."; break;
                case "recibir": {
                    pasa("Autorizada"); nuevo = "Recibida";
                    nota = "Inspección: " + texto(datos.inspeccion, 5, 300, "Resultado de la inspección");
                    if (datos.reingresar) { dev.items.forEach(i => moverStock(d, d.productos.find(x => x.id === i.id), i.cantidad, "devolucion", `Devolución ${dev.folio}`, u, dev.folio)); nota += " Piezas reingresadas al inventario."; }
                    break;
                }
                case "resolver": {
                    if (dev.motivo === "no_recibido") pasa("Autorizada", "Recibida"); else pasa("Recibida");
                    const res = datos.resolucion;
                    if (!["Reembolso", "Cambio", "Reposición"].includes(res)) throw new ErrorApi(422, "Elige la resolución: reembolso, cambio o reposición.");
                    nuevo = "Resuelta"; dev.resolucion = res;
                    if (res === "Reembolso") {
                        const todo = dev.items.every(i => { const l = p.lineas.find(x => x.id === i.id && x.variante === i.variante); return l && l.cantidad === i.cantidad; }) && p.lineas.length === dev.items.length;
                        const culpaTienda = ["defectuoso", "dano_transito", "incorrecto", "incompleto", "no_recibido"].includes(dev.motivo);
                        const prop = p.subtotal > 0 ? (p.subtotal - p.descuento) / p.subtotal : 1;
                        const base = r2(dev.items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0) * prop);
                        const monto = reembolsarEn(d, p, todo && culpaTienda ? p.total : base, u, `Devolución ${dev.folio}`);
                        dev.reembolso = monto; nota = `Reembolso de ${monto.toFixed(2)} MXN al método de pago original (simulado).`;
                        const pago = d.pagos.find(x => x.id === p.pago.id);
                        if (pago.estado === "reembolsado" && ["Enviado", "Entregado"].includes(p.estado)) cambiarEstadoEn(d, p, "Reembolsado", u, `Devolución ${dev.folio}`);
                    } else {
                        dev.items.forEach(i => moverStock(d, d.productos.find(x => x.id === i.id), -i.cantidad, "reposicion", `${res} ${dev.folio}`, u, dev.folio));
                        nota = `${res}: se enviará un producto de reemplazo.`;
                    }
                    break;
                }
                default: throw new ErrorApi(400, "Acción no válida.");
            }
            dev.estado = nuevo;
            dev.historial.push({ fecha: ahoraISO(), estado: nuevo, actor: u.usuario, nota });
            audit(d, u, "devolucion_" + accion, "devolucion", dev.folio, nuevo);
            notificar(d, dev.usuarioId, `Solicitud ${dev.folio}: ${nuevo}`, nota + " (Mensaje simulado.)");
            return dev;
        });
    }

    /* ---------------- Cuentas de usuario ---------------- */
    async function registrar(datos) {
        const usuario = String(datos.usuario ?? "").trim();
        if (!/^[A-Za-z0-9._-]{3,30}$/.test(usuario)) throw new ErrorApi(422, "El usuario debe tener de 3 a 30 caracteres (letras, números, punto, guion).");
        const correo = String(datos.correo ?? "").trim();
        if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi(422, "Escribe un correo electrónico válido.");
        const nombre = texto(datos.nombre, 2, 80, "Nombre");
        const tel = String(datos.telefono ?? "").replace(/[\s-]/g, "");
        if (tel && !/^\d{10}$/.test(tel)) throw new ErrorApi(422, "El teléfono debe tener 10 dígitos.");
        claveValida(datos.clave);
        if (datos.mayorEdad !== true) throw new ErrorApi(422, "Debes confirmar que eres mayor de 18 años.");
        if (datos.privacidad !== true) throw new ErrorApi(422, "Debes aceptar el Aviso de privacidad para crear tu cuenta.");
        verificarLimite("registro", 5, 600000, "Demasiados registros desde este navegador.");
        const h = await nuevoHash(datos.clave);
        const u = tx(d => {
            if (d.usuarios.some(x => x.usuario.toLowerCase() === usuario.toLowerCase())) throw new ErrorApi(409, "Ese usuario ya existe.");
            if (d.usuarios.some(x => x.correo && x.correo.toLowerCase() === correo.toLowerCase())) throw new ErrorApi(409, "Ese correo ya está registrado.");
            const ahora = ahoraISO();
            const nuevo = { id: siguiente(d, "usuario"), usuario, correo, nombre, telefono: tel, rol: "cliente", estado: "activo", ...h, direcciones: [], creado: ahora,
                consentimiento: { privacidad: POLITICAS.version, fecha: ahora, marketing: datos.marketing === true } };
            d.usuarios.push(nuevo);
            audit(d, nuevo, "registro", "usuario", nuevo.id);
            return nuevo;
        });
        registrarIntento("registro", 600000);
        crearSesion(u);
        return publico(u);
    }
    async function iniciarSesion(ident, clave) {
        ident = String(ident ?? "").trim().toLowerCase(); clave = String(clave ?? "");
        if (!ident || !clave) throw new ErrorApi(400, "Escribe tu usuario o correo y tu contraseña.");
        const lim = "login:" + ident;
        if (hayBloqueo(lim, 5, 60000)) throw new ErrorApi(429, "Demasiados intentos fallidos. Espera un minuto e intenta de nuevo.");
        const d = leerDB();
        const u = d.usuarios.find(x => x.usuario.toLowerCase() === ident || (x.correo && x.correo.toLowerCase() === ident));
        let valido = false;
        if (u && u.hash) valido = igualConstante(await derivar(clave, u.sal, u.algoritmo), u.hash);
        else if (u && u.claveLegacy !== undefined) valido = igualConstante(u.claveLegacy, clave);
        else await derivar(clave, "AAAAAAAAAAAAAAAAAAAAAA==", "pbkdf2-sha256-150000"); // iguala tiempos si el usuario no existe
        if (!valido) { limitar(lim, 5, 60000); throw new ErrorApi(401, "Usuario o contraseña incorrectos."); }
        if (u.estado !== "activo") throw new ErrorApi(403, "Tu cuenta está bloqueada. Contacta a soporte.");
        limpiarLimite(lim);
        let migrar = null;
        if (!u.hash) migrar = await nuevoHash(clave);   // migración: contraseña en texto plano → hash
        const fin = tx(db => {
            const x = db.usuarios.find(y => y.id === u.id);
            if (migrar) { Object.assign(x, migrar); delete x.claveLegacy; }
            audit(db, x, "login", "usuario", x.id);
            return x;
        });
        crearSesion(fin);
        return publico(fin);
    }
    async function cambiarClave({ actual, nueva }) {
        const sesion = sesionActual();
        if (!sesion) throw new ErrorApi(401, "Debes iniciar sesión.");
        const d = leerDB(), u = d.usuarios.find(x => x.id === sesion.id);
        if (!igualConstante(await derivar(String(actual ?? ""), u.sal, u.algoritmo), u.hash)) throw new ErrorApi(401, "La contraseña actual no es correcta.");
        claveValida(nueva);
        const h = await nuevoHash(nueva);
        tx(db => { const x = db.usuarios.find(y => y.id === u.id); Object.assign(x, h); audit(db, x, "cambio_clave", "usuario", x.id); });
    }
    function recuperarSolicitar(correo) {
        limitar("recuperar", 3, 600000, "Demasiadas solicitudes.");
        correo = String(correo ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi(422, "Escribe un correo válido.");
        const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
        tx(d => {
            const u = d.usuarios.find(x => x.correo && x.correo.toLowerCase() === correo);
            d.recuperaciones = (d.recuperaciones || []).filter(r => Date.now() < r.expira);
            if (u) { d.recuperaciones.push({ usuarioId: u.id, codigo, expira: Date.now() + 600000, intentos: 0 }); audit(d, u, "recuperacion_solicitada", "usuario", u.id); }
        });
        // Se responde igual exista o no el correo (evita enumerar cuentas). El código se muestra
        // en pantalla solo porque este sistema simula el envío de correo.
        return { codigoSimulado: codigo };
    }
    async function recuperarConfirmar({ correo, codigo, clave }) {
        limitar("recuperar-confirmar", 5, 600000, "Demasiados intentos.");
        claveValida(clave);
        const h = await nuevoHash(clave);
        tx(d => {
            const u = d.usuarios.find(x => x.correo && x.correo.toLowerCase() === String(correo ?? "").trim().toLowerCase());
            const r = u && (d.recuperaciones || []).find(x => x.usuarioId === u.id && Date.now() < x.expira);
            if (!r || r.intentos >= 5 || !igualConstante(r.codigo, String(codigo ?? "").trim())) { if (r) r.intentos++; throw new ErrorApi(401, "El código no es válido o ya venció."); }
            Object.assign(u, h); delete u.claveLegacy;
            d.recuperaciones = d.recuperaciones.filter(x => x !== r);
            audit(d, u, "recuperacion_completada", "usuario", u.id);
        });
    }
    function actualizarPerfil(datos) {
        return tx(d => {
            const u = requerir(d);
            const correo = String(datos.correo ?? "").trim();
            if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi(422, "Escribe un correo válido.");
            if (d.usuarios.some(x => x.id !== u.id && x.correo && x.correo.toLowerCase() === correo.toLowerCase())) throw new ErrorApi(409, "Ese correo ya está registrado.");
            const tel = String(datos.telefono ?? "").replace(/[\s-]/g, "");
            if (tel && !/^\d{10}$/.test(tel)) throw new ErrorApi(422, "El teléfono debe tener 10 dígitos.");
            u.nombre = texto(datos.nombre, 2, 80, "Nombre"); u.correo = correo; u.telefono = tel;
            u.consentimiento = { ...(u.consentimiento || {}), marketing: datos.marketing === true, actualizado: ahoraISO() };
            audit(d, u, "perfil", "usuario", u.id);
            return publico(u);
        });
    }
    function guardarDireccion(dir) {
        return tx(d => {
            const u = requerir(d), v = validarDireccion(dir);
            u.direcciones = u.direcciones || [];
            if (dir.id) {
                const x = u.direcciones.find(a => a.id === dir.id);
                if (!x) throw new ErrorApi(404, "Dirección no encontrada.");
                Object.assign(x, v);
            } else {
                if (u.direcciones.length >= POLITICAS.maxDirecciones) throw new ErrorApi(409, `Puedes guardar hasta ${POLITICAS.maxDirecciones} direcciones.`);
                u.direcciones.push({ id: "d" + siguiente(d, "direccion"), ...v });
            }
            return publico(u);
        });
    }
    const eliminarDireccion = id => tx(d => { const u = requerir(d); u.direcciones = (u.direcciones || []).filter(a => a.id !== id); return publico(u); });
    const misNotificaciones = () => lectura(d => { const u = requerir(d); return d.notificaciones.filter(n => n.usuarioId === u.id).sort((a, b) => b.fecha.localeCompare(a.fecha)); });
    const marcarLeidas = () => tx(d => { const u = requerir(d); d.notificaciones.forEach(n => { if (n.usuarioId === u.id) n.leida = true; }); });

    /* ---------------- Atención al cliente y facturación ---------------- */
    const crearTicket = datos => limitarExito("ticket", 3, 600000, "Enviaste varias solicitudes seguidas.", () => crearTicketSinLimite(datos));
    function crearTicketSinLimite(datos) {
        const correo = String(datos.correo ?? "").trim();
        if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi(422, "Escribe un correo válido para responderte.");
        const tipo = ["Duda", "Aclaración", "Queja", "Reclamación"].includes(datos.tipo) ? datos.tipo : null;
        if (!tipo) throw new ErrorApi(422, "Elige el tipo de solicitud.");
        return tx(d => {
            const u = usuarioEn(d), n = siguiente(d, "ticket"), f = folio("AT", n);
            const t = { folio: f, usuarioId: u ? u.id : null, nombre: texto(datos.nombre, 2, 80, "Nombre"), correo, tipo, asunto: texto(datos.asunto, 3, 100, "Asunto"), mensaje: texto(datos.mensaje, 10, 1000, "Mensaje"), estado: "Abierto", respuesta: "", creado: ahoraISO() };
            d.tickets.push(t);
            audit(d, u, "ticket", "ticket", f, tipo);
            return t;
        });
    }
    const listarTickets = () => lectura(d => { requerir(d, "atencion.gestionar"); return [...d.tickets].sort((a, b) => b.creado.localeCompare(a.creado)); });
    function actualizarTicket(f, estado, respuesta) {
        return tx(d => {
            const u = requerir(d, "atencion.gestionar"), t = d.tickets.find(x => x.folio === f);
            if (!t) throw new ErrorApi(404, "Folio no encontrado.");
            if (!["Abierto", "En proceso", "Resuelto"].includes(estado)) throw new ErrorApi(422, "Estado no válido.");
            if (estado === "Resuelto" && !String(respuesta ?? "").trim()) throw new ErrorApi(422, "Escribe la resolución para cerrar el folio.");
            t.estado = estado; t.respuesta = String(respuesta ?? "").trim().slice(0, 1000);
            audit(d, u, "ticket_estado", "ticket", f, estado);
            notificar(d, t.usuarioId, `Folio de atención ${f}: ${estado}`, t.respuesta || "Tu solicitud está en proceso. (Mensaje simulado.)");
            return t;
        });
    }
    const solicitarFactura = datos => limitarExito("factura", 5, 600000, "Demasiadas solicitudes.", () => solicitarFacturaSinLimite(datos));
    function solicitarFacturaSinLimite(datos) {
        return tx(d => {
            const p = d.pedidos.find(x => x.folio === String(datos.folio ?? "").trim().toUpperCase());
            if (!p || p.contacto.correo.toLowerCase() !== String(datos.correo ?? "").trim().toLowerCase()) throw new ErrorApi(404, "No encontramos un pedido con ese folio y correo.");
            const c = new Date(p.creado), hoy = new Date();
            if (hoy.getFullYear() !== c.getFullYear() || hoy.getMonth() !== c.getMonth()) throw new ErrorApi(409, "El plazo para solicitar factura termina el último día del mes de la compra.");
            const rfc = String(datos.rfc ?? "").trim().toUpperCase();
            if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw new ErrorApi(422, "El RFC no tiene un formato válido.");
            if (!/^\d{5}$/.test(String(datos.cp ?? ""))) throw new ErrorApi(422, "Escribe el código postal fiscal (5 dígitos).");
            if (d.facturas.some(x => x.pedido === p.folio && x.estado !== "Rechazada")) throw new ErrorApi(409, "Ya existe una solicitud de factura para este pedido.");
            const f = folio("FAC", siguiente(d, "factura"));
            const s = { folio: f, pedido: p.folio, correo: p.contacto.correo, rfc, razonSocial: texto(datos.razonSocial, 3, 150, "Razón social"), regimen: texto(datos.regimen, 3, 100, "Régimen fiscal"), usoCfdi: texto(datos.usoCfdi, 2, 100, "Uso de CFDI"), cp: String(datos.cp), estado: "Registrada", creado: ahoraISO() };
            d.facturas.push(s);
            audit(d, usuarioEn(d), "solicitud_factura", "factura", f, p.folio);
            return s;
        });
    }
    const listarFacturas = () => lectura(d => { requerir(d, "atencion.gestionar"); return [...d.facturas].sort((a, b) => b.creado.localeCompare(a.creado)); });
    function actualizarFactura(f, estado) {
        return tx(d => {
            const u = requerir(d, "atencion.gestionar"), s = d.facturas.find(x => x.folio === f);
            if (!s) throw new ErrorApi(404, "Solicitud no encontrada.");
            if (!["Registrada", "Atendida", "Rechazada"].includes(estado)) throw new ErrorApi(422, "Estado no válido.");
            s.estado = estado; audit(d, u, "factura_estado", "factura", f, estado); return s;
        });
    }

    /* ---------------- Administración: catálogo, inventario, cupones, usuarios ---------------- */
    const RUTA_IMAGEN = /^(?!.*\.\.)(?![\/\\])[^:\\<>"'`?#]{1,200}\.(png|jpe?g|webp|gif|svg)$/i;
    function validarProducto(d, x, idActual) {
        const sku = String(x.sku ?? "").trim().toUpperCase();
        if (!/^[A-Z0-9-]{3,30}$/.test(sku)) throw new ErrorApi(422, "Modelo: de 3 a 30 letras mayúsculas, números o guiones.");
        if (d.productos.some(p => p.sku === sku && p.id !== idActual)) throw new ErrorApi(409, "Ya existe un producto con ese modelo.");
        const precio = Number(x.precio);
        if (!Number.isFinite(precio) || precio <= 0 || precio > 1000000 || Math.round(precio * 100) !== precio * 100) throw new ErrorApi(422, "Precio: número mayor que 0 con máximo 2 decimales.");
        if (!d.categorias.some(c => c.nombre === x.categoria && c.estado === "activa")) throw new ErrorApi(422, "Elige una categoría activa.");
        const imagen = String(x.imagen ?? "").trim();
        if (imagen && !RUTA_IMAGEN.test(imagen)) throw new ErrorApi(422, "Imagen: usa una ruta relativa a un archivo png, jpg, webp, gif o svg (ej. imagenes/producto.png).");
        const variantes = (Array.isArray(x.variantes) ? x.variantes : String(x.variantes ?? "").split(",")).map(v => String(v).trim()).filter(Boolean).slice(0, 8);
        if (variantes.some(v => v.length > 30)) throw new ErrorApi(422, "Cada variante admite hasta 30 caracteres.");
        let oferta = null;
        if (x.oferta && Number(x.oferta.porcentaje) > 0) {
            const pc = Number(x.oferta.porcentaje);
            if (!Number.isInteger(pc) || pc < 1 || pc > 90) throw new ErrorApi(422, "Oferta: porcentaje entero entre 1 y 90.");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(x.oferta.hasta || "") || isNaN(new Date(x.oferta.hasta))) throw new ErrorApi(422, "Oferta: indica la fecha de vigencia.");
            oferta = { porcentaje: pc, hasta: x.oferta.hasta };
        }
        return { sku, nombre: texto(x.nombre, 2, 80, "Nombre"), descripcion: texto(x.descripcion, 10, 500, "Descripción"), categoria: x.categoria, precio, imagen, peso: String(x.peso ?? "").trim().slice(0, 40), dimensiones: String(x.dimensiones ?? "").trim().slice(0, 60), variantes, destacado: x.destacado === true, oferta };
    }
    function guardarProducto(datos) {
        return tx(d => {
            const u = requerir(d, "productos.editar");
            if (datos.id) {
                const p = d.productos.find(x => x.id === Number(datos.id));
                if (!p) throw new ErrorApi(404, "Producto no encontrado.");
                const v = validarProducto(d, datos, p.id);
                const cambioPrecio = v.precio !== p.precio;
                Object.assign(p, v);
                audit(d, u, "editar_producto", "producto", p.id, cambioPrecio ? `precio → ${v.precio}` : "");
                return p;
            }
            const v = validarProducto(d, datos, null), stock = Math.floor(Number(datos.stock));
            if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new ErrorApi(422, "Existencias iniciales: entero entre 0 y 100000.");
            const p = { id: siguiente(d, "producto"), ...v, stock: 0, estado: "activo" };
            d.productos.push(p);
            if (stock > 0) moverStock(d, p, stock, "alta", "Existencias iniciales", u, p.sku);
            audit(d, u, "alta_producto", "producto", p.id, p.sku);
            return p;
        });
    }
    function cambiarEstadoProducto(id, estado) {
        return tx(d => {
            const u = requerir(d, "productos.editar"), p = d.productos.find(x => x.id === Number(id));
            if (!p) throw new ErrorApi(404, "Producto no encontrado.");
            if (!["activo", "inactivo"].includes(estado)) throw new ErrorApi(422, "Estado no válido.");
            p.estado = estado; audit(d, u, estado === "inactivo" ? "baja_logica_producto" : "reactivar_producto", "producto", p.id, p.sku); return p;
        });
    }
    function guardarCategoria({ id, nombre, estado }) {
        return tx(d => {
            const u = requerir(d, "productos.editar");
            const n = texto(nombre, 2, 40, "Nombre de la categoría");
            if (d.categorias.some(c => c.nombre.toLowerCase() === n.toLowerCase() && c.id !== id)) throw new ErrorApi(409, "Ya existe una categoría con ese nombre.");
            if (id) {
                const c = d.categorias.find(x => x.id === id);
                if (!c) throw new ErrorApi(404, "Categoría no encontrada.");
                if (c.nombre !== n) d.productos.forEach(p => { if (p.categoria === c.nombre) p.categoria = n; });
                c.nombre = n; c.slug = n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
                if (estado) c.estado = estado;
                audit(d, u, "editar_categoria", "categoria", c.id, estado || ""); return c;
            }
            const c = { id: siguiente(d, "categoria"), nombre: n, slug: n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-"), estado: "activa" };
            d.categorias.push(c); audit(d, u, "alta_categoria", "categoria", c.id, n); return c;
        });
    }
    function ajustarInventario(productoId, nuevoStock, motivo) {
        return tx(d => {
            const u = requerir(d, "inventario.ajustar"), p = d.productos.find(x => x.id === Number(productoId));
            if (!p) throw new ErrorApi(404, "Producto no encontrado.");
            const n = Number(nuevoStock);
            if (!Number.isInteger(n) || n < 0 || n > 100000) throw new ErrorApi(422, "Las existencias deben ser un entero entre 0 y 100000.");
            const m = texto(motivo, 5, 200, "Motivo del ajuste (obligatorio)");
            if (n === p.stock) throw new ErrorApi(422, "Las existencias nuevas son iguales a las actuales.");
            moverStock(d, p, n - p.stock, "ajuste", m, u, "");
            audit(d, u, "ajuste_inventario", "producto", p.id, `${p.sku}: ${m}`);
            return p;
        });
    }
    const listarMovimientos = () => lectura(d => { requerir(d, "inventario.ajustar"); return [...d.movimientos].sort((a, b) => b.id - a.id); });
    const listarProductosAdmin = () => lectura(d => { requerir(d, "productos.editar"); return d.productos.map(vistaProducto); });
    const listarCategoriasAdmin = () => lectura(d => { requerir(d, "productos.editar"); return d.categorias; });
    const listarCupones = () => lectura(d => { requerir(d, "promociones.gestionar"); return d.cupones; });
    function guardarCupon(datos) {
        return tx(d => {
            const u = requerir(d, "promociones.gestionar");
            const codigo = String(datos.codigo ?? "").trim().toUpperCase();
            if (!/^[A-Z0-9]{3,20}$/.test(codigo)) throw new ErrorApi(422, "Código: de 3 a 20 letras mayúsculas o números.");
            const tipo = datos.tipo === "monto" ? "monto" : "porcentaje", valor = Number(datos.valor);
            if (!(valor > 0) || (tipo === "porcentaje" && valor > 90)) throw new ErrorApi(422, tipo === "porcentaje" ? "El porcentaje debe estar entre 1 y 90." : "El monto debe ser mayor que 0.");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.desde || "") || !/^\d{4}-\d{2}-\d{2}$/.test(datos.hasta || "") || datos.hasta < datos.desde) throw new ErrorApi(422, "Indica una vigencia válida (la fecha final no puede ser anterior a la inicial).");
            const num = v => (v === "" || v == null ? null : Math.max(0, Math.floor(Number(v))));
            const base = { codigo, tipo, valor, desde: datos.desde, hasta: datos.hasta, minimoCompra: Math.max(0, Number(datos.minimoCompra) || 0), usosPorUsuario: num(datos.usosPorUsuario), usosMaximos: num(datos.usosMaximos), activo: datos.activo !== false, publico: datos.publico === true };
            const ex = d.cupones.find(c => c.codigo === codigo);
            if (ex) Object.assign(ex, base); else d.cupones.push({ ...base, usos: [] });
            audit(d, u, ex ? "editar_cupon" : "alta_cupon", "cupon", codigo, ""); return d.cupones.find(c => c.codigo === codigo);
        });
    }
    function cambiarEstadoCupon(codigo, activo) {
        return tx(d => { const u = requerir(d, "promociones.gestionar"), c = d.cupones.find(x => x.codigo === codigo); if (!c) throw new ErrorApi(404, "Cupón no encontrado."); c.activo = !!activo; audit(d, u, activo ? "activar_cupon" : "desactivar_cupon", "cupon", codigo, ""); return c; });
    }
    const cuponesPublicos = () => lectura(d => d.cupones.filter(c => c.activo && c.publico && new Date() <= new Date(c.hasta + "T23:59:59")));
    function listarUsuarios() {
        return lectura(d => {
            requerir(d, "clientes.ver");
            return d.usuarios.map(u => ({ ...publico(u), pedidos: d.pedidos.filter(p => p.usuarioId === u.id).length, gastado: r2(d.pedidos.filter(p => p.usuarioId === u.id && !ESTADOS_SIN_VENTA.includes(p.estado)).reduce((s, p) => s + p.total, 0)) }));
        });
    }
    function actualizarUsuarioAdmin(id, { rol, estado }) {
        return tx(d => {
            const a = requerir(d, "usuarios.administrar"), u = d.usuarios.find(x => x.id === Number(id));
            if (!u) throw new ErrorApi(404, "Usuario no encontrado.");
            if (u.id === a.id) throw new ErrorApi(409, "No puedes cambiar tu propio rol o estado.");
            if (rol && !PERMISOS[rol]) throw new ErrorApi(422, "Rol no válido.");
            if (estado && !["activo", "bloqueado"].includes(estado)) throw new ErrorApi(422, "Estado no válido.");
            if (rol) u.rol = rol; if (estado) u.estado = estado;
            audit(d, a, "actualizar_usuario", "usuario", u.id, `rol=${u.rol}, estado=${u.estado}`); return publico(u);
        });
    }
    const listarAuditoria = () => lectura(d => { requerir(d, "auditoria.ver"); return [...d.auditoria].sort((a, b) => b.id - a.id); });

    /* ---------------- Reportes y dashboard ---------------- */
    function dashboard() {
        return lectura(d => {
            requerir(d, "reportes.ver");
            const ventas = d.pedidos.filter(p => !ESTADOS_SIN_VENTA.includes(p.estado));
            const bruto = r2(d.pedidos.reduce((s, p) => s + p.total, 0));
            const reembolsos = r2(d.pagos.reduce((s, p) => s + (p.reembolsado || 0), 0));
            const porEstado = {}; ESTADOS_PEDIDO.forEach(e => { porEstado[e] = d.pedidos.filter(p => p.estado === e).length; });
            const vendidos = {};
            ventas.forEach(p => p.lineas.forEach(l => { const v = vendidos[l.id] || (vendidos[l.id] = { id: l.id, sku: l.sku, nombre: l.nombre, unidades: 0, importe: 0 }); v.unidades += l.cantidad; v.importe = r2(v.importe + l.total); }));
            const neto = r2(bruto - reembolsos);
            return {
                ventasBrutas: bruto, reembolsos, ventasNetas: neto, pedidos: d.pedidos.length, ticketPromedio: ventas.length ? r2(neto / ventas.length) : 0, porEstado,
                masVendidos: Object.values(vendidos).sort((a, b) => b.unidades - a.unidades).slice(0, 5),
                stockBajo: d.productos.filter(p => p.estado === "activo" && p.stock <= POLITICAS.stockBajo).sort((a, b) => a.stock - b.stock),
                devolucionesAbiertas: d.devoluciones.filter(x => ["Solicitada", "En revisión", "Autorizada", "Recibida"].includes(x.estado)).length,
                ticketsAbiertos: d.tickets.filter(t => t.estado !== "Resuelto").length
            };
        });
    }
    function reporte(tipo, { desde, hasta } = {}) {
        return lectura(d => {
            requerir(d, "reportes.ver");
            const ini = desde ? new Date(desde + "T00:00:00") : new Date(0), fin = hasta ? new Date(hasta + "T23:59:59") : new Date(8640000000000000);
            const enRango = iso => { const f = new Date(iso); return f >= ini && f <= fin; };
            if (tipo === "ventas") return d.pedidos.filter(p => enRango(p.creado)).map(p => ({ folio: p.folio, fecha: p.creado, cliente: p.contacto.nombre, correo: p.contacto.correo, estado: p.estado, subtotal: p.subtotal, descuento: p.descuento, cupon: p.cupon, envio: p.envio, total: p.total, ivaIncluido: p.ivaIncluido, pago: p.pago.metodo + " (sandbox)" }));
            if (tipo === "productos") {
                const m = {};
                d.pedidos.filter(p => enRango(p.creado) && !ESTADOS_SIN_VENTA.includes(p.estado)).forEach(p => p.lineas.forEach(l => { const v = m[l.id] || (m[l.id] = { sku: l.sku, producto: l.nombre, unidades: 0, importe: 0 }); v.unidades += l.cantidad; v.importe = r2(v.importe + l.total); }));
                return Object.values(m).sort((a, b) => b.unidades - a.unidades);
            }
            if (tipo === "inventario") return d.productos.map(p => ({ sku: p.sku, producto: p.nombre, categoria: p.categoria, estado: p.estado, existencias: p.stock, alerta: p.stock <= POLITICAS.stockBajo ? "Stock bajo" : "" }));
            if (tipo === "devoluciones") return d.devoluciones.filter(x => enRango(x.creado)).map(x => ({ folio: x.folio, pedido: x.pedido, fecha: x.creado, motivo: x.motivoTexto, estado: x.estado, resolucion: x.resolucion || "", reembolso: x.reembolso }));
            throw new ErrorApi(400, "Reporte no válido.");
        });
    }

    /* ---------------- Semilla, migración y reinicio ---------------- */
    async function semilla(previo) {
        const ahora = ahoraISO();
        const d = { version: 2, catalogoVersion: VERSION_CATALOGO, contadores: {}, categorias: [], productos: [], usuarios: [], pedidos: [], pagos: [], movimientos: [], cupones: [], devoluciones: [], tickets: [], facturas: [], notificaciones: [], auditoria: [], recuperaciones: [] };
        [...new Set(CATALOGO_BASE.map(p => p.categoria))].forEach(n => d.categorias.push({ id: siguiente(d, "categoria"), nombre: n, slug: n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-"), estado: "activa" }));
        CATALOGO_BASE.forEach(b => {
            const p = { ...JSON.parse(JSON.stringify(b)), stock: 0, estado: "activo" };
            d.contadores.producto = Math.max(d.contadores.producto || 0, p.id);
            d.productos.push(p);
            if (b.stock > 0) moverStock(d, p, b.stock, "alta", "Existencias iniciales (datos de demostración)", null, p.sku);
        });
        for (const x of USUARIOS_DEMO) {
            const h = await nuevoHash(x.clave);
            d.usuarios.push({ id: siguiente(d, "usuario"), usuario: x.usuario, correo: x.correo, nombre: x.nombre, telefono: "", rol: x.rol, estado: "activo", ...h, direcciones: [], creado: ahora, consentimiento: { privacidad: POLITICAS.version, fecha: ahora, marketing: false } });
        }
        CUPONES_BASE.forEach(c => d.cupones.push({ ...c, usos: [] }));
        // Migración desde la versión anterior (contraseñas en texto plano → se convierten en hash al primer inicio de sesión)
        try {
            const viejos = JSON.parse(almacen.leer("usuarios")) || [];
            viejos.forEach(v => {
                if (v && v.usuario && !d.usuarios.some(x => x.usuario.toLowerCase() === String(v.usuario).toLowerCase()))
                    d.usuarios.push({ id: siguiente(d, "usuario"), usuario: String(v.usuario).slice(0, 30), correo: "", nombre: String(v.usuario).slice(0, 80), telefono: "", rol: "cliente", estado: "activo", claveLegacy: String(v.clave ?? ""), direcciones: [], creado: ahora, consentimiento: null });
            });
        } catch { /* sin datos anteriores */ }
        audit(d, null, previo ? "restablecer_datos" : "inicializar", "sistema", "", "datos de demostración");
        escribirDB(d);
    }
    /* Actualiza los productos base (1 a 15) a la versión actual del catálogo sin tocar existencias, pedidos ni usuarios. */
    function migrarCatalogo() {
        const d = leerDB();
        CATALOGO_BASE.forEach(b => {
            const nuevo = JSON.parse(JSON.stringify(b));
            const p = d.productos.find(x => x.id === b.id);
            if (p) Object.assign(p, nuevo, { stock: p.stock, estado: p.estado });
            else {
                const alta = { ...nuevo, stock: 0, estado: "activo" };
                d.contadores.producto = Math.max(d.contadores.producto || 0, alta.id);
                d.productos.push(alta);
                if (b.stock > 0) moverStock(d, alta, b.stock, "alta", "Existencias iniciales (datos de demostración)", null, alta.sku);
            }
        });
        d.catalogoVersion = VERSION_CATALOGO;
        audit(d, null, "actualizar_catalogo", "sistema", "", VERSION_CATALOGO);
        escribirDB(d);
        // El carrito guardado puede tener variantes que ya no existen: se ajustan.
        try {
            const lin = JSON.parse(almacen.leer(K.carrito)) || [];
            carritoGuardar(lin.map(l => {
                const p = d.productos.find(x => x.id === l.id);
                if (!p) return l;
                const vs = p.variantes || [];
                return { ...l, variante: vs.length ? (vs.includes(l.variante) ? l.variante : vs[0]) : "" };
            }));
        } catch { /* carrito vacío o ilegible */ }
    }
    async function iniciar() {
        let d = null; try { d = almacen.leer(K.db) && leerDB(); } catch { d = null; }
        if (!d) await semilla(false);
        else if (d.catalogoVersion !== VERSION_CATALOGO) migrarCatalogo();
        // Migración del carrito anterior (lista de productos completos → líneas id/variante/cantidad)
        if (almacen.leer(K.carrito) === null) {
            try {
                const viejo = JSON.parse(almacen.leer("carrito")) || [], m = {};
                viejo.forEach(p => { if (p && p.id) m[p.id] = (m[p.id] || 0) + 1; });
                carritoGuardar(Object.entries(m).map(([id, c]) => ({ id: Number(id), variante: "", cantidad: Math.min(c, POLITICAS.maxPorProducto) })));
            } catch { carritoGuardar([]); }
        }
    }
    async function restablecerDemo() {
        requerir(leerDB(), "usuarios.administrar");
        await semilla(true);
        carritoGuardar([]);
    }

    return {
        ErrorApi, ESTADOS_PEDIDO, TRANSICIONES, INCIDENCIAS, PERMISOS, iniciar, restablecerDemo,
        sesionActual, tocarSesion, cerrarSesion, tiene, registrar, iniciarSesion, cambiarClave, recuperarSolicitar, recuperarConfirmar,
        actualizarPerfil, guardarDireccion, eliminarDireccion, misNotificaciones, marcarLeidas,
        catalogo, obtenerProducto, popularidad, zonaPorCP, calcularEntrega, precioVigente, cotizar, carritoLeer, carritoGuardar,
        crearPedido, misPedidos, obtenerPedido, seguimiento, cancelarPedido, cambiarEstadoPedido, registrarIncidencia, listarPedidos,
        plazoDevolucion, disponiblesParaDevolver: f => lectura(d => { const u = requerir(d), p = d.pedidos.find(x => x.folio === f); if (!p || p.usuarioId !== u.id) throw new ErrorApi(404, "Pedido no encontrado."); return disponiblesParaDevolver(d, p); }),
        solicitarDevolucion, misDevoluciones, listarDevoluciones, gestionarDevolucion,
        crearTicket, listarTickets, actualizarTicket, solicitarFactura, listarFacturas, actualizarFactura,
        listarProductosAdmin, listarCategoriasAdmin, guardarProducto, cambiarEstadoProducto, guardarCategoria, ajustarInventario, listarMovimientos,
        listarCupones, guardarCupon, cambiarEstadoCupon, cuponesPublicos, listarUsuarios, actualizarUsuarioAdmin, listarAuditoria, dashboard, reporte
    };
})();
