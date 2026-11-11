import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { zipSync } from 'fflate'
import type { Plugin } from 'vite'

// Fonts and models arrive as files, and Iconify data is read by a build plugin.
// Keep their notices alongside the licenses collected from installed packages.
const EXTRA: Record<string, string[]> = {
  '@iconify-json/carbon': ['icons/carbon.txt'],
  '@iconify-json/fluent-emoji-flat': ['icons/fluent-emoji.txt'],
  '@iconify-json/lucide': ['icons/lucide.txt'],
  '@iconify-json/mdi': ['icons/material-design.txt', 'Apache-2.0.txt'],
  '@iconify-json/ph': ['icons/phosphor.txt'],
  '@iconify-json/ri': ['icons/remix.txt'],
  '@iconify-json/tabler': ['icons/tabler.txt'],
  'guid-typescript': ['packages/guid-typescript.txt'],
  'onnxruntime-common': ['packages/onnxruntime.txt', 'packages/onnxruntime-notices.txt'],
  'onnxruntime-web': ['packages/onnxruntime.txt', 'packages/onnxruntime-notices.txt'],
  wouter: ['packages/wouter.txt'],
}

type Package = {
  name: string
  version: string
  license?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function readPackage(dir: string): Package {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Package
}

function packageDir(name: string, from: string): string | null {
  for (let dir = from;; dir = dirname(dir)) {
    const found = join(dir, 'node_modules', name)
    if (existsSync(join(found, 'package.json'))) return found
    if (dir === dirname(dir)) return null
  }
}

function dependencyNotices(root: string): string {
  const seen = new Set<string>()
  const entries = new Map<string, string>()
  const visit = (name: string, from: string, optional = false) => {
    const dir = packageDir(name, from)
    if (!dir) {
      if (optional) return
      throw new Error(`Missing package for the license list: ${name}`)
    }
    if (seen.has(dir)) return
    seen.add(dir)
    const pkg = readPackage(dir)
    const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice|third.?party.?notices)/i.test(f)
      && statSync(join(dir, f)).isFile())
    const notices = files.map((f) => readFileSync(join(dir, f), 'utf8').trim())
    for (const file of EXTRA[pkg.name] ?? []) {
      notices.push(readFileSync(join(root, 'public/licenses', file), 'utf8').trim())
    }
    if (!notices.length) throw new Error(`No license text for ${pkg.name}@${pkg.version}; add its notice before building`)
    const source = `https://registry.npmjs.org/${pkg.name}/-/${basename(pkg.name)}-${pkg.version}.tgz`
    entries.set(`${pkg.name}@${pkg.version}`, `${pkg.name} ${pkg.version} (${pkg.license ?? 'see notice'})\nSource: ${source}\n\n${notices.join('\n\n')}`)
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).sort()) {
      visit(dep, dir, dep in (pkg.optionalDependencies ?? {}))
    }
  }
  for (const name of Object.keys(readPackage(root).dependencies ?? {}).sort()) visit(name, root)
  return 'Third-party software\n\nThese are the installed runtime packages, including the fonts, icons and worker dependencies.\n'
    + [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => `\n${'='.repeat(72)}\n\n${text}\n`).join('')
}

function mediaSource(root: string): Uint8Array {
  const dir = packageDir('mediabunny', root)
  if (!dir) throw new Error('Missing mediabunny source')
  const files: Record<string, Uint8Array> = {}
  const prefix = `mediabunny-${readPackage(dir).version}`
  const add = (file: string) => { files[`${prefix}/${relative(dir, file).replaceAll('\\', '/')}`] = readFileSync(file) }
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) add(file)
    }
  }
  walk(join(dir, 'src'))
  add(join(dir, 'LICENSE'))
  add(join(dir, 'package.json'))
  return zipSync(files, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') })
}

function collect(root: string): Map<string, string | Uint8Array> {
  const repo = dirname(root)
  const files = new Map<string, string | Uint8Array>([
    ['licenses/credits.txt', readFileSync(join(repo, 'CREDITS.md'), 'utf8')],
    ['licenses/krevaya-app.txt', readFileSync(join(repo, 'LICENSE'), 'utf8')],
    ['licenses/dependencies.txt', dependencyNotices(root)],
    ['licenses/mediabunny-source.zip', mediaSource(root)],
  ])
  const fonts = join(repo, 'backend/app/content/font_files')
  const families = readdirSync(fonts, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const family of families) {
    files.set(`licenses/fonts/${family}.txt`, readFileSync(join(fonts, family, 'LICENSE.txt'), 'utf8'))
  }
  files.set('licenses/index.html', `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Licenses and credits · Krevaya</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#25222c}a{color:#6c3acb}h1,h2{line-height:1.25}ul{padding-left:24px}</style>
<main><h1>Licenses and credits</h1><p>The libraries, fonts, icons and model that Krevaya builds on keep their own licenses.</p>
<ul><li><a href="credits.txt">Credits</a></li><li><a href="krevaya-app.txt">Krevaya license (AGPL-3.0)</a></li>
<li><a href="dependencies.txt">Library and icon notices</a></li><li><a href="../models/NOTICE.txt">Cut-out model: source and notices</a></li>
<li><a href="../models/LICENSE.txt">Cut-out model license (Apache-2.0)</a></li><li><a href="../models/rembg-LICENSE.txt">rembg license (MIT)</a></li>
<li><a href="mediabunny-source.zip">Media export library source (mediabunny, MPL-2.0)</a></li></ul>
<h2>Fonts</h2><p>Each file below includes the family's copyright notice and license.</p><ul>
${families.map((f) => `<li><a href="fonts/${encodeURIComponent(f)}.txt">${f}</a></li>`).join('\n')}
</ul></main></html>\n`)
  return files
}

export function notices(): Plugin {
  let files: Map<string, string | Uint8Array>
  return {
    name: 'krevaya-notices',
    configResolved(config) { files = collect(config.root) },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0].replace(/^\//, '')
        const name = path === 'licenses' || path === 'licenses/' ? 'licenses/index.html' : path
        const body = name ? files.get(name) : undefined
        if (body === undefined) return next()
        res.setHeader('Content-Type', name?.endsWith('.html') ? 'text/html; charset=utf-8'
          : name?.endsWith('.zip') ? 'application/zip' : 'text/plain; charset=utf-8')
        res.end(body)
      })
    },
    generateBundle() {
      for (const [fileName, source] of files) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
