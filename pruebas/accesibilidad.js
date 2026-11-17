const { chromium, BASE, nuevo, srv } = require('./lib');
const fs = require('fs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
async function auditar(p, nombre) {
  await p.waitForTimeout(450); await p.evaluate(AXE);
  const r = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, impacto: v.impact, n: v.nodes.length, ayuda: v.help, ej: v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' | ' + (n.failureSummary || '').split('\n').slice(1, 3).join(' ')) })));
  console.log(`\n== ${nombre}: ${r.length} tipo(s) de violación`);
  r.forEach(v => console.log(` - [${v.impacto}] ${v.id} (${v.n}): ${v.ayuda}\n     ${v.ej.join('\n     ')}`));
  return r.length;
}
(async () => {
  const b = await chromium.launch(); const { page: p, ctx } = await nuevo(b);
  let total = 0;
  await p.goto(BASE + 'index.html'); await p.waitForSelector('.producto');
  total += await auditar(p, 'Inicio (invitado, con banner)');
  await p.click('#cookiesAceptar');
  await p.locator('[data-detalle]').nth(1).click(); await p.waitForSelector('#productoPopup.visible'); total += await auditar(p, 'Detalle de producto'); await p.keyboard.press('Escape');
  await p.click('#loginBtn'); total += await auditar(p, 'Login'); await p.click('#tabRegistro'); total += await auditar(p, 'Registro'); await p.click('#tabRecuperar'); total += await auditar(p, 'Recuperar'); await p.keyboard.press('Escape');
  await p.locator('.producto', { hasText: 'Televisión' }).locator('[data-agregar]').click();
  await p.click('#carritoBtn'); await p.waitForTimeout(300); total += await auditar(p, 'Carrito – paso 1');
  await srv(p, 'return Servidor.iniciarSesion("cliente","Cliente#2026")'); await p.reload(); await p.waitForSelector('.producto');
  await p.click('#carritoBtn');
  await p.fill('#envNombre', 'Cliente Demo'); await p.fill('#envCorreo', 'cliente@example.com'); await p.fill('#envTelefono', '8681234567'); await p.fill('#envDestinatario', 'Cliente Demo'); await p.fill('#envCalle', 'Calle 5 #123'); await p.fill('#envColonia', 'Centro'); await p.fill('#envMunicipio', 'Matamoros'); await p.selectOption('#envEstado', 'Tamaulipas'); await p.fill('#codigoPostal', '87300');
  await p.click('#btnPaso2'); await p.waitForSelector('#pasoResumen:not([hidden])'); total += await auditar(p, 'Carrito – paso 2');
  await p.click('#btnPaso3'); total += await auditar(p, 'Carrito – paso 3');
  await p.keyboard.press('Escape');
  await p.click('#cuentaBtn'); for (const t of ['tabPerfil', 'tabDirecciones', 'tabPedidos', 'tabDevoluciones', 'tabMensajes']) { await p.click('#' + t); total += await auditar(p, 'Cuenta – ' + t); }
  await p.keyboard.press('Escape');
  await p.click('#ayudaBtn'); total += await auditar(p, 'Ayuda FAQ'); await p.click('#tabContacto'); total += await auditar(p, 'Ayuda contacto'); await p.keyboard.press('Escape');
  await p.click('#seguimientoBtn'); total += await auditar(p, 'Seguimiento'); await p.keyboard.press('Escape');
  await p.locator('footer [data-legal="terminos"]').click(); total += await auditar(p, 'Modal legal'); await p.keyboard.press('Escape');
  await srv(p, 'return Servidor.iniciarSesion("admin","Admin#2026")');
  const a = await ctx.newPage(); await a.goto(BASE + 'admin.html'); await a.waitForSelector('.kpis'); total += await auditar(a, 'Admin dashboard');
  for (const s of ['pedidos', 'productos', 'inventario', 'clientes', 'promociones', 'atencion', 'reportes', 'auditoria']) { await a.goto(BASE + 'admin.html#' + s); await a.waitForTimeout(300); total += await auditar(a, 'Admin ' + s); }
  console.log('\nTOTAL tipos de violación:', total); await b.close();
})();
