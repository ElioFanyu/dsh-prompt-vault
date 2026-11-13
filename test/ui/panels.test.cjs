// Render the open panel with rows and with the editor form, to check the two
// new features end to end at the markup level. Same stubs as client-smoke.cjs.
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { test } = require('node:test')

const bundle = path.join(__dirname, '..', '..', 'lib', 'client.js')
const source = fs.readFileSync(bundle, 'utf8')
let registration = null
const styleEls = []

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: 'Fragment',
  useRef: (v) => ({ current: v }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useSyncExternalStore: (subscribe, get) => get(),
}

const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        const api = entry.factory((name) => (name === 'react' ? fakeReact : { createPortal: (n) => n }))
        api.apply({
          effect: (fn) => fn(),
          locale: { register: () => () => {} },
          get: (name) =>
            name === 'locale'
              ? {
                  bind: () => (key, params) => {
                    const dict = {
                      'button.label': '提示词',
                      'button.title': '打开提示词库',
                      'panel.title': '提示词库',
                      'panel.search': '搜索提示词',
                      'panel.count': '共 {0} 条',
                      'panel.noSession': '先打开会话',
                      'panel.saving': '保存',
                      'panel.new': '新建',
                      'panel.saveDraft': '存草稿',
                      'panel.refresh': '刷新',
                      'panel.refreshTitle': '刷新',
                      'panel.newTitle': '新建',
                      'panel.saveDraftTitle': '存草稿',
                      'panel.searchSave': '保存',
                      'panel.searchSaveTitle': '保存',
                      'panel.searchHint': 'Ctrl+Enter 保存',
                      'panel.searchSaveRow': '把「{0}」保存为新提示词',
                      'panel.refine': '先改标题…',
                      'panel.refineTitle': '先改标题',
                      'panel.insert': '插入',
                      'panel.edit': '编辑',
                      'panel.editTitle': '编辑',
                      'panel.remove': '删除',
                      'panel.removeTitle': '删除',
                      'panel.confirmRemove': '确认删除',
                      'panel.vault': '库目录',
                      'panel.chars': '{0} 字符',
                      'panel.fieldTitle': '标题',
                      'panel.fieldTags': '标签',
                      'panel.fieldBody': '正文',
                      'panel.save': '保存',
                      'panel.cancel': '取消',
                      'panel.newLabel': '新建提示词',
                      'panel.editLabel': '编辑「{0}」',
                      'panel.keepId': '文件名保持不变：{0}.md',
                    }
                    const tpl = dict[key] || key
                    return params ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : tpl
                  },
                  subscribe: () => () => {},
                  getSnapshot: () => null,
                }
              : undefined,
          slots: {
            inject: (slot, fn) => fn(),
            register: (claim, component) => {
              registration = { claim, component }
              return () => {}
            },
          },
        })
      },
    },
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1440,
    innerHeight: 900,
  },
  document: {
    documentElement: { lang: 'zh-CN' },
    head: { appendChild: (el) => styleEls.push(el) },
    createElement: () => ({ dataset: {}, remove() {}, textContent: '' }),
    addEventListener() {},
    removeEventListener() {},
  },
  Node: class Node {},
  setTimeout,
  clearTimeout,
  fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true, items: [], vaultDir: 'C:/vault' }) }),
  console,
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

/* ---- state-driven render harness ---- */

const ITEMS = [
  { id: '雨夜便利店', title: '雨夜便利店', tags: ['生图', '场景'], description: '请制作一个雨夜便利店街角小场景', preview: '', chars: 484 },
  { id: '代码审查', title: '代码审查', tags: [], description: '请审查以下代码', preview: '', chars: 120 },
]
const FORM = { id: '雨夜便利店', title: '雨夜便利店', tags: '生图, 场景', body: '第一行\n第二行' }

/** Hook order in PromptVault: open, query, status, items, vaultDir, error,
 *  toast, geo, armed, view, editor, busy. */
function render({ open = true, query = '', view = 'list', editor = null, items = ITEMS, armed = '' }) {
  const overrides = { open, query, items, view, editor, armed }
  const queue = [
    ['open', open],
    ['query', query],
    ['status', 'ready'],
    ['items', items],
    ['vaultDir', 'C:/vault'],
    ['error', ''],
    ['toast', ''],
    ['geo', { left: 20, bottom: 120, width: 420, maxHeight: 520 }],
    ['armed', armed],
    ['view', view],
    ['editor', editor],
    ['busy', false],
  ]
  let index = 0
  const saved = fakeReact.useState
  fakeReact.useState = (initial) => {
    const value = typeof initial === 'function' ? initial() : initial
    const slot = queue[index]
    index += 1
    if (slot === undefined) return [value, () => {}]
    return [slot[1], () => {}]
  }
  const tree = expand(
    registration.component({
      sessionId: 's1',
      inputActions: { captureInsertion: () => ({ start: 0, draftRev: 1 }), insertText: () => true, setDraft: () => {} },
      useInput: () => '',
      origin: '',
    }),
    90,
  )
  fakeReact.useState = saved
  return tree
}

function expand(node, budget) {
  if (budget <= 0) return { type: '(budget)' }
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((child) => expand(child, budget - 1))
  if (typeof node.type === 'function') return expand(node.type(node.props || {}), budget - 1)
  return { ...node, children: (node.children || []).map((child) => expand(child, budget - 1)) }
}

const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((c) => walk(c, visit)); return }
  visit(node)
  ;(node.children || []).forEach((c) => walk(c, visit))
}
const textOf = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}
const findAll = (tree, type, cls) => {
  const hits = []
  walk(tree, (node) => {
    if (node.type !== type) return
    if (cls && !String(node.props.className || '').split(/\s+/).includes(cls)) return
    hits.push(node)
  })
  return hits
}

/** Assert a condition with the label as the failure message. */
const check = (label, condition, detail) => {
  assert.ok(condition, detail === undefined ? label : `${label} — ${detail}`)
}

test('list view: search box doubles as a paste box', () => {
  const tree = render({ query: '粘贴的提示词\n第二行内容' })
  const areas = findAll(tree, 'textarea')
  check('one textarea (search/paste box)', areas.length === 1, String(areas.length))
  check('search box keeps the newline', areas[0].props.value.includes('\n'))
  const editBtns = findAll(tree, 'button', 'pv-icon').filter((n) => n.props['aria-label'] === '编辑')
  check('one edit button per row', editBtns.length === 2, String(editBtns.length))
  const saveRow = findAll(tree, 'button', 'pv-saverow')
  check('save-as-new row offered', saveRow.length === 2, String(saveRow.length))
  check('save row shows the prompt prefix', /＋ /.test(textOf(saveRow[0])))
  const refine = findAll(tree, 'button', 'pv-saverow-aside')
  check('refine-aside button offered', refine.length === 1)
  const searchSave = findAll(tree, 'button', 'pv-searchbtn')
  check('header save button enabled with text', searchSave[0].props.disabled === false)
})

test('list view: empty box offers no save row', () => {
  const tree = render({ query: '' })
  const saveRow = findAll(tree, 'button', 'pv-saverow')
  check('no save-as-new row when box is empty', saveRow.length === 0, String(saveRow.length))
  const searchSave = findAll(tree, 'button', 'pv-searchbtn')
  check('header save button disabled when empty', searchSave[0].props.disabled === true)
})

test('editor: existing prompt prefills and keeps its file name', () => {
  const tree = render({ view: 'edit', editor: FORM, query: '' })
  const inputs = findAll(tree, 'input')
  check('two text inputs (title, tags)', inputs.length === 2, String(inputs.length))
  check('title prefilled', inputs[0].props.value === '雨夜便利店')
  check('tags prefilled', inputs[1].props.value === '生图, 场景')
  const body = findAll(tree, 'textarea', 'pv-area-body')
  check('body textarea prefilled with both lines', body.length === 1 && body[0].props.value.includes('\n'))
  const ids = inputs.map((n) => n.props.id)
  check('inputs carry ids for label association', ids.join(',') === 'pv-title,pv-tags', ids.join(','))
  const hint = findAll(tree, 'div', 'pv-editor-hint')
  check('keep-id hint shown for an existing prompt', hint.length === 1 && /雨夜便利店\.md/.test(textOf(hint[0])))
  const header = findAll(tree, 'span', 'pv-title')
  check('header switches to the edit label', /编辑「雨夜便利店」/.test(textOf(header[0])), textOf(header[0]))
  check('search box hidden while editing', findAll(tree, 'textarea', 'pv-searcharea').length === 0)
  const saveBtn = findAll(tree, 'button', 'pv-mini-primary')
  check('primary save button present and enabled', saveBtn.length === 1 && saveBtn[0].props.disabled === false)
  const headerLabels = findAll(tree, 'button', 'pv-mini').map((n) => textOf(n))
  check(
    'new/save-draft hidden while editing (they would discard the form)',
    !headerLabels.includes('新建') && !headerLabels.includes('存草稿'),
    headerLabels.join('|'),
  )
})

test('editor: new prompt has no keep-id hint and blocks empty saves', () => {
  const tree = render({ view: 'edit', editor: { id: null, title: '', tags: '', body: '' } })
  const run = findAll(tree, 'button', 'pv-mini-primary')
  check('save disabled until there is a body', run[0].props.disabled === true)
  check('no keep-id hint for a new prompt', findAll(tree, 'div', 'pv-editor-hint').length === 0)
  const header = findAll(tree, 'span', 'pv-title')
  check('header says 新建提示词', /新建提示词/.test(textOf(header[0])), textOf(header[0]))
})

test('delete needs a second click', () => {
  const tree = render({ armed: '雨夜便利店' })
  const danger = findAll(tree, 'button', 'pv-icon-danger')
  const armedOne = danger.filter((n) => n.props['data-armed'] === 'true')
  check('exactly one row is armed', armedOne.length === 1, String(armedOne.length))
  check('armed row shows a confirm label', /确认删除/.test(textOf(armedOne[0])))
})

test('the portal declares its own macOS window-drag exclusion', () => {
  // DSH 0.2.2-rc.1 stopped granting interactive controls an automatic no-drag
  // exclusion on macOS. A body portal that can cover the draggable header must
  // declare its own region, or its controls drag the window instead of working.
  const tree = render({ query: 'abc' })
  const panels = findAll(tree, 'div', 'pv-panel')
  check('the panel element is rendered', panels.length === 1, String(panels.length))
  check('the exclusion sits on the visible box', panels[0].props['data-window-drag-exclude'] === true)
  const nested = []
  walk(panels[0], (node) => {
    if (node.props && node.props['data-window-drag-exclude'] !== undefined) nested.push(node.type)
  })
  check('it is declared once, not per descendant', nested.length === 1, nested.join(','))
})

test('every rendered class has a style rule', () => {
  const css = styleEls[0].textContent
  const defined = new Set([...css.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]))
  const used = new Set()
  for (const tree of [
    render({}),
    render({ query: 'abc' }),
    render({ view: 'edit', editor: FORM }),
    render({ view: 'edit', editor: { id: null, title: '', tags: '', body: '' } }),
  ]) {
    walk(tree, (node) => {
      const cls = node.props && node.props.className
      if (typeof cls !== 'string') return
      cls.split(/\s+/).filter(Boolean).forEach((c) => used.add(c))
    })
  }
  const unstyled = [...used].filter((c) => !defined.has(c)).sort()
  check('all ' + used.size + ' classes styled', unstyled.length === 0, unstyled.join(', '))
})


