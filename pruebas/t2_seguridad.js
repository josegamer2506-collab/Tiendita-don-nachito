const { chromium, BASE, ok, nuevo, srv, resumen } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const { page: p, ctx } = await nuevo(b);
  // Cuenta "vieja" (versión anterior: contraseña en texto plano) para probar la migración
  await p.addInitScript(() => { if (!localStorage.getItem('tdn2_db')) { localStorage.setItem('usuarios', JSON.stringify([{ usuario: 'nacho', clave: '1234' }])); } });
  await p.goto(BASE + 'index.html'); await p.waitForSelector('.producto');

  console.log('\n[A] Acceso a rutas administrativas como cliente → denegación');
  await p.goto(BASE + 'admin.html');
  await p.waitForSelector('#formAdminLogin');
  ok(true, 'sin sesión, admin.html pide iniciar sesión (no muestra datos)');
  ok((await p.locator('#adminContenido').innerText()) === '' || (await p.locator('#adminApp').isHidden()), 'el contenido admin no se muestra sin sesión');
  await p.fill('#adminUser', 'cliente'); await p.fill('#adminClave', 'Cliente#2026'); await p.click('#formAdminLogin button[type=submit]');
  await p.waitForSelector('.acceso-denegado');
  ok((await p.locator('.acceso-denegado').innerText()).includes('403'), 'cliente en admin.html → 403 Acceso denegado');
  ok(await p.locator('#adminApp').isHidden(), 'el panel permanece oculto para el cliente');
  for (const [fn, nombre] of [['Servidor.dashboard()', 'dashboard'], ['Servidor.listarPedidos()', 'listarPedidos'], ['Servidor.listarUsuarios()', 'listarUsuarios'], ['Servidor.guardarProducto({sku:"HACK-1",nombre:"x",descripcion:"descripcion larga",categoria:"Cocina",precio:1})', 'guardarProducto'], ['Servidor.ajustarInventario(1,500,"hack hack")', 'ajustarInventario'], ['Servidor.cambiarEstadoPedido("DN-000001","Enviado",{})', 'cambiarEstadoPedido'], ['Servidor.listarAuditoria()', 'listarAuditoria'], ['Servidor.gestionarDevolucion("DEV-000001","autorizar",{})', 'gestionarDevolucion'], ['Servidor.guardarCupon({codigo:"HACK",tipo:"monto",valor:9999,desde:"2026-01-01",hasta:"2030-01-01"})', 'guardarCupon']]) {
    const r = await srv(p, 'return ' + fn);
    ok(r.err && r.err.estado === 403, `API ${nombre} como cliente → 403 (no solo oculta botones)`, r);
  }
  await p.evaluate(() => Servidor.cerrarSesion());
  const r401 = await srv(p, 'return Servidor.dashboard()');
  ok(r401.err && r401.err.estado === 401, 'sin sesión → 401');

  console.log('\n[B] Migración: cuenta anterior con contraseña en texto plano');
  const tieneLegacy = await p.evaluate(() => JSON.parse(localStorage.getItem('tdn2_db')).usuarios.find(u => u.usuario === 'nacho').claveLegacy);
  ok(tieneLegacy === '1234', 'usuario antiguo importado (pendiente de convertir a hash)');
  const l1 = await srv(p, 'return (await Servidor.iniciarSesion("nacho","1234")).usuario');
  ok(l1.v === 'nacho', 'el usuario antiguo puede iniciar sesión con su contraseña de siempre', l1);
  const tras = await p.evaluate(() => { const u = JSON.parse(localStorage.getItem('tdn2_db')).usuarios.find(u => u.usuario === 'nacho'); return { legacy: u.claveLegacy, hash: !!u.hash, alg: u.algoritmo }; });
  ok(tras.legacy === undefined && tras.hash, 'al entrar, la contraseña en texto plano se reemplaza por hash', tras);

  console.log('\n[C] Contraseñas incorrectas y límite de intentos');
  await p.evaluate(() => Servidor.cerrarSesion());
  let ult;
  for (let i = 0; i < 5; i++) ult = await srv(p, 'return Servidor.iniciarSesion("admin","mala' + i + '")');
  ok(ult.err && ult.err.estado === 401 && ult.err.mensaje.includes('incorrectos'), 'mensaje genérico (no revela si el usuario existe)', ult);
  const bloq = await srv(p, 'return Servidor.iniciarSesion("admin","Admin#2026")');
  ok(bloq.err && bloq.err.estado === 429, 'tras 5 fallos se bloquea el intento (rate limiting) incluso con la clave correcta', bloq);
  const noExiste = await srv(p, 'return Servidor.iniciarSesion("nadie","x1234567")');
  ok(noExiste.err && noExiste.err.mensaje === ult.err.mensaje, 'usuario inexistente da el MISMO mensaje que contraseña mala');
  await p.evaluate(() => localStorage.removeItem('tdn2_limites'));

  console.log('\n[D] Precio alterado desde el navegador: el servidor recalcula');
  await srv(p, 'return Servidor.iniciarSesion("cliente","Cliente#2026")');
  const alterado = await srv(p, `return Servidor.crearPedido({
     lineas:[{id:3,variante:"Negro",cantidad:1,precioUnitario:1,precio:1,total:1}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"},
     entrega:{metodo:"recoleccion",cp:""}, pago:{metodo:"Tarjeta",simulacion:"aprobado"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-precio" })`);
  ok(alterado.v && alterado.v.pedido.total === 15999, 'refrigerador con precio=1 enviado → se cobra $15,999 (precio del catálogo)', alterado.v && alterado.v.pedido.total);
  const alt2 = await srv(p, `return Servidor.crearPedido({ lineas:[{id:1,variante:"",cantidad:1}], cupon:"", total:1, contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"},
     entrega:{metodo:"recoleccion"}, pago:{metodo:"Tarjeta"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-total" })`);
  ok(alt2.v && alt2.v.pedido.total === 7199.2, 'campo "total:1" enviado → ignorado; total real $7,199.20', alt2.v && alt2.v.pedido.total);

  console.log('\n[E] Cantidad mayor al inventario');
  const sec0 = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===9).stock');
  ok(sec0.v === 3, 'secadora inicia con 3 piezas');
  const sol = n => `return Servidor.crearPedido({ lineas:[{id:9,variante:"Blanco",cantidad:${n}}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"}, entrega:{metodo:"recoleccion"}, pago:{metodo:"PayPal"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-sec${n}" })`;
  const e4 = await srv(p, sol(4));
  ok(e4.err && e4.err.estado === 409 && e4.err.mensaje.includes('existencias'), 'pedir 4 con stock 3 → rechazado (409)', e4);
  const e11 = await srv(p, sol(11));
  ok(e11.err && e11.err.estado === 409, 'pedir 11 (>10 por pedido) → rechazado', e11);
  const stockPost = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===9).stock');
  ok(stockPost.v === 3, 'los rechazos no alteran el inventario');
  const agot = await srv(p, `return Servidor.crearPedido({ lineas:[{id:15,variante:"",cantidad:1}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"}, entrega:{metodo:"recoleccion"}, pago:{metodo:"PayPal"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-agot" })`);
  ok(agot.err && agot.err.mensaje.includes('agotado'), 'producto agotado no se puede comprar', agot);
  const e3 = await srv(p, sol(3));
  ok(e3.v && e3.v.pedido.folio, 'comprar exactamente las 3 disponibles → permitido');
  const e1 = await srv(p, sol(1).replace('k-sec1', 'k-sec1b'));
  ok(e1.err && e1.err.mensaje.includes('agotado'), 'la siguiente compra de la secadora queda agotada (sin inventario negativo)', e1);
  const neg = await srv(p, 'return Servidor.catalogo().productos.every(x=>x.stock>=0)');
  ok(neg.v === true, 'ningún producto tiene inventario negativo');

  console.log('\n[F] Doble clic / reintento: idempotencia');
  const antes = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===12).stock');
  const mk = `return Servidor.crearPedido({ lineas:[{id:12,variante:"",cantidad:2}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"}, entrega:{metodo:"recoleccion"}, pago:{metodo:"PayPal"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-doble" })`;
  const d1 = await srv(p, mk), d2 = await srv(p, mk);
  ok(d1.v.pedido.folio === d2.v.pedido.folio && d2.v.repetido === true, 'mismo envío repetido devuelve el MISMO folio', [d1.v.pedido.folio, d2.v.pedido.folio]);
  const desp = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===12).stock');
  ok(antes.v - desp.v === 2, 'el inventario se descontó una sola vez', [antes.v, desp.v]);
  const cuenta = await srv(p, 'return Servidor.misPedidos().filter(x=>x.claveIdempotencia==="k-doble").length');
  ok(cuenta.v === 1, 'solo existe un pedido con esa clave');

  console.log('\n[G] Términos obligatorios (evidencia de aceptación) y entrega');
  const sinTer = await srv(p, `return Servidor.crearPedido({ lineas:[{id:12,variante:"",cantidad:1}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"}, entrega:{metodo:"recoleccion"}, pago:{metodo:"PayPal"}, terminos:{aceptado:false}, claveIdempotencia:"k-ter" })`);
  ok(sinTer.err && sinTer.err.estado === 422, 'el servidor rechaza pedidos sin aceptación de términos (aunque se salten el frontend)');
  const sinDir = await srv(p, `return Servidor.crearPedido({ lineas:[{id:12,variante:"",cantidad:1}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"}, entrega:{metodo:"estandar",cp:"87300"}, pago:{metodo:"PayPal"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-dir" })`);
  ok(sinDir.err && sinDir.err.estado === 422, 'el servidor exige dirección completa para envío a domicilio', sinDir);
  const cpMal = await srv(p, `return Servidor.crearPedido({ lineas:[{id:12,variante:"",cantidad:1}], cupon:"", contacto:{nombre:"Cli Ente",correo:"cliente@example.com",telefono:"8681234567"}, entrega:{metodo:"estandar",cp:"00123"}, pago:{metodo:"PayPal"}, terminos:{aceptado:true,version:"2026.1"}, claveIdempotencia:"k-cp" })`);
  ok(cpMal.err && cpMal.err.estado === 422, 'CP inválido rechazado');

  console.log('\n[H] XSS: caracteres especiales en datos del usuario');
  await p.goto(BASE + 'index.html'); await p.waitForSelector('.producto');
  const xss = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  await srv(p, `return Servidor.actualizarPerfil({nombre:${JSON.stringify(xss)},correo:"cliente@example.com",telefono:"",marketing:false})`);
  await p.reload(); await p.waitForSelector('.producto');
  await p.click('#cuentaBtn'); await p.waitForSelector('#cuentaPerfil input');
  await p.click('#tabDirecciones'); await p.click('#tabPerfil');
  const marca = await p.evaluate(() => window.__xss);
  ok(marca === undefined, 'el nombre con HTML malicioso NO se ejecuta (perfil)');
  const imgs = await p.locator('#cuentaPerfil img').count();
  ok(imgs === 0, 'no se inyectaron etiquetas <img> en el perfil');
  const valor = await p.inputValue('#perfNombre');
  ok(valor === xss, 'el texto se conserva literal en el campo');
  await p.keyboard.press('Escape');
  await p.fill('#buscador', '<script>alert(1)</script>'); await p.waitForTimeout(400);
  ok((await p.locator('#resultados').innerText()) === 'Sin resultados.' && (await p.evaluate(() => window.__xss)) === undefined, 'búsqueda con <script> es inofensiva');
  await srv(p, 'return Servidor.actualizarPerfil({nombre:"Cliente Demo",correo:"cliente@example.com",telefono:"",marketing:false})');

  console.log('\n[I] Sesión expirada');
  await srv(p, 'return Servidor.iniciarSesion("cliente","Cliente#2026")');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('tdn2_sesion')); s.expira = Date.now() - 1000; localStorage.setItem('tdn2_sesion', JSON.stringify(s)); });
  const exp = await srv(p, 'return Servidor.sesionActual()');
  ok(exp.v === null, 'sesión vencida → sesionActual() = null');
  const exp2 = await srv(p, 'return Servidor.misPedidos()');
  ok(exp2.err && exp2.err.estado === 401, 'con sesión vencida las operaciones responden 401');

  console.log('\n[J] Cuenta bloqueada y contraseña de recuperación');
  await srv(p, 'return Servidor.iniciarSesion("admin","Admin#2026")');
  await srv(p, 'return Servidor.actualizarUsuarioAdmin(3,{estado:"bloqueado"})');
  await p.evaluate(() => Servidor.cerrarSesion());
  const blq = await srv(p, 'return Servidor.iniciarSesion("cliente","Cliente#2026")');
  ok(blq.err && blq.err.estado === 403, 'cuenta bloqueada no inicia sesión');
  await srv(p, 'return Servidor.iniciarSesion("admin","Admin#2026")');
  await srv(p, 'return Servidor.actualizarUsuarioAdmin(3,{estado:"activo"})');
  await p.evaluate(() => Servidor.cerrarSesion());
  const rec = await srv(p, 'return Servidor.recuperarSolicitar("cliente@example.com")');
  const rec2 = await srv(p, 'return Servidor.recuperarSolicitar("noexiste@example.com")');
  ok(rec.v && rec2.v && rec.v.codigoSimulado.length === 6 && rec2.v.codigoSimulado.length === 6, 'recuperación simulada responde igual exista o no el correo');
  const malCod = await srv(p, 'return Servidor.recuperarConfirmar({correo:"cliente@example.com",codigo:"000000",clave:"Nueva#2026"})');
  ok(malCod.err && malCod.err.estado === 401, 'código incorrecto rechazado');
  const okCod = await srv(p, `return Servidor.recuperarConfirmar({correo:"cliente@example.com",codigo:"${rec.v.codigoSimulado}",clave:"Nueva#2026"})`);
  ok(!okCod.err, 'código correcto cambia la contraseña', okCod);
  const nuevaOk = await srv(p, 'return (await Servidor.iniciarSesion("cliente","Nueva#2026")).usuario');
  ok(nuevaOk.v === 'cliente', 'se puede entrar con la contraseña nueva');

  console.log('\nErrores de consola/página:', p.errs.length ? p.errs : 'ninguno');
  ok(p.errs.length === 0, 'sin errores de JS ni violaciones de CSP');
  await b.close();
  process.exit(resumen() ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(2); });
