const { chromium } = require('playwright');
const BASE = (process.env.TIENDA_URL || 'http://localhost:8080/').replace(/\/?$/, '/');
let pass = 0, fail = 0; const fallos = [];
function ok(cond, nombre, extra) { if (cond) { pass++; console.log('  ✔', nombre); } else { fail++; fallos.push(nombre); console.log('  ✘', nombre, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); } }
async function nuevo(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
  page.errs = errs; return { ctx, page };
}
// ejecuta código de Servidor en la página; devuelve {v} o {err:{estado,mensaje}}
async function srv(page, fn, arg) {
  return page.evaluate(async ([f, a]) => { try { const r = await (new Function('a', 'return (async () => {' + f + '})()'))(a); return { v: r }; } catch (e) { return { err: { estado: e.estado, mensaje: e.message } }; } }, [fn, arg]);
}
module.exports = { chromium, BASE, ok, nuevo, srv, resumen: () => { console.log(`\nRESULTADO: ${pass} ok, ${fail} fallos`); if (fail) console.log('FALLOS:', fallos); return fail; } };
