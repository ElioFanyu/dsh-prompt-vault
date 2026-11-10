/**
 * Prompt vault — Host half.
 *
 * Prompts are plain Markdown notes with YAML frontmatter, stored in one plain
 * directory. That choice is the whole design: the same folder works as an
 * Obsidian vault subfolder, as a Git-tracked notes folder, and as something the
 * user can open in any editor, so a saved prompt is never trapped inside this
 * application.
 *
 * Three surfaces share one store, so none of them can drift from the others:
 *
 *   - `prompt_vault`  the model-facing tool (save a prompt it just wrote, read
 *                     one back, import a text file from disk)
 *   - `/dsh-prompt-vault/*`  the HTTP channel the composer panel talks to
 *   - the panel itself, which lives in the Client half
 *
 * Writes are atomic (temp file + rename) and edits keep a bounded history under
 * `<vault>/.history`, because a prompt library is the kind of file people edit
 * in place and expect not to lose.
 *
 * @module @local/dsh-prompt-vault
 */

import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'

/** Stable plugin name; must match the row inserted by `cordis.patch.yml`. */
export const name = 'dsh-prompt-vault'

/** Both host capabilities are optional: a profile without them still loads. */
export const inject = []

/** HTTP prefix owned by this plugin. */
const ROUTE_PREFIX = '/dsh-prompt-vault'

/** Directory (inside the vault) holding previous versions of edited prompts. */
const HISTORY_DIR = '.history'

/** Directory (inside the vault) receiving removed prompts. */
const TRASH_DIR = '.trash'

/** Files this plugin never lists, even if they sit in the vault directory. */
const SKIP_DIRS = new Set([HISTORY_DIR, TRASH_DIR])

/** Default configuration, merged under whatever the patch row declares. */
const DEFAULTS = {
  vaultDir: '',
  maxFileBytes: 262144,
  historyLimit: 20,
  softDelete: true,
}

/**
 * Resolve the DSH home directory the same way the runtime does, so the default
 * vault lives beside the rest of this profile's data.
 */
function dshHome() {
  const declared = process.env.DSH_HOME
  if (typeof declared === 'string' && declared.trim() !== '') return resolve(declared)
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.trim() !== '') {
    // <home>/profiles/<name>
    return resolve(profileDir, '..', '..')
  }
  return join(homedir(), '.dsh')
}

/** Merge the patch row's config over the defaults, ignoring wrong types. */
function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '')
  const number = (key, fallback) => {
    const value = source[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
  }
  return {
    vaultDir: text('vaultDir') === '' ? join(dshHome(), 'prompt-vault') : resolve(text('vaultDir')),
    maxFileBytes: Math.max(4096, number('maxFileBytes', DEFAULTS.maxFileBytes)),
    historyLimit: number('historyLimit', DEFAULTS.historyLimit),
    softDelete: typeof source.softDelete === 'boolean' ? source.softDelete : DEFAULTS.softDelete,
  }
}

/* ---------------------------------------------------------------------- *
 * Frontmatter: a deliberately small YAML subset.
 *
 * Prompt notes must survive a round trip through Obsidian and back, so only
 * the fields this plugin owns are parsed and everything else is preserved
 * verbatim in `extra` — an Obsidian property the user added by hand is not
 * thrown away because this parser did not know it.
 * ---------------------------------------------------------------------- */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Keys this plugin reads; every other key is preserved untouched. */
const OWNED_KEYS = new Set(['title', 'tags', 'created', 'updated', 'description'])

/** Split a note into parsed `---` frontmatter and body text. */
function parseNote(text) {
  const source = text.replace(/^\uFEFF/, '')
  const match = FRONTMATTER.exec(source)
  if (match === null) return { meta: {}, body: source, raw: '' }
  const raw = match[1]
  const meta = { extra: {} }
  for (const line of raw.split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (pair === null) continue
    const key = pair[1]
    const value = pair[2].trim()
    let parsed
    if (value.startsWith('[') && value.endsWith(']')) {
      parsed = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter((item) => item !== '')
    } else if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      // The writer emits JSON string literals, so decode them the same way.
      try {
        parsed = JSON.parse(value)
      } catch {
        parsed = value.slice(1, -1)
      }
    } else {
      parsed = value.replace(/^['"]|['"]$/g, '')
    }
    if (OWNED_KEYS.has(key)) meta[key] = parsed
    else meta.extra[key] = parsed
  }
  return { meta, body: source.slice(match[0].length), raw }
}

/** One frontmatter line, quoting only when the value needs it. */
function yamlScalar(value) {
  const text = String(value)
  if (text === '') return '""'
  if (/^[A-Za-z0-9\u4e00-\u9fff][^:#\n]*$/.test(text) && !/^\s|\s$/.test(text)) return text
  return JSON.stringify(text)
}

/** Serialize frontmatter + body back into a note. */
function writeNote(meta, body) {
  const lines = ['---']
  lines.push(`title: ${yamlScalar(meta.title || '')}`)
  if (Array.isArray(meta.tags) && meta.tags.length > 0) {
    lines.push(`tags: [${meta.tags.map((tag) => yamlScalar(tag)).join(', ')}]`)
  }
  lines.push(`created: ${yamlScalar(meta.created || '')}`)
  lines.push(`updated: ${yamlScalar(meta.updated || '')}`)
  if (typeof meta.description === 'string' && meta.description !== '') {
    lines.push(`description: ${yamlScalar(meta.description)}`)
  }
  for (const [key, value] of Object.entries(meta.extra || {})) {
    if (['title', 'tags', 'created', 'updated', 'description'].includes(key)) continue
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((item) => yamlScalar(item)).join(', ')}]`)
    } else if (value !== undefined && value !== null) {
      lines.push(`${key}: ${yamlScalar(value)}`)
    }
  }
  lines.push('---', '')
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/^\n+/, '')
  return lines.join('\n') + text + (text.endsWith('\n') ? '' : '\n')
}

/** Windows device names cannot be file names, whatever the extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/** A filesystem-safe file base name derived from a prompt title. */
function slugOf(title) {
  const cleaned = String(title || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 60)
    .replace(/[. ]+$/, '')
  if (cleaned === '') return `prompt-${Date.now().toString(36)}`
  return RESERVED.test(cleaned) ? `${cleaned}-prompt` : cleaned
}

/** Reject ids that could escape the vault directory or name a device. */
function safeId(id) {
  if (typeof id !== 'string' || id === '') return null
  if (id.includes('/') || id.includes('\\') || id.includes('..')) return null
  if (/[. ]$/.test(id)) return null
  if (RESERVED.test(id)) return null
  return id
}

/** Trim a body to a one-line preview for the panel list. */
function previewOf(body) {
  const line = String(body || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item !== '')
  const text = (line || '').replace(/\s+/g, ' ')
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

/** ISO timestamp for frontmatter and archive names; filename-safe. */
function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

/* ---------------------------------------------------------------------- *
 * The store.
 * ---------------------------------------------------------------------- */

class PromptStore {
  constructor(config, log) {
    this.config = config
    this.log = log
    this.queue = Promise.resolve()
  }

  get root() {
    return this.config.vaultDir
  }

  /** Run one filesystem operation at a time so two saves cannot interleave. */
  serialize(operation) {
    const run = this.queue.then(operation, operation)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async ensureRoot() {
    await mkdir(this.root, { recursive: true })
  }

  /** Absolute path of one note, or null when the id is not safe. */
  pathOf(id) {
    const safe = safeId(id)
    return safe === null ? null : join(this.root, `${safe}.md`)
  }

  async readNote(id) {
    const path = this.pathOf(id)
    if (path === null) throw new Error(`无效的提示词 id：${String(id)}`)
    const info = await stat(path).catch(() => null)
    if (info === null) throw new Error(`找不到提示词「${id}」`)
    if (info.size > this.config.maxFileBytes) {
      throw new Error(`提示词「${id}」超过 ${this.config.maxFileBytes} 字节，已跳过`)
    }
    const text = await readFile(path, 'utf8')
    const parsed = parseNote(text)
    const body = parsed.body.replace(/^\n+/, '').replace(/\s+$/, '')
    return {
      id,
      title: typeof parsed.meta.title === 'string' && parsed.meta.title !== '' ? parsed.meta.title : id,
      tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
      created: typeof parsed.meta.created === 'string' ? parsed.meta.created : '',
      updated: typeof parsed.meta.updated === 'string' ? parsed.meta.updated : '',
      description: typeof parsed.meta.description === 'string' ? parsed.meta.description : '',
      body,
      chars: body.length,
      path,
    }
  }

  /** Every note in the vault directory, newest edit first. */
  async list() {
    await this.ensureRoot()
    const entries = await readdir(this.root, { withFileTypes: true })
    const items = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (SKIP_DIRS.has(entry.name)) continue
      if (extname(entry.name).toLowerCase() !== '.md') continue
      const id = basename(entry.name, extname(entry.name))
      try {
        const note = await this.readNote(id)
        items.push({
          id: note.id,
          title: note.title,
          tags: note.tags,
          created: note.created,
          updated: note.updated,
          description: note.description,
          preview: previewOf(note.body),
          chars: note.chars,
          path: note.path,
        })
      } catch (error) {
        this.log(`跳过 ${entry.name}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    items.sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)) || a.title.localeCompare(b.title))
    return items
  }

  /** An id that no existing note uses, preferring the slug derived from the title. */
  async freeId(title) {
    const entries = await readdir(this.root).catch(() => [])
    const taken = new Set(entries.map((entry) => String(entry).toLowerCase()))
    const base = slugOf(title)
    if (!taken.has(`${base}.md`.toLowerCase())) return base
    for (let index = 2; index < 500; index += 1) {
      const candidate = `${base} ${index}`
      if (!taken.has(`${candidate}.md`.toLowerCase())) return candidate
    }
    return `${base} ${Date.now().toString(36)}`
  }

  /** Copy the current note into `.history` before an edit replaces it. */
  async archive(id, text) {
    if (this.config.historyLimit <= 0) return
    const dir = join(this.root, HISTORY_DIR, id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${stamp()}.md`), text, 'utf8')
    const kept = (await readdir(dir)).filter((entry) => entry.endsWith('.md')).sort()
    for (const stale of kept.slice(0, Math.max(0, kept.length - this.config.historyLimit))) {
      await unlink(join(dir, stale)).catch(() => undefined)
    }
  }

  /** Write one note atomically, so a crash cannot leave a half-written prompt. */
  async write(path, text) {
    const temp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`
    await writeFile(temp, text, 'utf8')
    try {
      await rename(temp, path)
    } catch (error) {
      await unlink(temp).catch(() => undefined)
      throw error
    }
  }

  /**
   * Create or update one prompt.
   *
   * `id` is optional: without it a new note is created under the slug of the
   * title. With it, the existing note is edited in place and its previous text
   * is archived first.
   */
  async save({ id, title, body, tags }) {
    await this.ensureRoot()
    const text = String(body ?? '')
    if (text.trim() === '') throw new Error('提示词正文不能为空')
    const cleanTitle = String(title ?? '').trim() || previewOf(text).slice(0, 40) || '未命名提示词'
    const cleanTags = (Array.isArray(tags) ? tags : [])
      .map((tag) => String(tag).trim())
      .filter((tag) => tag !== '')
      .slice(0, 20)
    const now = new Date().toISOString()
    const target = id === undefined || id === null || id === '' ? await this.freeId(cleanTitle) : safeId(id)
    if (target === null) throw new Error(`无效的提示词 id：${String(id)}`)
    const path = this.pathOf(target)
    let created = now
    let extra = {}
    let previous = null
    const existing = await readFile(path, 'utf8').catch(() => null)
    if (existing !== null) {
      previous = existing
      const parsed = parseNote(existing)
      if (typeof parsed.meta.created === 'string' && parsed.meta.created !== '') created = parsed.meta.created
      extra = parsed.meta.extra || {}
    }
    const note = writeNote(
      {
        title: cleanTitle,
        tags: cleanTags,
        created,
        updated: now,
        description: previewOf(text).slice(0, 120),
        extra,
      },
      text,
    )
    if (previous !== null) await this.archive(target, previous)
    await this.write(path, note)
    return { id: target, title: cleanTitle, tags: cleanTags, created, updated: now, chars: text.length, path, replaced: previous !== null }
  }

  /** Remove one prompt, keeping a recoverable copy unless soft delete is off. */
  async remove(id) {
    const path = this.pathOf(id)
    if (path === null) throw new Error(`无效的提示词 id：${String(id)}`)
    const existing = await readFile(path, 'utf8').catch(() => null)
    if (existing === null) throw new Error(`找不到提示词「${id}」`)
    if (!this.config.softDelete) {
      await unlink(path)
      return { id, deleted: 'permanent', keptAt: null }
    }
    const dir = join(this.root, TRASH_DIR)
    await mkdir(dir, { recursive: true })
    const keptAt = join(dir, `${safeId(id)}.${stamp()}.md`)
    await rename(path, keptAt)
    return { id, deleted: 'moved', keptAt }
  }

  /** Import a plain text or Markdown file from disk as a new prompt. */
  async importFile(filePath, title) {
    const absolute = resolve(String(filePath ?? ''))
    const info = await stat(absolute).catch(() => null)
    if (info === null || !info.isFile()) throw new Error(`找不到文件：${absolute}`)
    if (info.size > this.config.maxFileBytes) {
      throw new Error(`文件超过 ${this.config.maxFileBytes} 字节：${absolute}`)
    }
    const raw = await readFile(absolute, 'utf8')
    const parsed = parseNote(raw.replace(/^\uFEFF/, ''))
    // A Markdown note with frontmatter imports its body; a bare .txt imports whole.
    const body = parsed.body.trim() === '' ? raw : parsed.body
    const record = await this.save({
      title: String(title ?? '').trim() || parsed.meta.title || basename(absolute, extname(absolute)),
      body,
      tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
    })
    return { ...record, source: absolute }
  }

  /** Vault state for the panel header. */
  async status() {
    await this.ensureRoot()
    const items = await this.list().catch(() => [])
    return {
      vaultDir: this.root,
      promptCount: items.length,
      historyLimit: this.config.historyLimit,
      softDelete: this.config.softDelete,
      maxFileBytes: this.config.maxFileBytes,
    }
  }
}

/* ---------------------------------------------------------------------- *
 * HTTP channel for the composer panel.
 * ---------------------------------------------------------------------- */

/** Reject writes that did not come from this machine. */
function isLoopback(address) {
  if (typeof address !== 'string') return false
  const value = address.replace(/^::ffff:/, '')
  return value === '127.0.0.1' || value === '::1' || value === 'localhost'
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req, maxBytes = 1048576) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > maxBytes) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

/** Turn a thrown value into a stable, user-readable message. */
function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

/* ---------------------------------------------------------------------- *
 * Tool schema shared by the route and the model tool.
 * ---------------------------------------------------------------------- */

const TOOL_ACTIONS = ['list', 'get', 'save', 'remove', 'import', 'where']

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: TOOL_ACTIONS,
      description:
        'list 列出全部提示词；get 读取一条的完整正文；save 新建或覆盖一条；remove 删除一条；import 把磁盘上的文本文件导入为提示词；where 返回库目录与统计。',
    },
    id: { type: 'string', description: '提示词 id（文件名，不带 .md）。save 时省略表示新建。' },
    title: { type: 'string', description: '标题；save 时省略会从正文首行推断，import 时省略会用文件名。' },
    body: { type: 'string', description: '提示词正文（save 必填）。' },
    tags: { type: 'array', items: { type: 'string' }, description: '标签，用于在库里筛选。' },
    path: { type: 'string', description: 'import 时磁盘文件的绝对路径，例如 C:/Users/me/Desktop/提示词.txt。' },
  },
  required: ['action'],
  additionalProperties: false,
}

/* ---------------------------------------------------------------------- *
 * Plugin entry.
 * ---------------------------------------------------------------------- */

export function apply(ctx, config) {
  const log = (message) => {
    try {
      ctx.logger?.info?.(message)
    } catch {
      /* logging must never break a prompt write */
    }
  }
  const store = new PromptStore(normalizeConfig(config), log)

  /** Run a store call and shape the result for both callers. */
  const runAction = async (request) => {
    const action = String(request?.action ?? '')
    switch (action) {
      case 'list': {
        const items = await store.list()
        return { action, items, vaultDir: store.root }
      }
      case 'get': {
        const note = await store.readNote(request.id)
        return { action, prompt: note }
      }
      case 'save': {
        const saved = await store.save({ id: request.id, title: request.title, body: request.body, tags: request.tags })
        return { action, prompt: saved }
      }
      case 'remove': {
        const removed = await store.remove(request.id)
        return { action, removed }
      }
      case 'import': {
        const imported = await store.importFile(request.path, request.title)
        return { action, prompt: imported }
      }
      case 'where': {
        return { action, ...(await store.status()) }
      }
      default:
        throw new Error(`未知操作：${action === '' ? '(空)' : action}`)
    }
  }

  /* ---- HTTP channel used by the composer panel ---- */

  const registerRoute = () => {
    const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (webServer === undefined || typeof webServer.register !== 'function') {
      log('dsh-prompt-vault: 当前部署没有 webServer，面板通道不可用')
      return undefined
    }
    return webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const action = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, '')
        const method = req.method ?? 'GET'
        try {
          if (method === 'GET' && action === 'list') {
            sendJson(res, 200, { ok: true, ...(await store.status()), items: await store.list() })
            return
          }
          if (method === 'GET' && action === 'config') {
            sendJson(res, 200, { ok: true, ...(await store.status()) })
            return
          }
          if (method === 'GET' && action === 'get') {
            const id = url.searchParams.get('id') ?? ''
            sendJson(res, 200, { ok: true, prompt: await store.readNote(id) })
            return
          }
          if (method !== 'POST') {
            sendJson(res, 405, { ok: false, error: '方法不允许' })
            return
          }
          if (!isLoopback(req.socket?.remoteAddress)) {
            sendJson(res, 403, { ok: false, error: '仅允许本机访问' })
            return
          }
          if (action === 'save') {
            const body = await readJsonBody(req)
            sendJson(res, 200, { ok: true, prompt: await store.save(body) })
            return
          }
          if (action === 'remove') {
            const body = await readJsonBody(req)
            sendJson(res, 200, { ok: true, removed: await store.remove(body.id) })
            return
          }
          if (action === 'import') {
            const body = await readJsonBody(req)
            sendJson(res, 200, { ok: true, prompt: await store.importFile(body.path, body.title) })
            return
          }
          sendJson(res, 404, { ok: false, error: `未知操作：${action}` })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: errorText(error) })
        }
      },
    })
  }

  /* ---- model-facing tool ---- */

  const registerTool = () => {
    const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
    if (tools === undefined || typeof tools.register !== 'function') {
      log('dsh-prompt-vault: 当前部署没有 tools 服务，prompt_vault 工具不可用')
      return undefined
    }
    return tools.register({
      name: 'prompt_vault',
      description:
        '读写本机的提示词库（默认 <DSH_HOME>/prompt-vault，也可以指向 Obsidian 库里的一个文件夹）。每条提示词是一个带 frontmatter 的 .md 文件，可以和 Obsidian、Git、任何文本编辑器共存。用户给你一段想复用的提示词、或让你把它存下来时用 save；要用之前存过的提示词时用 list/get；用户给了一个磁盘上的提示词文件时用 import 导入（不要先读全文再复制粘贴）。',
      parameters: TOOL_SCHEMA,
      output: {
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            action: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
      },
      async execute(args) {
        const result = await runAction(args)
        if (result.action === 'list') {
          const lines = result.items.map((item) => `- ${item.title}（${item.id}）${item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : ''} — ${item.preview}`)
          const text = result.items.length === 0
            ? `提示词库是空的：${result.vaultDir}`
            : `提示词库：${result.vaultDir}\n共 ${result.items.length} 条：\n${lines.join('\n')}`
          return { action: 'list', text }
        }
        if (result.action === 'get') {
          const note = result.prompt
          return {
            action: 'get',
            text: `# ${note.title}\nid: ${note.id}\n标签: ${note.tags.join(', ') || '(无)'}\n文件: ${note.path}\n\n${note.body}`,
          }
        }
        if (result.action === 'save') {
          return {
            action: 'save',
            text: `${result.prompt.replaced ? '已更新' : '已保存'}提示词「${result.prompt.title}」（id: ${result.prompt.id}，${result.prompt.chars} 字符）\n文件: ${result.prompt.path}`,
          }
        }
        if (result.action === 'import') {
          return {
            action: 'import',
            text: `已从 ${result.prompt.source} 导入提示词「${result.prompt.title}」（id: ${result.prompt.id}，${result.prompt.chars} 字符）\n文件: ${result.prompt.path}`,
          }
        }
        if (result.action === 'remove') {
          return {
            action: 'remove',
            text: result.removed.deleted === 'moved'
              ? `已删除「${result.removed.id}」，原文件保留在 ${result.removed.keptAt}`
              : `已永久删除「${result.removed.id}」`,
          }
        }
        return {
          action: 'where',
          text: `提示词库目录：${result.vaultDir}\n共 ${result.promptCount} 条；历史版本上限 ${result.historyLimit}；软删除${result.softDelete ? '开启' : '关闭'}`,
        }
      },
    })
  }

  /* ---- graceful registration: either capability may arrive later ---- */

  const later = (services, label, run) => {
    try {
      if (typeof ctx.inject === 'function') {
        ctx.inject(services, () => {
          try {
            const disposer = run()
            if (disposer !== undefined) ctx.effect(() => disposer, label)
          } catch (error) {
            ctx.logger?.error?.(error)
          }
        })
        return
      }
    } catch (error) {
      ctx.logger?.error?.(error)
    }
    try {
      const disposer = run()
      if (disposer !== undefined) ctx.effect(() => disposer, label)
    } catch (error) {
      ctx.logger?.error?.(error)
    }
  }

  later(['webServer'], 'dsh-prompt-vault: routes', registerRoute)
  later(['tools'], 'dsh-prompt-vault: tool', registerTool)
  log(`dsh-prompt-vault: 提示词库位于 ${store.root}`)
}
