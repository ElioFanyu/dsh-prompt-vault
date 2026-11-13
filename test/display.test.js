/**
 * Display resources: the icon, the locale metadata, and the detail document.
 *
 * These are read by Plugin Manager without activating the plugin, so a broken
 * path or a dangling SVG reference shows up as generic artwork or a failed
 * detail section — never as a plugin error anyone would notice. Check them here.
 */
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (relative) => readFile(join(root, relative), 'utf8')

/** Parse one SVG far enough to catch the mistakes that break rendering. */
function auditSvg(source, name) {
  const ids = new Set([...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const refs = [...source.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1])
  const dangling = refs.filter((ref) => !ids.has(ref))
  assert.deepEqual(dangling, [], `${name}: url(#…) references a missing id`)

  // The icon and feature image are loaded as images: no scripting, no external
  // fetches, no <foreignObject>, and no live text the viewer could reflow.
  for (const forbidden of ['<script', '<foreignObject', '<style', 'onload=', 'onclick=', '<animate']) {
    assert.ok(!source.includes(forbidden), `${name}: contains ${forbidden}`)
  }
  return { ids, refs }
}

test('the SVG ids are unique within each file', async () => {
  // Duplicated ids across two SVGs on one page collide once both are inlined.
  const icon = await read('icon.svg')
  const previews = [await read('docs/preview.svg'), await read('docs/preview.zh.svg')]
  const all = [...previews.flatMap((s) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])), ...(auditSvg(icon, 'icon.svg').ids)]
  const seen = new Set()
  for (const id of all) {
    assert.ok(!seen.has(id), `duplicate svg id across files: ${id}`)
    seen.add(id)
  }
})

test('the icon is a valid, tile-free SVG within the size limit', async () => {
  const source = await read('icon.svg')
  auditSvg(source, 'icon.svg')
  assert.ok(source.startsWith('<svg'), 'icon.svg starts with <svg')
  assert.match(source, /viewBox="0 0 36 36"/, 'icons use the 36×36 canvas')
  // Plugin Manager draws the surrounding tile; a background rect here would
  // stack a second tile inside it.
  const fullBleed = /<rect[^>]+width="36"[^>]+height="36"/.test(source)
  assert.ok(!fullBleed, 'the icon must not draw its own full-size background')

  const info = await stat(join(root, 'icon.svg'))
  assert.ok(info.size < 256 * 1024, `icon.svg is ${info.size} bytes, limit is 256 KiB`)
})

test('every locale declares title, description and a resolvable detail document', async () => {
  for (const [locale, expectedDetail] of [
    ['en', 'docs/DETAIL.md'],
    ['zh', 'docs/DETAIL.zh.md'],
  ]) {
    const meta = JSON.parse(await read(`locale/${locale}.json`)).meta
    assert.ok(typeof meta.title === 'string' && meta.title.trim() !== '', `${locale}: meta.title`)
    assert.ok(typeof meta.description === 'string' && meta.description.trim() !== '', `${locale}: meta.description`)
    assert.equal(meta.detail, expectedDetail, `${locale}: meta.detail`)

    // A missing file is an error, not a README fallback.
    const document = await read(meta.detail)
    const lines = document.split('\n').filter((line) => line.trim() !== '')
    assert.equal(lines.length, 1, `${locale}: the detail document holds exactly one image line`)
    const image = /^!\[([^\]]+)\]\(([^)]+)\)$/.exec(lines[0])
    assert.ok(image !== null, `${locale}: the detail document is one markdown image`)
    assert.ok(image[1].trim() !== '', `${locale}: the image needs alternative text`)
    assert.ok(!/^[a-z]+:|^\//.test(image[2]), `${locale}: the image path stays inside the package`)
  }
})

test('the feature images are valid SVGs at the documented canvas size', async () => {
  for (const file of ['docs/preview.svg', 'docs/preview.zh.svg']) {
    const source = await read(file)
    auditSvg(source, file)
    assert.match(source, /width="640"\s+height="300"/, `${file}: 640×300 canvas`)
    assert.match(source, /viewBox="0 0 640 300"/, `${file}: matching viewBox`)
    const info = await stat(join(root, file))
    assert.ok(info.size < 1024 * 1024, `${file}: ${info.size} bytes`)
  }
})

test('the manifest exports and packs every display resource', async () => {
  const manifest = JSON.parse(await read('package.json'))
  for (const key of ['./locale/*.json', './icon', './client', '.']) {
    assert.ok(manifest.exports[key] !== undefined, `exports["${key}"]`)
  }
  assert.ok(manifest.files.includes('docs'), 'files includes the detail document directory')
  assert.ok(manifest.files.includes('locale/*.json'), 'files includes the locales')
  assert.ok(manifest.files.includes('icon.svg'), 'files includes the icon')
  assert.ok(manifest.files.includes('lib'), 'files includes the runtime code')

  // The declared engines must admit the release this machine runs.
  const range = manifest.engines.dsh
  assert.ok(/>=0\.2\.1-rc\.3/.test(range), `engines.dsh must admit 0.2.1-rc.3 and newer: ${range}`)
})
