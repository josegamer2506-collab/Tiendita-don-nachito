"use strict";
/* ============================================================
   ui.js — Componentes reutilizables (tienda y panel admin)
   - Escape de HTML por defecto (plantillas seguras)
   - Avisos (toasts), ventanas modales accesibles, confirmaciones
   - Formato de moneda/fecha, validadores, exportación CSV
   ============================================================ */
const UI = (() => {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    /* ---------- Plantillas seguras (codificación de salida) ----------
       html`...${valor}...` escapa TODO lo interpolado, salvo otros html``. */
    const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
    const esc = v => String(v ?? "").replace(/[&<>"'`]/g, c => ESC[c]);
    class Seguro { constructor(s) { this.s = s; } toString() { return this.s; } }
    const raw = s => new Seguro(String(s));
    const val = v =>
        v instanceof Seguro ? v.s :
        Array.isArray(v) ? v.map(val).join("") :
        (v === null || v === undefined || v === false) ? "" : esc(v);
    const html = (cadenas, ...vs) =>
        new Seguro(cadenas.reduce((o, c, i) => o + c + (i < vs.length ? val(vs[i]) : ""), ""));
    const pintar = (el, contenido) => {
        el.innerHTML = contenido instanceof Seguro ? contenido.s : esc(contenido);
        return el;
    };

    /* ---------- Formato ---------- */
    const mxn = n => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const fecha = iso => {
        const d = new Date(iso);
        return isNaN(d) ? "—" : d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
    };
    const fechaCorta = iso => {
        const d = new Date(iso);
        return isNaN(d) ? "—" : d.toLocaleDateString("es-MX", { dateStyle: "medium" });
    };

    /* ---------- Validadores (cliente; el "servidor" vuelve a validar) ---------- */
    const validar = {
        correo: s => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(s).trim()),
        telefono: s => /^\d{10}$/.test(String(s).replace(/[\s-]/g, "")),
        cp: s => /^\d{5}$/.test(String(s).trim()) && Number(s) >= 1000,
        rfc: s => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(String(s).trim().toUpperCase()),
        clave: s => String(s).length >= 8 && String(s).length <= 128 && /[A-Za-z]/.test(s) && /\d/.test(s)
    };

    /* ---------- Errores de formulario accesibles ---------- */
    function error(input, mensaje) {
        if (!input) return;
        input.classList.add("campo-error");
        input.classList.remove("campo-correcto");
        input.setAttribute("aria-invalid", "true");
        const id = (input.id || (input.id = "c" + Math.random().toString(36).slice(2, 8))) + "-error";
        let p = document.getElementById(id);
        if (!p) {
            p = document.createElement("p");
            p.id = id;
            p.className = "mensaje-error";
            p.setAttribute("role", "alert");
            (input.closest(".campo") || input.parentNode).appendChild(p);
        }
        p.textContent = mensaje;
        input.setAttribute("aria-describedby", id);
    }
    function ok(input) {
        if (!input) return;
        input.classList.remove("campo-error");
        input.removeAttribute("aria-invalid");
        const p = document.getElementById((input.id || "") + "-error");
        if (p) p.remove();
        input.removeAttribute("aria-describedby");
    }
    function limpiarErrores(contenedor) {
        $$(".mensaje-error", contenedor).forEach(p => p.remove());
        $$(".campo-error", contenedor).forEach(i => { i.classList.remove("campo-error"); i.removeAttribute("aria-invalid"); });
    }

    /* ---------- Avisos (estados de éxito / error / información) ---------- */
    function aviso(mensaje, tipo = "info", ms) {
        const cont = $("#avisos");
        if (!cont) return;
        const d = document.createElement("div");
        d.className = "aviso aviso-" + tipo;
        d.setAttribute("role", tipo === "error" ? "alert" : "status");
        const t = document.createElement("span");
        t.textContent = mensaje;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "aviso-cerrar";
        b.setAttribute("aria-label", "Cerrar aviso");
        b.textContent = "✖";
        b.onclick = () => d.remove();
        d.append(t, b);
        cont.appendChild(d);
        setTimeout(() => d.remove(), ms ?? (tipo === "error" ? 9000 : 5000));
    }

    /* ---------- Ventanas modales (foco atrapado, Esc, restaurar foco) ---------- */
    const pila = [];
    const SELECTOR_FOCO =
        'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
    const enfocables = el => $$(SELECTOR_FOCO, el).filter(e => e.offsetParent !== null);

    function abrir(popup) {
        if (typeof popup === "string") popup = document.getElementById(popup);
        if (!popup || popup.classList.contains("visible")) return;
        popup._previo = document.activeElement;
        popup.classList.add("visible");
        pila.push(popup);
        document.body.classList.add("sin-scroll");
        const cont = $(".popup-contenido", popup) || popup;
        requestAnimationFrame(() => {
            const objetivo = $("[autofocus]", popup) || enfocables(cont).find(e => !e.matches("[data-cerrar]")) || cont;
            objetivo.focus({ preventScroll: true });
        });
    }
    function cerrar(popup) {
        if (typeof popup === "string") popup = document.getElementById(popup);
        if (!popup || !popup.classList.contains("visible")) return;
        popup.classList.remove("visible");
        const i = pila.indexOf(popup);
        if (i >= 0) pila.splice(i, 1);
        if (!pila.length) document.body.classList.remove("sin-scroll");
        const previo = popup._previo;
        popup._previo = null;
        if (previo && document.contains(previo) && previo.offsetParent !== null) previo.focus({ preventScroll: true });
        if (popup._alCerrar) { const f = popup._alCerrar; popup._alCerrar = null; f(); }
    }
    const cerrarTodos = () => [...pila].reverse().forEach(cerrar);
    const hayAbiertos = () => pila.length > 0;

    document.addEventListener("keydown", e => {
        const top = pila[pila.length - 1];
        if (!top) return;
        if (e.key === "Escape" && !top.hasAttribute("data-fijo")) { e.preventDefault(); cerrar(top); return; }
        if (e.key === "Tab") {
            const f = enfocables(top);
            if (!f.length) { e.preventDefault(); return; }
            const primero = f[0], ultimo = f[f.length - 1];
            if (e.shiftKey && (document.activeElement === primero || !top.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && (document.activeElement === ultimo || !top.contains(document.activeElement))) { e.preventDefault(); primero.focus(); }
        }
    });
    document.addEventListener("mousedown", e => {
        const t = e.target;
        if (t.classList && t.classList.contains("popup") && t.classList.contains("visible") && !t.hasAttribute("data-fijo")) cerrar(t);
    });
    document.addEventListener("click", e => {
        const b = e.target.closest("[data-cerrar]");
        if (b) cerrar(b.closest(".popup"));
    });

    /* Modal genérico reutilizable (nivel 1 y 2 para flujos anidados). */
    function modal({ titulo, cuerpo, nivel = 1 }) {
        const m = document.getElementById(nivel === 2 ? "modalGeneral2" : "modalGeneral");
        $(".modal-titulo", m).textContent = titulo;
        const c = $(".modal-cuerpo", m);
        if (cuerpo instanceof Seguro) c.innerHTML = cuerpo.s;
        else if (cuerpo instanceof Node) c.replaceChildren(cuerpo);
        else c.textContent = cuerpo;
        c.scrollTop = 0;
        abrir(m);
        return c;
    }
    const cerrarModal = (nivel = 1) => cerrar(nivel === 2 ? "modalGeneral2" : "modalGeneral");

    /* Confirmación accesible (sustituye a window.confirm). */
    function confirmar({ titulo, mensaje, ok = "Aceptar", peligro = false }) {
        return new Promise(resolver => {
            const m = document.getElementById("modalConfirmar");
            $(".modal-titulo", m).textContent = titulo;
            $("#confirmarMensaje", m).textContent = mensaje;
            const bOk = $("#confirmarOk", m);
            bOk.textContent = ok;
            bOk.classList.toggle("peligro", peligro);
            let decidido = false;
            const fin = v => { if (decidido) return; decidido = true; m._alCerrar = null; cerrar(m); resolver(v); };
            bOk.onclick = () => fin(true);
            $("#confirmarCancelar", m).onclick = () => fin(false);
            m._alCerrar = () => { if (!decidido) { decidido = true; resolver(false); } };
            abrir(m);
        });
    }

    /* ---------- CSV seguro (mitiga inyección de fórmulas) ---------- */
    function csv(columnas, filas) {
        const celda = v => {
            let s = v === null || v === undefined ? "" : String(v);
            if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
        };
        const lineas = [columnas.map(c => celda(c.t)).join(",")];
        filas.forEach(f => lineas.push(columnas.map(c => celda(typeof c.k === "function" ? c.k(f) : f[c.k])).join(",")));
        return "﻿" + lineas.join("\r\n");
    }
    function descargar(nombre, texto, tipo = "text/csv;charset=utf-8") {
        const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* Imagen de respaldo: si la imagen de un producto no carga (ruta rota o sin imagen),
       se usa la ilustración de imagenes/productos/ que corresponde al nombre del producto;
       si no hay una, una imagen genérica embebida en la paleta de la tienda. */
    const ILUSTRACIONES = [
        [/televisi|\btv\b/, "television"], [/lavadora/, "lavadora"], [/refrigerador|refri\b/, "refrigerador"],
        [/aire acondicionado|minisplit/, "aire-acondicionado"], [/ventilador/, "ventilador"], [/estufa/, "estufa"],
        [/barra de sonido|soundbar/, "barra-de-sonido"], [/bocina|speaker/, "bocina-bluetooth"],
        [/secadora/, "secadora-de-ropa"], [/calefactor/, "calefactor"], [/microondas/, "microondas"],
        [/licuadora/, "licuadora"], [/cafetera/, "cafetera"], [/freidora/, "freidora-de-aire"],
        [/horno/, "horno-electrico"]
    ];
    const sinAcentos = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    function imagenRespaldo(nombre = "") {
        const n = sinAcentos(nombre), par = ILUSTRACIONES.find(([re]) => re.test(n));
        if (par) return `imagenes/productos/${par[1]}.svg`;
        const t = esc(String(nombre).slice(0, 24));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e6f0f7"/><circle cx="200" cy="120" r="42" fill="#fff" stroke="#8fbbdb" stroke-width="4"/><path d="M178 120 h44 M200 98 v44" stroke="#2f6f9a" stroke-width="5" stroke-linecap="round"/><text x="200" y="205" font-family="Arial" font-size="20" fill="#32485a" text-anchor="middle">${t}</text><text x="200" y="232" font-family="Arial" font-size="13" fill="#566b7c" text-anchor="middle">Imagen no disponible</text></svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }
    document.addEventListener("error", e => {
        const img = e.target;
        if (img && img.tagName === "IMG" && !img.dataset.respaldo) {
            img.dataset.respaldo = "1";
            img.src = imagenRespaldo(img.alt);
        }
    }, true);

    const espera = ms => new Promise(r => setTimeout(r, ms));
    const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    return {
        $, $$, esc, html, raw, pintar, Seguro, mxn, fecha, fechaCorta, validar, error, ok, limpiarErrores,
        aviso, abrir, cerrar, cerrarTodos, hayAbiertos, modal, cerrarModal, confirmar, csv, descargar,
        imagenRespaldo, espera, debounce
    };
})();
