const { chromium, BASE, ok, nuevo, srv, resumen } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const { page: p } = await nuevo(b);
  await p.goto(BASE + 'index.html'); await p.waitForSelector('.producto'); await p.click('#cookiesAceptar');

  console.log('\n[A] Teclado: foco, trampa de foco, Esc y retorno de foco');
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement.classList.contains('saltar')), 'primer Tab → enlace "Saltar al catálogo"');
  await p.focus('#ayudaBtn'); await p.keyboard.press('Enter'); await p.waitForSelector('#ayudaPopup.visible'); await p.waitForTimeout(250);
  const dentro = () => p.evaluate(() => document.getElementById('ayudaPopup').contains(document.activeElement));
  ok(await dentro(), 'al abrir un diálogo el foco entra en él');
  for (let i = 0; i < 25; i++) await p.keyboard.press('Tab');
  ok(await dentro(), 'tras 25 Tab el foco sigue atrapado dentro del diálogo');
  for (let i = 0; i < 25; i++) await p.keyboard.press('Shift+Tab');
  ok(await dentro(), 'Shift+Tab también queda atrapado');
  await p.keyboard.press('Escape');
  ok(await p.evaluate(() => document.activeElement.id) === 'ayudaBtn', 'Esc cierra y devuelve el foco al botón que lo abrió');
  // pestañas con flechas
  await p.click('#ayudaBtn'); await p.waitForTimeout(250); await p.focus('#tabFaq'); await p.keyboard.press('ArrowRight');
  ok(await p.getAttribute('#tabContacto', 'aria-selected') === 'true' && await p.evaluate(() => document.activeElement.id) === 'tabContacto', 'pestañas navegables con flechas del teclado');
  await p.keyboard.press('Escape');
  // formularios etiquetados
  const sinEtiqueta = await p.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map(e => e.id));
  ok(sinEtiqueta.length === 0, 'todos los campos de la tienda tienen etiqueta', sinEtiqueta);
  const imgSinAlt = await p.$$eval('img', is => is.filter(i => !i.hasAttribute('alt')).length);
  ok(imgSinAlt === 0, 'todas las imágenes tienen texto alternativo');
  const botonesVacios = await p.$$eval('button', bs => bs.filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length);
  ok(botonesVacios === 0, 'no hay botones sin nombre accesible (los de emoji llevan aria-label)');
  // doble Enter en pagar: sin pedidos duplicados
  console.log('\n[B] Doble clic en “Confirmar y pagar”');
  await srv(p, 'return Servidor.iniciarSesion("cliente","Cliente#2026")'); await p.reload(); await p.waitForSelector('.producto');
  await p.locator('.producto', { hasText: 'Barra de sonido' }).locator('[data-agregar]').click();
  await p.click('#carritoBtn');
  await p.check('input[name=entrega][value=recoleccion]');
  await p.fill('#envNombre', 'Cliente Demo'); await p.fill('#envCorreo', 'cliente@example.com'); await p.fill('#envTelefono', '8681234567');
  await p.click('#btnPaso2'); await p.waitForSelector('#pasoResumen:not([hidden])'); await p.click('#btnPaso3');
  await p.check('input[name=pago][value=MercadoPago]'); await p.check('#aceptoTerminosCheckout');
  await p.dblclick('#confirmarCompra');
  await p.waitForSelector('#confirmacionPopup.visible');
  const n = await srv(p, 'return Servidor.misPedidos().length');
  const st = await srv(p, 'return Servidor.catalogo().productos.find(x=>x.id===7).stock');
  ok(n.v === 1 && st.v === 7, 'doble clic crea UN solo pedido y descuenta UNA sola vez (8 → 7)', { pedidos: n.v, stock: st.v });
  await p.keyboard.press('Escape');

  console.log('\n[C] Móvil 360 px: sin desbordamiento horizontal en cada ventana');
  const { page: m } = await nuevo(b, { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await m.goto(BASE + 'index.html'); await m.waitForSelector('.producto'); await m.click('#cookiesAceptar');
  const desborda = async nombre => { const r = await m.evaluate(() => { const v = window.innerWidth; const el = [...document.querySelectorAll('.popup.visible .popup-contenido, body')].map(e => e.scrollWidth - e.clientWidth); return { doc: document.documentElement.scrollWidth - v, popup: Math.max(0, ...el) }; }); ok(r.doc <= 0 && r.popup <= 1, `${nombre}: sin scroll horizontal`, r); };
  await desborda('inicio');
  await srv(m, 'return Servidor.iniciarSesion("cliente","Cliente#2026")'); await m.reload(); await m.waitForSelector('.producto');
  await m.locator('.producto', { hasText: 'Televisión' }).locator('[data-agregar]').click(); await m.click('#carritoBtn'); await m.waitForTimeout(350); await desborda('carrito (paso 1)');
  await m.fill('#envNombre', 'Cliente Demo'); await m.fill('#envCorreo', 'cliente@example.com'); await m.fill('#envTelefono', '8681234567'); await m.fill('#envDestinatario', 'Cliente Demo'); await m.fill('#envCalle', 'Calle 5 #123'); await m.fill('#envColonia', 'Centro'); await m.fill('#envMunicipio', 'Matamoros'); await m.selectOption('#envEstado', 'Tamaulipas'); await m.fill('#codigoPostal', '87300');
  await m.click('#btnPaso2'); await m.waitForSelector('#pasoResumen:not([hidden])'); await desborda('carrito (resumen)');
  await m.click('#btnPaso3'); await desborda('carrito (pago)'); await m.keyboard.press('Escape');
  await m.click('#cuentaBtn'); await m.waitForTimeout(350); await desborda('mi cuenta'); await m.keyboard.press('Escape');
  await m.click('#ayudaBtn'); await m.waitForTimeout(350); await desborda('ayuda'); await m.keyboard.press('Escape');
  await m.locator('footer [data-legal="envios"]').click(); await m.waitForTimeout(350); await desborda('política de envíos (tabla)'); await m.keyboard.press('Escape');
  const tamTap = await m.evaluate(() => [...document.querySelectorAll('button,a,select,input')]  .filter(e => e.offsetParent !== null && !e.classList.contains('enlace') && !['checkbox','radio'].includes(e.type)).filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 24; }).map(e => e.id || e.className || e.tagName).slice(0, 5));
  ok(tamTap.length === 0, 'controles táctiles ≥ 24 px de alto (WCAG 2.5.8)', tamTap);
  const a = await m.context().newPage(); await srv(m, 'return Servidor.iniciarSesion("admin","Admin#2026")');
  await a.setViewportSize({ width: 360, height: 740 }); await a.goto(BASE + 'admin.html#pedidos'); await a.waitForSelector('.admin-menu');
  const ad = await a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ad <= 0, 'panel admin en 360 px: sin scroll horizontal de página (las tablas hacen scroll interno)', ad);

  console.log('\nErrores:', p.errs, m.errs);
  ok(p.errs.length === 0 && m.errs.length === 0, 'sin errores de JS ni violaciones de CSP');
  await b.close(); process.exit(resumen() ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(2); });
