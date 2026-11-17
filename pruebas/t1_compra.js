const { chromium, BASE, ok, nuevo, srv, resumen } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const { page: p } = await nuevo(b);
  await p.goto(BASE + 'index.html'); await p.waitForSelector('.producto');

  console.log('\n[1] Imágenes de producto (ilustraciones en imagenes/productos/)');
  const rutas = await p.evaluate(() => CATALOGO_BASE.map(x => x.imagen));
  ok(rutas.length === 15 && rutas.every(r => /^imagenes\/productos\/[a-z-]+\.(jpg|svg)$/.test(r)), 'los 15 productos tienen imagen propia', rutas);
  const rotas = await p.$$eval('.producto img', is => is.filter(i => !i.complete || i.naturalWidth === 0 || i.dataset.respaldo).length);
  ok(rotas === 0, 'todas las imágenes del catálogo cargan sin usar respaldo', rotas);
  const srcs = await p.$$eval('.producto img', is => is.map(i => i.getAttribute('src')));
  ok(srcs[0] === rutas[0], 'la tarjeta usa exactamente la ruta del catálogo');

  console.log('\n[2] Precio con oferta real e IVA incluido');
  const tv = p.locator('.producto', { hasText: 'Televisión' });
  ok((await tv.innerText()).includes('$7,199.20') && (await tv.innerText()).includes('$8,999.00'), 'TV: precio anterior $8,999 tachado y precio vigente $7,199.20');
  ok((await tv.innerText()).includes('20% OFF'), 'badge 20% OFF coincide con el descuento aplicado');
  ok((await tv.innerText()).includes('IVA incluido'), 'se indica moneda e IVA incluido');

  console.log('\n[3] Carrito: agregar, editar y quitar');
  await tv.locator('[data-agregar]').click();
  await p.locator('#carritoBtn').click();
  ok(await p.locator('#contador').innerText() === '1', 'contador = 1');
  await p.locator('[data-mas]').click();
  ok(await p.locator('[data-cant]').inputValue() === '2', 'botón + sube cantidad a 2');
  await p.locator('[data-cant]').fill('3'); await p.locator('[data-cant]').dispatchEvent('change');
  ok(await p.locator('[data-cant]').inputValue() === '3', 'cantidad editable por teclado = 3');
  await p.locator('[data-cant]').fill('99'); await p.locator('[data-cant]').dispatchEvent('change');
  ok(Number(await p.locator('[data-cant]').inputValue()) <= 10, 'tope por producto respetado (≤10)', await p.locator('[data-cant]').inputValue());
  await p.locator('[data-cant]').fill('1'); await p.locator('[data-cant]').dispatchEvent('change');

  console.log('\n[4] Checkout paso 1: validación y sesión obligatoria');
  await p.locator('#btnPaso2').click();
  ok((await p.locator('#envNombre-error').count()) === 1, 'muestra errores de campos obligatorios');
  await p.fill('#envNombre', 'Ana Prueba'); await p.fill('#envCorreo', 'ana@example.com'); await p.fill('#envTelefono', '8681234567');
  await p.fill('#envDestinatario', 'Ana Prueba'); await p.fill('#envCalle', 'Calle Falsa 123'); await p.fill('#envColonia', 'Centro');
  await p.fill('#envMunicipio', 'Matamoros'); await p.selectOption('#envEstado', 'Tamaulipas'); await p.fill('#codigoPostal', '87300');
  ok((await p.locator('#infoEnvio').innerText()).includes('$250.00'), 'costo de envío por zona (CP 87300 → $250)', await p.locator('#infoEnvio').innerText());
  await p.locator('#btnPaso2').click();
  ok(await p.locator('#loginPopup').evaluate(e => e.classList.contains('visible')), 'sin sesión → pide iniciar sesión');

  console.log('\n[5] Registro con validaciones');
  await p.click('#tabRegistro');
  await p.fill('#regNombre', 'Ana Prueba'); await p.fill('#usuarioRegistro', 'ana'); await p.fill('#regCorreo', 'ana@example.com'); await p.fill('#claveRegistro', 'corta');
  await p.click('#registrarUsuario');
  ok((await p.locator('#mensajeRegistro').innerText()).includes('8 caracteres'), 'rechaza contraseña débil', await p.locator('#mensajeRegistro').innerText());
  await p.fill('#claveRegistro', 'Segura#2026');
  await p.click('#registrarUsuario');
  ok((await p.locator('#mensajeRegistro').innerText()).includes('mayor de 18'), 'exige confirmar mayoría de edad', await p.locator('#mensajeRegistro').innerText());
  await p.check('#regMayor'); await p.click('#registrarUsuario');
  ok((await p.locator('#mensajeRegistro').innerText()).includes('Aviso de privacidad'), 'exige aceptar aviso de privacidad (casilla no premarcada)');
  ok(!(await p.locator('#regPrivacidad').isChecked()) && !(await p.locator('#regMarketing').isChecked()), 'casillas de consentimiento NO vienen premarcadas');
  await p.check('#regPrivacidad'); await p.click('#registrarUsuario');
  await p.waitForFunction(() => !document.getElementById('loginPopup').classList.contains('visible'));
  await p.waitForSelector('#pasoResumen:not([hidden])');
  ok(true, 'tras registrarse continúa al paso 2 (Resumen) automáticamente');
  ok((await p.locator('#resumenTotales').innerText()).includes('$7,449.20'), 'total = 7,199.20 + 250 envío', await p.locator('#resumenTotales').innerText());
  ok((await p.locator('#resumenTotales').innerText()).includes('IVA'), 'se muestra el IVA incluido');

  console.log('\n[6] Cupones validados por el servidor');
  await p.fill('#codigoCupon', 'NACHO20'); await p.click('#aplicarCupon');
  ok((await p.locator('#mensajeCupon').innerText()).includes('compra mínima'), 'NACHO20 exige compra mínima de $8,000', await p.locator('#mensajeCupon').innerText());
  await p.fill('#codigoCupon', 'FALSO'); await p.click('#aplicarCupon');
  ok((await p.locator('#mensajeCupon').innerText()).includes('no válido'), 'cupón inexistente rechazado');
  await p.fill('#codigoCupon', 'nacho10'); await p.click('#aplicarCupon');
  ok((await p.locator('#resumenTotales').innerText()).includes('−$719.92'), 'NACHO10 = 10% sobre productos (−$719.92)', await p.locator('#resumenTotales').innerText());
  ok((await p.locator('#resumenTotales').innerText()).includes('$6,729.28'), 'total con cupón = 6,729.28', await p.locator('#resumenTotales').innerText());

  console.log('\n[7] Pago sandbox: sin datos de tarjeta, términos obligatorios, rechazo');
  await p.click('#btnPaso3');
  const html = await p.content();
  const camposTarjeta = await p.$$eval('input,select,textarea', els => els.filter(e => /tarjeta|cvv|caducidad|cc-/i.test((e.id||'')+(e.name||'')+(e.autocomplete||'')+(e.placeholder||''))).map(e => e.id));
  ok(camposTarjeta.length === 0, 'no existe ningún input de tarjeta/CVV/caducidad en la página', camposTarjeta);
  ok((await p.locator('.aviso-sandbox').first().innerText()).includes('no pide, recibe ni guarda'), 'aviso claro: no se piden datos de tarjeta');
  ok(!(await p.locator('#aceptoTerminosCheckout').isChecked()), 'clickwrap NO premarcado');
  await p.click('#confirmarCompra');
  ok((await p.locator('#errorPago').innerText()).includes('método de pago'), 'exige método de pago');
  await p.check('input[name=pago][value=Tarjeta]'); await p.click('#confirmarCompra');
  ok((await p.locator('#errorPago').innerText()).includes('aceptar'), 'exige aceptar términos antes de pagar');
  await p.check('#aceptoTerminosCheckout'); await p.selectOption('#simulacion', 'rechazado');
  await p.click('#confirmarCompra');
  await p.waitForFunction(() => !document.getElementById('procesandoPopup').classList.contains('visible'));
  ok((await p.locator('#errorPago').innerText()).includes('rechazado'), 'pago rechazado muestra error', await p.locator('#errorPago').innerText());
  const stock1 = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===1).stock');
  ok(stock1.v === 10, 'rechazo NO descuenta inventario (stock sigue en 10)', stock1);
  ok(await p.locator('#contador').innerText() === '1', 'rechazo NO vacía el carrito');
  const pedidos0 = await srv(p, 'return Servidor.misPedidos().length');
  ok(pedidos0.v === 0, 'rechazo NO deja pedidos parciales');

  console.log('\n[8] Pago aprobado: folio, inventario, movimiento, carrito vacío');
  await p.selectOption('#simulacion', 'aprobado');
  await p.click('#confirmarCompra');
  await p.waitForSelector('#confirmacionPopup.visible');
  const folio = await p.locator('#numeroOrden').innerText();
  ok(/^DN-\d{6}$/.test(folio), 'genera folio ' + folio);
  ok((await p.locator('#resumenConfirmacion').innerText()).includes('$6,729.28'), 'confirmación muestra total pagado');
  const stock2 = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===1).stock');
  ok(stock2.v === 9, 'inventario descontado (10 → 9)', stock2);
  ok(await p.locator('#contador').innerText() === '0', 'carrito vacío tras la compra');
  const ped = await srv(p, 'return Servidor.misPedidos()[0]');
  ok(ped.v.total === 6729.28 && ped.v.estado === 'Pagado' && ped.v.terminos.version === '2026.1', 'pedido guardado con total, estado y evidencia de términos (versión/fecha)');
  ok(ped.v.lineas[0].sku === 'UN55DU7000' && ped.v.lineas[0].precioUnitario === 7199.2, 'la partida guarda copia del modelo y precio');

  console.log('\n[9] Persistencia segura: sin contraseñas ni datos de tarjeta en el almacenamiento');
  const ls = await p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  ok(!ls.includes('Segura#2026'), 'la contraseña NO está en texto plano');
  ok(ls.includes('pbkdf2-sha256-150000'), 'se usa hash PBKDF2-SHA256');
  ok(!/"clave"|cvv|numeroTarjeta/i.test(ls), 'no hay campos clave/cvv/tarjeta');

  console.log('\n[10] Mi cuenta → pedidos y mensajes');
  await p.click('#verSeguimiento');
  await p.waitForSelector('#modalGeneral.visible');
  ok((await p.locator('#modalGeneralTitulo').innerText()).includes(folio), 'detalle del pedido abre desde la confirmación');
  ok((await p.locator('#modalGeneral .modal-cuerpo').innerText()).includes('Cancelar pedido'), 'permite cancelar (estado Pagado)');
  await p.keyboard.press('Escape');
  ok(!(await p.locator('#modalGeneral').evaluate(e => e.classList.contains('visible'))), 'Esc cierra el modal');

  console.log('\nErrores de consola/página:', p.errs.length ? p.errs : 'ninguno');
  ok(p.errs.length === 0, 'sin errores de JS ni violaciones de CSP');
  await b.close();
  process.exit(resumen() ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(2); });
