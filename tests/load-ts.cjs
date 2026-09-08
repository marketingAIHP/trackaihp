const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loadTs(filename, mocks = {}, cache = new Map()) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('.')) {
      let file = path.resolve(path.dirname(filename), name);
      if (!path.extname(file)) file += '.ts';
      return loadTs(file, mocks, cache);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', '__DEV__', source)(localRequire, module, module.exports, false);
  return module.exports;
}
module.exports = { loadTs };
