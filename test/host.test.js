/**
 * Host-half checks for the editor path: an edit must keep the file name (so
 * links and Obsidian bookmarks survive), archive the previous version, and
 * report `replaced` truthfully. Run with: node --test test/host.test.js
 */
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { apply } from '../lib/index.js'

/** Boot the plugin against a temp vault and hand back the model-facing tool. */
async function withVault(config, run) {
  const dir = await mkdtemp(join(tmpdir(), 'prompt-vault-test-'))
  let tool
  let route
  const ctx = {
    logger: { info() {}, error() {} },
    get(name) {
      if (name === 'tools') return { register(definition) { tool = definition; return () => {} } }
      if (name === 'webServer') return { register(value) { route = value; return () => {} } }
      return undefined
    },
    effect(fn) { fn() },
    inject(_services, fn) { fn() },
  }
  apply(ctx, { vaultDir: dir, historyLimit: 5, softDelete: true, ...config })
  try {
    await run({ dir, tool, route })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('editing an existing prompt keeps the file name and archives the old version', async () => {
  await withVault({}, async ({ dir, tool }) => {
    const created = await tool.execute({ action: 'save', title: '雨夜便利店', body: '原始正文', tags: ['生图'] })
    assert.match(created.text, /已保存/)

    const edited = await tool.execute({ action: 'save', id: '雨夜便利店', title: '雨夜便利店（改）', body: '改后的正文', tags: ['生图', '场景'] })
    assert.match(edited.text, /已更新/)

    const files = await readdir(dir)
    assert.deepEqual(files.filter((name) => name.endsWith('.md')), ['雨夜便利店.md'], 'file name must not change')

    const note = await readFile(join(dir, '雨夜便利店.md'), 'utf8')
    assert.match(note, /改后的正文/)
    assert.match(note, /场景/, 'new tag written')

    const history = await readdir(join(dir, '.history', '雨夜便利店'))
    assert.equal(history.length, 1, 'exactly one archived version')
    const previous = await readFile(join(dir, '.history', '雨夜便利店', history[0]), 'utf8')
    assert.match(previous, /原始正文/, 'the archived copy is the pre-edit text')
  })
})

test('save reports replaced=false when it creates a note', async () => {
  await withVault({}, async ({ tool }) => {
    const created = await tool.execute({ action: 'save', title: '新提示词', body: '正文' })
    assert.match(created.text, /已保存/, created.text)
  })
})

test('history respects the configured limit', async () => {
  await withVault({ historyLimit: 2 }, async ({ dir, tool }) => {
    await tool.execute({ action: 'save', title: '限量', body: 'v1' })
    for (const body of ['v2', 'v3', 'v4']) {
      await tool.execute({ action: 'save', id: '限量', title: '限量', body })
    }
    const history = await readdir(join(dir, '.history', '限量'))
    assert.equal(history.length, 2, 'only the newest two versions are kept')
  })
})

test('frontmatter added outside the plugin survives an edit', async () => {
  await withVault({}, async ({ dir, tool }) => {
    await writeFile(
      join(dir, '手写.md'),
      '---\ntitle: 手写\ntags: [外部]\naliases: [别名一, 别名二]\ncssclass: wide\n---\n旧正文\n',
      'utf8',
    )
    await tool.execute({ action: 'save', id: '手写', title: '手写', body: '新正文', tags: ['外部'] })
    const note = await readFile(join(dir, '手写.md'), 'utf8')
    assert.match(note, /aliases: \[别名一, 别名二\]/, 'unknown keys preserved')
    assert.match(note, /cssclass: wide/)
    assert.match(note, /新正文/)
  })
})

test('a body that looks like frontmatter round-trips unchanged', async () => {
  await withVault({}, async ({ tool }) => {
    const body = '---\n不是前置信息\n---\n第二段'
    await tool.execute({ action: 'save', title: '复杂正文', body })
    const got = await tool.execute({ action: 'get', id: '复杂正文' })
    assert.ok(got.text.includes(body), got.text)
  })
})

test('unsafe ids are refused', async () => {
  await withVault({}, async ({ tool }) => {
    for (const id of ['../evil', 'a/b', 'con', 'nul', 'x.']) {
      await assert.rejects(
        () => tool.execute({ action: 'save', id, title: 'x', body: 'y' }),
        /无效的提示词 id/,
        `id ${id} must be refused`,
      )
    }
  })
})

test('remove is recoverable', async () => {
  await withVault({}, async ({ dir, tool }) => {
    await tool.execute({ action: 'save', title: '待删', body: '正文' })
    const removed = await tool.execute({ action: 'remove', id: '待删' })
    assert.match(removed.text, /原文件保留在/)
    assert.equal((await readdir(dir)).filter((name) => name.endsWith('.md')).length, 0)
    const trash = await readdir(join(dir, '.trash'))
    assert.equal(trash.length, 1)
  })
})

test('empty bodies are refused', async () => {
  await withVault({}, async ({ tool }) => {
    await assert.rejects(() => tool.execute({ action: 'save', title: 'x', body: '   ' }), /正文不能为空/)
  })
})
