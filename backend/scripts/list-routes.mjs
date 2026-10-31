// Prints every registered route (METHOD /api/v1/path). Patches the Router to remember mount paths.
import Router from 'router';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:1/x';
process.env.JWT_ACCESS_SECRET ||= 'x'.repeat(40);
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.NODE_ENV = 'test';
const origUse = Router.prototype.use;
Router.prototype.use = function patchedUse(...args) {
  const path = typeof args[0] === 'string' || Array.isArray(args[0]) ? args[0] : '/';
  const before = this.stack.length;
  const out = origUse.apply(this, args);
  for (let i = before; i < this.stack.length; i += 1) this.stack[i].__mount = path;
  return out;
};
const origRoute = Router.prototype.route;
Router.prototype.route = function patchedRoute(path) {
  const route = origRoute.call(this, path);
  this.stack[this.stack.length - 1].__path = path;
  return route;
};
const routes = (await import('../src/routes.js')).default;
const out = [];
function walk(stack, prefix) {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all').map((m) => m.toUpperCase());
      for (const m of methods) out.push(`${m.padEnd(6)} ${(prefix + layer.__path).replace(/\/+/g, '/').replace(/\/$/, '') || '/'}`);
    } else if (layer.handle?.stack) {
      const mounts = Array.isArray(layer.__mount) ? layer.__mount : [layer.__mount || '/'];
      for (const m of mounts) walk(layer.handle.stack, prefix + (m === '/' ? '' : m));
    }
  }
}
walk(routes.stack, '/api/v1');
console.log(out.join('\n'));
console.error('TOTAL', out.length);
process.exit(0);
