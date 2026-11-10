// Load the Client half the way the browser does, with stubbed React/DOM, to
// catch top-level errors and verify the slot registration + first render.
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { test } = require('node:test')

// Resolved from this file, not from the shell's cwd, so the test runs from
// anywhere and after the checkout moves.
const bundle = path.join(__dirname, '..', '..', 'lib', 'client.js')
const source = fs.readFileSync(bundle, 'utf8')

let registration = null
const styleEls = []
let appliedInject = null

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: 'Fragment',
  useRef: (v) => ({ current: v }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  // The open-panel render needs a real setter to drive `open`, so the harness
  // patches useState per-render below.
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useSyncExternalStore: (subscribe, get) => get(),
}
const fakeReactDOM = { createPortal: (node) => node }

const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        if (entry.id !== '@local/dsh-prompt-vault') throw new Error('bad id: ' + entry.id)
        const api = entry.factory((name) => {
          if (name === 'react') return fakeReact
          if (name === 'react-dom') return fakeReactDOM
          throw new Error('unexpected require: ' + name)
        })
        if (typeof api.apply !== 'function') throw new Error('no apply')
        const ctx = {
          effect(fn) { return fn() },
          locale: {
            register(ns, dicts) {
              if (!dicts.zh['button.label'] || !dicts.en['button.label']) throw new Error('dicts incomplete')
              return () => {}
            },
          },
          get(name) {
            if (name === 'locale') {
              return {
                bind: () => (key, params) => {
                  const dict = {
                    'button.label': '提示词',
                    'button.title': '打开提示词库',
                    'panel.title': '提示词库',
                    'panel.search': '搜索提示词',
                    'panel.count': '共 {0} 条',
                    'panel.noSession': '先打开一个会话',
                  }
                  const tpl = dict[key] || key
                  return params ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : tpl
                },
                subscribe: () => () => {},
                getSnapshot: () => null,
              }
            }
            return undefined
          },
          slots: {
            inject(slot, fn) { fn(); return () => {} },
            register(claim, component) {
              registration = { claim, component }
              return () => {}
            },
          },
        }
        appliedInject = api.inject
        api.apply(ctx)
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
  fetch: () => Promise.reject(new Error('no network in smoke test')),
  console,
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

test('the bundle registers as a composer-toolbar entry', () => {
  assert.deepEqual([...appliedInject].sort(), ['locale', 'slots'])
  assert.equal(registration.claim.name, 'conversation.input.left')
  assert.equal(registration.claim.id, 'dsh-prompt-vault')
  assert.equal(typeof registration.claim.order, 'number')
  assert.equal(styleEls.length, 1, 'exactly one stylesheet is installed')
  assert.ok(styleEls[0].textContent.length > 1000, 'stylesheet has content')
})

// Expand function components until we reach host elements ('div', 'button', ...).
const host = (node) => typeof node === 'object' && node.type !== undefined && typeof node.type === 'string'
const expand = (node, budget) => {
  if (budget <= 0) return { type: '(budget)' }
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((child) => expand(child, budget - 1))
  if (typeof node.type === 'function') return expand(node.type(node.props || {}), budget - 1)
  return { ...node, children: (node.children || []).map((child) => expand(child, budget - 1)) }
}
const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  visit(node)
  ;(node.children || []).forEach((child) => walk(child, visit))
}
const textOf = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

const props = {
  sessionId: 's1',
  inputActions: {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }),
    insertText: () => true,
    setDraft: () => {},
  },
  useInput: () => '',
  origin: '',
}

// --- second pass: render with the panel OPEN -------------------------------
// Re-run the component with an initial-state override so the portal content is
// expanded too; that is where the search box, rows and form live.
const originalUseState = fakeReact.useState
fakeReact.useState = (initial) => {
  const value = typeof initial === 'function' ? initial() : initial
  const first = fakeReact.__firstState
  if (first === undefined) return [value, () => {}]
  // Force the first state hook (open) to true, and let `view` be overridable.
  fakeReact.__stateIndex = (fakeReact.__stateIndex || 0) + 1
  if (fakeReact.__stateIndex === 1) return [true, () => {}]
  if (fakeReact.__stateIndex === 2) return [fakeReact.__query ?? value, () => {}]
  return [value, () => {}]
}
const panelProps = { ...props }
fakeReact.__firstState = true
fakeReact.__query = '粘贴进来的提示词第一行\n第二行'
fakeReact.__stateIndex = 0
const openTree = expand(registration.component(panelProps), 80)
fakeReact.useState = originalUseState
fakeReact.__firstState = undefined

test('the open panel renders a search/paste box and styled controls', () => {
  let textareas = 0
  const classes = new Set()
  walk(openTree, (node) => {
    if (node.type === 'textarea') textareas += 1
    if (typeof node.props.className === 'string') {
      node.props.className.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c))
    }
  })
  assert.ok(textareas >= 1, 'the search box is a textarea so pasted prompts keep newlines')

  // A class with no style rule renders an unstyled control, which no syntax
  // check can catch, so the markup and the stylesheet are compared directly.
  const defined = new Set([...styleEls[0].textContent.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]))
  const missing = [...classes].filter((c) => !defined.has(c))
  assert.deepEqual(missing, [], 'every rendered class has a style rule')
})

test('the closed panel renders only the trigger button', () => {
  const tree = expand(registration.component(props), 60)
  assert.ok(host(tree), 'root renders a host element')
  assert.equal(tree.type, 'div')
  assert.match(tree.props.className, /pv-root/)
  assert.equal(tree.children.length, 2)
  assert.equal(tree.children[1], null, 'no portal while the panel is closed')

  const trigger = tree.children[0]
  assert.equal(trigger.type, 'button')
  assert.match(trigger.props.className, /pv-button/)
  assert.equal(trigger.props['aria-haspopup'], 'dialog')
  assert.equal(trigger.props['aria-expanded'], false)
  assert.match(textOf(trigger), /提示词/)
})
