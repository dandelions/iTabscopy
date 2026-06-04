import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import process from 'process'
import pkg from './package.json' with { type: 'json' }

const __dirname = dirname(fileURLToPath(import.meta.url))

const getTagVersion = () => {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME
  }

  try {
    return execSync('git describe --tags --exact-match', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return pkg.version
  }
}

const getExtensionVersion = () => {
  const version = getTagVersion().replace(/^v/i, '')
  if (/^\d+(\.\d+){0,3}$/.test(version)) return version
  return pkg.version.replace(/^v/i, '')
}

const getBuildTime = () => process.env.VITE_BUILD_TIME || new Date().toISOString()

const syncManifestVersion = () => ({
  name: 'sync-manifest-version',
  apply: 'build',
  writeBundle(outputOptions) {
    const outDir = outputOptions.dir
      ? resolve(__dirname, outputOptions.dir)
      : resolve(__dirname, 'dist')
    const manifestPath = resolve(outDir, 'manifest.json')
    if (!existsSync(manifestPath)) return

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.version = getExtensionVersion()
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`)
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), syncManifestVersion()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(getTagVersion()),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(getBuildTime()),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        popup: resolve(__dirname, 'popup.html'),
      },
    },
  },
})
