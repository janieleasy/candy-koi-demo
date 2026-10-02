import { defineConfig } from 'vitest/config';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * 大赢演出预热清单:构建时找出 showcase/candy 动态入口块及其(非首屏)依赖块(three 块等),
 * 把主入口里的占位字面量 "__SHOWCASE_CHUNKS__" 替换成 JSON 文件名数组;运行时 prefetch.ts 在空闲时 <link rel=prefetch> 它们。
 * 首屏已静态依赖的块(index / pixi)不在清单内。
 */
function showcaseChunks(): Plugin {
  return {
    name: 'showcase-chunks', apply: 'build',
    generateBundle(_o, bundle) {
      const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
      const entry = chunks.find(c => c.type === 'chunk' && c.isEntry);
      if (!entry || entry.type !== 'chunk') return;
      const initial = new Set<string>();
      const walk = (n: string, into: Set<string>) => { const c = bundle[n]; if (!c || c.type !== 'chunk' || into.has(n)) return; into.add(n); c.imports.forEach(i => walk(i, into)); };
      walk(entry.fileName, initial);
      const lazy = new Set<string>();
      for (const c of chunks) if (c.type === 'chunk' && c.isDynamicEntry && /showcase[\\/]candy[\\/]index/.test(c.facadeModuleId ?? '')) walk(c.fileName, lazy);
      const list = [...lazy].filter(f => !initial.has(f));
      entry.code = entry.code.replace(/(["'`])__SHOWCASE_CHUNKS__\1/, () => JSON.stringify(JSON.stringify(list)));
    },
  };
}

// 引擎(数学)与规范(类型契约)位于兄弟目录,通过 alias 引用,不复制、不改动。
export default defineConfig({
  base: './', // 相对路径,dist/ 可放任意子路径
  plugins: [showcaseChunks()],
  resolve: {
    alias: {
      '@engine-config': path.resolve(__dirname, '../slots-engine/config'),
      '@engine': path.resolve(__dirname, '../slots-engine/src'),
      '@spec': path.resolve(__dirname, '../slots-spec'), // 仅 import type(构建时擦除)
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: { host: true, fs: { allow: ['..'] } },
  preview: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { pixi: ['pixi.js'], three: ['three'] } } },
  },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
