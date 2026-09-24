import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

// Evaluate the real module with explicit, offline-only dependencies.
export async function loadSource(relativePath, {
  imports = {},
  globals = {},
  metaEnv = { VITE_API_BASE: 'http://127.0.0.1:8000', PROD: false },
} = {}) {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  const context = createContext({
    AbortController,
    atob,
    btoa,
    clearTimeout,
    console,
    performance,
    setTimeout,
    TextEncoder,
    URL,
    ...globals,
  });
  const source = new SourceTextModule(await readFile(url, 'utf8'), {
    context,
    identifier: url.href,
    initializeImportMeta(meta) {
      meta.env = metaEnv;
    },
  });
  await source.link((specifier) => {
    if (!Object.hasOwn(imports, specifier)) {
      throw new Error(`Unexpected dependency in offline test: ${specifier}`);
    }
    const exports = imports[specifier];
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await source.evaluate();
  return source.namespace;
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
