/**
 * Prompt vault — Client half.
 *
 * One control in the composer tool row opens a panel listing every saved
 * prompt. Clicking a row types the prompt into the draft, so a prompt written
 * once can be reused in any session.
 *
 * Two ways to write into the vault, both starting from where the text already
 * is:
 *
 *   - the search box doubles as an input box: paste a prompt, hit save, and it
 *     becomes a note (this is the fastest path for "I have this text, keep it")
 *   - the editor opens for a new prompt or an existing one, with title, tags
 *     and body in one form; editing an existing prompt keeps its file name so
 *     links and bookmarks stay valid
 *
 * The panel talks to the Host half over `/dsh-prompt-vault/*`; it never touches
 * the filesystem itself, so the store has exactly one writer.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-vault',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const NS = 'dsh-prompt-vault'
    const ROUTE_PREFIX = '/dsh-prompt-vault'

    const zh = {
      'button.label': '提示词',
      'button.title': '打开提示词库：保存、编辑、复用已存好的提示词',
      'panel.title': '提示词库',
      'panel.search': '搜索提示词；也可以直接粘贴提示词，再点右侧的保存',
      'panel.searchHint': 'Ctrl+Enter 保存',
      'panel.empty': '还没有保存任何提示词',
      'panel.emptyHint': '把提示词粘贴到上面的框里，点右侧「保存」即可；在输入框写好内容后点「存草稿」也行。',
      'panel.noMatch': '没有匹配的提示词',
      'panel.loading': '正在读取提示词库…',
      'panel.error': '读取提示词库失败',
      'panel.retry': '重试',
      'panel.count': '共 {0} 条',
      'panel.refresh': '刷新',
      'panel.refreshTitle': '重新读取库目录（外部新增或修改的文件会立刻出现）',
      'panel.insert': '点击插入到输入框',
      'panel.edit': '编辑',
      'panel.editTitle': '编辑这条提示词的标题、标签和正文',
      'panel.remove': '删除',
      'panel.removeTitle': '删除这条提示词（默认移到 .trash 可找回）',
      'panel.confirmRemove': '确认删除',
      'panel.saveDraft': '存草稿',
      'panel.saveDraftTitle': '把输入框里的内容存成一条提示词',
      'panel.searchSave': '保存',
      'panel.searchSaveTitle': '把搜索框里的文字保存为一条新提示词',
      'panel.searchSaveEmpty': '搜索框是空的：先粘贴提示词内容，或直接点「新建」',
      'panel.searchSaveRow': '把「{0}」保存为新提示词',
      'panel.refine': '先改标题…',
      'panel.refineTitle': '打开表单，先改标题和标签再保存',
      'panel.new': '新建',
      'panel.newTitle': '手动填写一条新提示词',
      'panel.newLabel': '新建提示词',
      'panel.editLabel': '编辑「{0}」',
      'panel.fieldTitle': '标题',
      'panel.fieldTitlePlaceholder': '给这条提示词起个名字',
      'panel.fieldTags': '标签',
      'panel.fieldTagsPlaceholder': '用逗号或空格分隔，例如：生图, 场景',
      'panel.fieldBody': '正文',
      'panel.bodyPlaceholder': '把提示词正文粘贴或输入到这里…',
      'panel.save': '保存',
      'panel.cancel': '取消',
      'panel.busy': '保存中…',
      'panel.bodyRequired': '正文不能为空',
      'panel.saved': '已保存为「{0}」',
      'panel.updated': '已更新「{0}」',
      'panel.keepId': '文件名保持不变：{0}.md（上一版已存进 .history）',
      'panel.removed': '已删除「{0}」',
      'panel.removedTo': '已移到 {0}',
      'panel.vault': '库目录',
      'panel.chars': '{0} 字符',
      'panel.noSession': '先打开一个会话，再使用提示词库。',
      'panel.staleInsert': '输入框内容已经变化，插入位置失效——请重新点击这一行。',
      'panel.noEditor': '当前窗口没有可写入的输入框，提示词没能插入。',
      'panel.footer': '提示词保存在本地 Markdown 文件中，可以直接用 Obsidian 或编辑器打开。',
    }

    const en = {
      'button.label': 'Prompts',
      'button.title': 'Open the prompt vault: save, edit and reuse stored prompts',
      'panel.title': 'Prompt vault',
      'panel.search': 'Search prompts, or paste a prompt and press save on the right',
      'panel.searchHint': 'Ctrl+Enter saves',
      'panel.empty': 'No prompts saved yet',
      'panel.emptyHint': 'Paste a prompt into the box above and press save; or write in the composer and use "Save draft".',
      'panel.noMatch': 'No matching prompt',
      'panel.loading': 'Reading the prompt vault…',
      'panel.error': 'Could not read the prompt vault',
      'panel.retry': 'Retry',
      'panel.count': '{0} prompts',
      'panel.refresh': 'Refresh',
      'panel.refreshTitle': 'Re-read the vault folder (files changed outside appear immediately)',
      'panel.insert': 'Click to insert into the composer',
      'panel.edit': 'Edit',
      'panel.editTitle': 'Edit this prompt’s title, tags and body',
      'panel.remove': 'Delete',
      'panel.removeTitle': 'Delete this prompt (moved to .trash by default)',
      'panel.confirmRemove': 'Confirm',
      'panel.saveDraft': 'Save draft',
      'panel.saveDraftTitle': 'Save what is in the composer as a prompt',
      'panel.searchSave': 'Save',
      'panel.searchSaveTitle': 'Save the text in the search box as a new prompt',
      'panel.searchSaveEmpty': 'The search box is empty — paste a prompt first, or use "New"',
      'panel.searchSaveRow': 'Save “{0}” as a new prompt',
      'panel.refine': 'Set title…',
      'panel.refineTitle': 'Open the form to set a title and tags before saving',
      'panel.new': 'New',
      'panel.newTitle': 'Write a new prompt by hand',
      'panel.newLabel': 'New prompt',
      'panel.editLabel': 'Edit “{0}”',
      'panel.fieldTitle': 'Title',
      'panel.fieldTitlePlaceholder': 'Name this prompt',
      'panel.fieldTags': 'Tags',
      'panel.fieldTagsPlaceholder': 'Separate with commas or spaces, e.g. image, scene',
      'panel.fieldBody': 'Body',
      'panel.bodyPlaceholder': 'Paste or type the prompt here…',
      'panel.save': 'Save',
      'panel.cancel': 'Cancel',
      'panel.busy': 'Saving…',
      'panel.bodyRequired': 'The body cannot be empty',
      'panel.saved': 'Saved as “{0}”',
      'panel.updated': 'Updated “{0}”',
      'panel.keepId': 'The file name stays {0}.md (the previous version went to .history)',
      'panel.removed': 'Deleted “{0}”',
      'panel.removedTo': 'Moved to {0}',
      'panel.vault': 'Vault folder',
      'panel.chars': '{0} chars',
      'panel.noSession': 'Open a session first, then use the prompt vault.',
      'panel.staleInsert': 'The composer changed, so the insert point is gone — click the row again.',
      'panel.noEditor': 'No writable composer in this window, so nothing was inserted.',
      'panel.footer': 'Prompts are plain Markdown files on this machine — open them in Obsidian or any editor.',
    }

    const CSS = `
.pv-root { display: inline-flex; align-items: center; }
.pv-button {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; border-radius: 8px;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap;
}
.pv-button:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.pv-button[aria-expanded="true"] {
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1);
}
.pv-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.pv-button:disabled { opacity: .5; cursor: default; }
.pv-panel {
  position: fixed; z-index: 2400; box-sizing: border-box;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .22);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.pv-head { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.pv-head-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pv-title { font-size: 13.5px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-head-side { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.pv-count { font-size: 11.5px; color: var(--dsw-alias-label-secondary); margin-right: 2px; }
.pv-mini {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 24px; padding: 0 7px; border-radius: 7px; cursor: pointer;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; white-space: nowrap;
}
.pv-mini:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1);
}
.pv-mini:disabled { opacity: .45; cursor: default; }
.pv-mini:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.pv-mini-primary {
  border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary);
}
.pv-mini-primary:hover:not(:disabled) {
  background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-brand-primary);
}
.pv-searchrow { display: flex; align-items: flex-end; gap: 6px; }
.pv-search {
  width: 100%; box-sizing: border-box; height: 32px; padding: 0 10px;
  border-radius: 9px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; outline: none;
}
.pv-search::placeholder { color: var(--dsw-alias-state-idle-primary); }
.pv-search:focus { border-color: var(--dsw-alias-brand-primary); }
/* The composer field doubles as an input: a pasted prompt must keep its line
   breaks, which a single-line <input> silently drops. */
.pv-searcharea {
  height: auto; min-height: 32px; max-height: 132px; padding: 7px 10px;
  line-height: 1.5; resize: none; overflow-y: auto; display: block;
}
.pv-searchbtn {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  height: 32px; padding: 0 9px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; white-space: nowrap;
}
.pv-searchbtn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-brand-primary); }
.pv-searchbtn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.pv-searchbtn:disabled { opacity: .45; cursor: default; }
.pv-body { overflow-y: auto; padding: 6px 6px 8px; overscroll-behavior: contain; }
.pv-body-edit {
  overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
  padding: 10px 12px 12px; overscroll-behavior: contain;
}
.pv-field { display: flex; flex-direction: column; gap: 4px; flex: none; }
.pv-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.pv-editor-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.pv-area {
  width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1.55;
  outline: none; resize: none;
}
.pv-area::placeholder { color: var(--dsw-alias-state-idle-primary); }
.pv-area:focus { border-color: var(--dsw-alias-brand-primary); }
.pv-area-body { min-height: 130px; height: 190px; resize: vertical; }
.pv-editor-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.pv-row { display: flex; gap: 6px; align-items: flex-start; border-radius: 10px; padding: 0; }
.pv-row:hover, .pv-row:focus-within { background: var(--dsw-alias-bg-layer-2); }
.pv-insert {
  display: flex; gap: 10px; flex: 1; min-width: 0; box-sizing: border-box; text-align: left;
  align-items: flex-start; padding: 8px 4px 8px 10px; border: 0; border-radius: 10px;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.pv-insert:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; border-radius: 10px; }
.pv-row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.pv-name { font-size: 13px; font-weight: 600; line-height: 1.35; }
.pv-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); display: flex; gap: 8px; flex-wrap: wrap; }
.pv-desc {
  font-size: 12px; line-height: 1.45; color: var(--dsw-alias-label-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pv-tag {
  margin-left: 6px; padding: 1px 5px; border-radius: 5px; font-size: 10px; font-weight: 500;
  color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2);
  vertical-align: 1px;
}
.pv-row-side { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 6px 6px 0 0; }
.pv-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.pv-icon:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }
.pv-icon:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.pv-icon-danger { width: auto; padding: 0 6px; font: inherit; font-size: 10.5px; white-space: nowrap; }
.pv-icon[data-armed="true"] {
  color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary);
  width: auto; padding: 0 6px; font: inherit; font-size: 10.5px; white-space: nowrap;
}
.pv-saverow-group { display: flex; align-items: stretch; gap: 6px; margin-top: 4px; }
.pv-saverow {
  display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;
  box-sizing: border-box; padding: 8px 10px; border-radius: 10px; cursor: pointer;
  border: 1px dashed var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; text-align: left;
}
.pv-saverow:hover:not(:disabled) { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.pv-saverow:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.pv-saverow:disabled { opacity: .45; cursor: default; }
.pv-saverow span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-saverow-aside { flex: none; white-space: nowrap; }
.pv-note { padding: 9px 12px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); border-top: 1px solid var(--dsw-alias-border-l1); line-height: 1.5; }
.pv-note code { font-size: 11px; word-break: break-all; }
.pv-state { padding: 18px 14px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; }
.pv-error { color: var(--dsw-alias-state-error-primary); }
.pv-toast { padding: 6px 12px; font-size: 11.5px; color: var(--dsw-alias-state-success-primary); border-top: 1px solid var(--dsw-alias-border-l1); }
`

    /** Fallback translator for a window whose locale service is unavailable. */
    function localTranslator() {
      const isEn = typeof document !== 'undefined'
        && String(document.documentElement.lang || '').toLowerCase().startsWith('en')
      const dict = isEn ? en : zh
      return (key, params) => {
        const template = dict[key] || key
        if (!params) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
      }
    }

    /** Locale-bound translator that re-renders on a language switch. */
    function useTranslator(localeService) {
      const usable = localeService
        && typeof localeService.bind === 'function'
        && typeof localeService.subscribe === 'function'
        && typeof localeService.getSnapshot === 'function'
      React.useSyncExternalStore(
        (listener) => (usable ? localeService.subscribe(listener) : () => {}),
        () => (usable ? localeService.getSnapshot() : null),
        () => (usable ? localeService.getSnapshot() : null),
      )
      return React.useMemo(
        () => (usable ? localeService.bind(NS) : localTranslator()),
        [usable, localeService],
      )
    }

    /** Stable selector: the plain draft text, or '' when the input is not bound. */
    function selectDraft(state) {
      return state && typeof state.draft === 'string' ? state.draft : ''
    }

    /** Whether the text ends with whitespace (a new token can follow directly). */
    function isSpaceTail(text) {
      if (text === '') return true
      const last = text.charCodeAt(text.length - 1)
      return last === 32 || last === 10 || last === 9 || last === 13 || last === 0x3000
    }

    /** A title inferred from a prompt body: its first non-empty line, trimmed. */
    function titleFrom(body) {
      const line = String(body || '')
        .split(/\r?\n/)
        .map((item) => item.replace(/^#+\s*/, '').trim())
        .find((item) => item !== '')
      if (!line) return ''
      return line.length > 60 ? line.slice(0, 60) : line
    }

    /** "a, b  c" -> ['a', 'b', 'c']; both comma styles and whitespace split. */
    function parseTags(text) {
      return String(text || '')
        .split(/[,，;；、\s]+/)
        .map((tag) => tag.trim())
        .filter((tag) => tag !== '')
        .slice(0, 20)
    }

    /**
     * Grow a textarea to fit its content, up to the CSS max-height.
     *
     * The search box starts at one row; pasting a 1500-character prompt should
     * show real text rather than one line scrolling sideways.
     */
    function grow(element) {
      if (!element) return
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight + 2}px`
    }

    /** Fixed overlay geometry: above the control, clamped into the viewport. */
    function panelGeometry(anchor) {
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(320, Math.min(460, window.innerWidth - 24))
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - 12 - width))
      const bottom = Math.max(12, window.innerHeight - rect.top + 8)
      const maxHeight = Math.max(280, Math.min(560, rect.top - 16))
      return { left, bottom, width, maxHeight }
    }

    /** One request to the Host half. */
    async function call(origin, action, init) {
      const response = await fetch(`${origin ?? ''}${ROUTE_PREFIX}/${action}`, {
        method: init === undefined ? 'GET' : 'POST',
        headers: init === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: init === undefined ? undefined : JSON.stringify(init),
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (payload?.ok !== true) throw new Error(String(payload?.error ?? `HTTP ${response.status}`))
      return payload
    }

    function PromptVault(props) {
      const { sessionId, inputActions, useInput } = props
      const t = useTranslator(props.localeService)
      const inputHook = typeof useInput === 'function' ? useInput : () => ''
      const draft = inputHook(selectDraft) || ''

      const [open, setOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [status, setStatus] = React.useState('idle')
      const [items, setItems] = React.useState([])
      const [vaultDir, setVaultDir] = React.useState('')
      const [error, setError] = React.useState('')
      const [toast, setToast] = React.useState('')
      const [geo, setGeo] = React.useState(null)
      const [armed, setArmed] = React.useState('')
      /** 'list' shows the rows; 'edit' shows the new/edit form. */
      const [view, setView] = React.useState('list')
      /** { id: null } means "new note"; an id means "replace that note". */
      const [editor, setEditor] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const anchorRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const searchRef = React.useRef(null)
      const titleRef = React.useRef(null)
      const bodyRef = React.useRef(null)
      const spanRef = React.useRef(null)
      const actionsRef = React.useRef(inputActions)
      const viewRef = React.useRef(view)
      const runRef = React.useRef(0)
      const loadRef = React.useRef(null)
      // The slot re-renders often; keeping the action bag in a ref means the
      // open effect below runs once per open, not once per composer keystroke.
      actionsRef.current = inputActions
      viewRef.current = view

      const load = React.useCallback(() => {
        const run = ++runRef.current
        const settle = (next) => {
          if (runRef.current === run) next()
        }
        setStatus('loading')
        setError('')
        call(props.origin, 'list').then(
          (payload) => settle(() => {
            setItems(Array.isArray(payload.items) ? payload.items : [])
            setVaultDir(typeof payload.vaultDir === 'string' ? payload.vaultDir : '')
            setStatus('ready')
          }),
          (failure) => settle(() => {
            setStatus('error')
            setError(failure instanceof Error ? failure.message : String(failure))
          }),
        )
        return undefined
      }, [props.origin])
      loadRef.current = load

      React.useEffect(() => {
        if (!open) return undefined
        // Capture the caret before any click moves focus out of the editor, so
        // an insert lands where the user left the cursor.
        try {
          const actions = actionsRef.current
          spanRef.current = actions && typeof actions.captureInsertion === 'function'
            ? actions.captureInsertion()
            : null
        } catch {
          spanRef.current = null
        }
        load()
        const compute = () => {
          if (anchorRef.current) setGeo(panelGeometry(anchorRef.current))
        }
        compute()
        const onPointer = (event) => {
          const target = event.target
          if (!(target instanceof Node)) return
          if (panelRef.current && panelRef.current.contains(target)) return
          if (anchorRef.current && anchorRef.current.contains(target)) return
          setOpen(false)
        }
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          // Escape backs out of the form first, so a mis-opened editor does not
          // silently discard the whole panel.
          if (viewRef.current === 'edit') {
            setView('list')
            setEditor(null)
            return
          }
          setOpen(false)
          const button = anchorRef.current && anchorRef.current.querySelector('button')
          if (button) button.focus()
        }
        window.addEventListener('resize', compute)
        window.addEventListener('scroll', compute, true)
        document.addEventListener('pointerdown', onPointer, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          runRef.current += 1
          window.removeEventListener('resize', compute)
          window.removeEventListener('scroll', compute, true)
          document.removeEventListener('pointerdown', onPointer, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open, load])

      React.useEffect(() => {
        if (!open) return undefined
        const timer = setTimeout(() => {
          if (view === 'edit' && titleRef.current) titleRef.current.focus()
          else if (searchRef.current) {
            grow(searchRef.current)
            searchRef.current.focus()
          }
        }, 0)
        return () => clearTimeout(timer)
      }, [open, view])

      // Keep the box's height in step with its content, including when a save
      // clears it or a filtered query shortens it.
      React.useEffect(() => {
        grow(searchRef.current)
      }, [query, view, open])

      /* ---- editor ---- */

      /**
       * Open the form for a brand-new prompt seeded with `text`.
       *
       * The form is seeded from the composer draft or the search box; nothing
       * is written until the user confirms, so cancelling loses nothing.
       */
      const openNew = React.useCallback((text) => {
        const body = String(text ?? '')
        setEditor({ id: null, title: titleFrom(body), tags: '', body })
        setView('edit')
        setToast('')
        setArmed('')
      }, [])

      /** Open the form for an existing prompt; the body is fetched on demand. */
      const openEdit = React.useCallback(
        async (item) => {
          setArmed('')
          setToast('')
          let body = typeof item.body === 'string' ? item.body : null
          if (body === null) {
            try {
              const payload = await call(props.origin, `get?id=${encodeURIComponent(item.id)}`)
              body = payload?.prompt?.body ?? ''
            } catch (failure) {
              setToast(failure instanceof Error ? failure.message : String(failure))
              return
            }
          }
          setEditor({
            id: item.id,
            title: item.title || item.id,
            tags: (item.tags || []).join(', '),
            body,
          })
          setView('edit')
        },
        [props.origin],
      )

      /** Write the form's contents; failures keep the form so no text is lost. */
      const commit = React.useCallback(async () => {
        if (editor === null || busy) return
        const body = editor.body.trim()
        if (body === '') {
          setToast(t('panel.bodyRequired'))
          return
        }
        setBusy(true)
        setToast('')
        try {
          const payload = await call(props.origin, 'save', {
            ...(editor.id === null ? {} : { id: editor.id }),
            title: editor.title.trim(),
            body,
            tags: parseTags(editor.tags),
          })
          const saved = payload?.prompt
          // Report what the Host actually did: an `id` that no longer exists
          // creates a note, and saying "已更新" there would be a lie.
          setToast(
            saved?.replaced === true
              ? t('panel.updated', { 0: saved?.title ?? '' })
              : t('panel.saved', { 0: saved?.title ?? '' }),
          )
          setBusy(false)
          setView('list')
          setEditor(null)
          setQuery('')
          load()
        } catch (failure) {
          setBusy(false)
          setToast(failure instanceof Error ? failure.message : String(failure))
        }
      }, [busy, editor, load, props.origin, t])

      /**
       * Save whatever is in the search box as a new prompt, in one click.
       *
       * The title is inferred from the first line, which is what the user would
       * have typed anyway; the pencil on the resulting row is the way to refine
       * the title and tags afterwards. Opening a form first would turn "click
       * save" into three steps.
       */
      const saveFromQuery = React.useCallback(async () => {
        const body = query.trim()
        if (body === '') {
          setToast(t('panel.searchSaveEmpty'))
          return
        }
        if (busy) return
        setBusy(true)
        setToast('')
        try {
          const payload = await call(props.origin, 'save', { title: titleFrom(body), body })
          setToast(t('panel.saved', { 0: payload?.prompt?.title ?? '' }))
          setQuery('')
          setBusy(false)
          load()
        } catch (failure) {
          setBusy(false)
          setToast(failure instanceof Error ? failure.message : String(failure))
        }
      }, [busy, load, props.origin, query, t])

      /** Refine the box's text in the full form before saving (title + tags). */
      const refineQuery = React.useCallback(() => {
        if (query.trim() === '') {
          setToast(t('panel.searchSaveEmpty'))
          return
        }
        openNew(query)
      }, [openNew, query, t])

      /* ---- existing actions ---- */

      /** Type one saved prompt into the composer at the remembered caret. */
      const insert = React.useCallback(
        async (item) => {
          let body = item.body
          if (typeof body !== 'string') {
            try {
              const payload = await call(props.origin, `get?id=${encodeURIComponent(item.id)}`)
              body = payload?.prompt?.body ?? ''
            } catch (failure) {
              setToast(failure instanceof Error ? failure.message : String(failure))
              return
            }
          }
          if (body === '') return
          setOpen(false)
          try {
            const actions = actionsRef.current
            const span = spanRef.current
            if (actions && typeof actions.insertText === 'function' && span) {
              const lead = draft === '' || isSpaceTail(draft) ? '' : '\n'
              if (actions.insertText(lead + body, span)) return
              // The editor moved on since the panel opened. Appending the whole
              // prompt here would duplicate what the user already typed, so say
              // so instead of guessing.
              setToast(t('panel.staleInsert'))
              return
            }
            if (actions && typeof actions.setDraft === 'function') {
              // No editor binding at all: append, never replace typed text.
              actions.setDraft(draft.trim() === '' ? body : `${draft.replace(/\s+$/, '')}\n\n${body}`)
              return
            }
            setToast(t('panel.noEditor'))
          } catch (failure) {
            console.error('[prompt-vault] insert failed:', failure)
          }
        },
        [draft, props.origin, t],
      )

      const remove = React.useCallback(
        async (item) => {
          if (armed !== item.id) {
            setArmed(item.id)
            return
          }
          setArmed('')
          try {
            const payload = await call(props.origin, 'remove', { id: item.id })
            setToast(
              payload?.removed?.deleted === 'moved'
                ? `${t('panel.removed', { 0: item.title })} · ${t('panel.removedTo', { 0: payload.removed.keptAt })}`
                : t('panel.removed', { 0: item.title }),
            )
            load()
          } catch (failure) {
            setToast(failure instanceof Error ? failure.message : String(failure))
          }
        },
        [armed, load, props.origin, t],
      )

      /**
       * Whether the box currently holds something worth filtering by.
       *
       * The same field is a search box and a paste target. A pasted prompt is
       * many lines and far longer than any title, so treating it as a filter
       * would blank the list at the exact moment the user wants to see the
       * vault. Only a short single-line entry filters.
       */
      const filtering = query.trim() !== '' && !query.includes('\n') && query.trim().length <= 80

      const visible = React.useMemo(() => {
        if (!filtering) return items
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        return items.filter((item) => {
          const hay = [item.title, item.id, item.description, item.preview, (item.tags || []).join(' ')]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return terms.every((term) => hay.includes(term))
        })
      }, [filtering, items, query])

      /* ---- render: the form ---- */

      const form = view === 'edit' && editor !== null
        ? h(
            'div',
            { className: 'pv-body pv-body-edit' },
            h(
              'div',
              { className: 'pv-field' },
              h('label', { className: 'pv-label', htmlFor: 'pv-title' }, t('panel.fieldTitle')),
              h('input', {
                id: 'pv-title',
                ref: titleRef,
                className: 'pv-search',
                type: 'text',
                value: editor.title,
                autoComplete: 'off',
                spellCheck: false,
                placeholder: t('panel.fieldTitlePlaceholder'),
                onChange: (event) => setEditor({ ...editor, title: event.currentTarget.value }),
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  commit()
                },
              }),
            ),
            h(
              'div',
              { className: 'pv-field' },
              h('label', { className: 'pv-label', htmlFor: 'pv-tags' }, t('panel.fieldTags')),
              h('input', {
                id: 'pv-tags',
                className: 'pv-search',
                type: 'text',
                value: editor.tags,
                autoComplete: 'off',
                spellCheck: false,
                placeholder: t('panel.fieldTagsPlaceholder'),
                onChange: (event) => setEditor({ ...editor, tags: event.currentTarget.value }),
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  commit()
                },
              }),
            ),
            h(
              'div',
              { className: 'pv-field' },
              h('label', { className: 'pv-label', htmlFor: 'pv-body' }, t('panel.fieldBody')),
              h('textarea', {
                id: 'pv-body',
                ref: bodyRef,
                className: 'pv-area pv-area-body',
                value: editor.body,
                spellCheck: false,
                placeholder: t('panel.bodyPlaceholder'),
                onChange: (event) => setEditor({ ...editor, body: event.currentTarget.value }),
                onKeyDown: (event) => {
                  // Ctrl/Cmd+Enter saves; a bare Enter must stay a newline.
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    commit()
                  }
                },
              }),
            ),
            editor.id === null
              ? null
              : h('div', { className: 'pv-editor-hint' }, t('panel.keepId', { 0: editor.id })),
            h(
              'div',
              { className: 'pv-editor-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'pv-mini',
                  disabled: busy,
                  onClick: () => {
                    setView('list')
                    setEditor(null)
                    setToast('')
                  },
                },
                t('panel.cancel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'pv-mini pv-mini-primary',
                  disabled: busy || editor.body.trim() === '',
                  onClick: commit,
                },
                busy ? t('panel.busy') : t('panel.save'),
              ),
            ),
          )
        : null

      /* ---- render: the list ---- */

      const list = view === 'list'
        ? h(
            'div',
            { className: 'pv-body' },
            status === 'loading' && items.length === 0
              ? h('div', { className: 'pv-state', role: 'status' }, t('panel.loading'))
              : null,
            status === 'error'
              ? h(
                  'div',
                  { className: 'pv-state pv-error', role: 'alert' },
                  h('div', null, t('panel.error')),
                  h('div', null, error),
                  h(
                    'button',
                    { type: 'button', className: 'pv-mini', onClick: () => loadRef.current && loadRef.current() },
                    t('panel.retry'),
                  ),
                )
              : null,
            status !== 'error' && status !== 'loading' && items.length === 0
              ? h(
                  'div',
                  { className: 'pv-state' },
                  h('div', null, t('panel.empty')),
                  h('div', null, t('panel.emptyHint')),
                )
              : null,
            status !== 'error' && items.length > 0 && filtering && visible.length === 0
              ? h('div', { className: 'pv-state' }, t('panel.noMatch'))
              : null,
            visible.map((item) =>
              h(
                'div',
                { key: item.id, className: 'pv-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pv-insert',
                    title: t('panel.insert'),
                    onClick: () => insert(item),
                  },
                  h(
                    'span',
                    { className: 'pv-row-main' },
                    h(
                      'span',
                      { className: 'pv-name' },
                      item.title,
                      (item.tags || []).map((tag) => h('span', { key: tag, className: 'pv-tag' }, tag)),
                    ),
                    h('span', { className: 'pv-desc' }, item.description || item.preview),
                    h(
                      'span',
                      { className: 'pv-meta' },
                      h('span', null, t('panel.chars', { 0: item.chars })),
                      h('span', null, item.id),
                    ),
                  ),
                ),
                h(
                  'span',
                  { className: 'pv-row-side' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pv-icon',
                      title: t('panel.editTitle'),
                      'aria-label': t('panel.edit'),
                      onClick: () => openEdit(item),
                    },
                    h(
                      'svg',
                      { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', 'aria-hidden': 'true' },
                      h('path', {
                        d: 'M10.6 2.9l2.5 2.5M3.2 9.3l7.1-7.1 2.5 2.5-7.1 7.1-3 .5z',
                        stroke: 'currentColor',
                        strokeWidth: 1.4,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }),
                    ),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pv-icon pv-icon-danger',
                      title: armed === item.id ? t('panel.confirmRemove') : t('panel.removeTitle'),
                      'aria-label': t('panel.remove'),
                      'data-armed': armed === item.id ? 'true' : 'false',
                      onClick: () => remove(item),
                    },
                    armed === item.id
                      ? t('panel.confirmRemove')
                      : h(
                          'svg',
                          { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', 'aria-hidden': 'true' },
                          h('path', {
                            d: 'M3 4.6h10M6.4 4.6V3h3.2v1.6M4.7 4.6l.6 8.4h5.4l.6-8.4',
                            stroke: 'currentColor',
                            strokeWidth: 1.4,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                          }),
                        ),
                  ),
                ),
              ),
            ),
            // The search box is an input box too: whatever is typed there can
            // become a note without a detour through the composer.
            query.trim() === ''
              ? null
              : h(
                  'div',
                  { className: 'pv-saverow-group' },
                  h(
                    'button',
                    { type: 'button', className: 'pv-saverow', disabled: busy, onClick: saveFromQuery },
                    h('span', null, '＋ ' + t('panel.searchSaveRow', { 0: query.trim().slice(0, 40) })),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pv-saverow pv-saverow-aside',
                      title: t('panel.refineTitle'),
                      disabled: busy,
                      onClick: refineQuery,
                    },
                    t('panel.refine'),
                  ),
                ),
          )
        : null

      const panel = open
        ? ReactDOM.createPortal(
            h(
              'div',
              {
                ref: panelRef,
                className: 'pv-panel',
                role: 'dialog',
                'aria-modal': 'false',
                'aria-label': t('panel.title'),
                // 0.2.2-rc.1 changed macOS window dragging: interactive controls
                // no longer get an automatic no-drag exclusion, so a body
                // portal that covers a draggable header must declare its own
                // region. This panel is that visible box, so the exclusion goes
                // here once rather than on every button inside it.
                'data-window-drag-exclude': true,
                style: geo
                  ? { left: `${geo.left}px`, bottom: `${geo.bottom}px`, width: `${geo.width}px`, maxHeight: `${geo.maxHeight}px` }
                  : { visibility: 'hidden', left: '12px', bottom: '12px', width: '400px', maxHeight: '440px' },
              },
              h(
                'div',
                { className: 'pv-head' },
                h(
                  'div',
                  { className: 'pv-head-row' },
                  h(
                    'span',
                    { className: 'pv-title' },
                    view === 'edit' && editor !== null
                      ? editor.id === null
                        ? t('panel.newLabel')
                        : t('panel.editLabel', { 0: editor.title || editor.id })
                      : t('panel.title'),
                  ),
                  h(
                    'span',
                    { className: 'pv-head-side' },
                    view === 'edit'
                      ? null
                      : h('span', { className: 'pv-count' }, t('panel.count', { 0: visible.length })),
                    // While the form is open these would throw away what the
                    // user has typed into it, so they step aside for Cancel/Save.
                    view === 'edit'
                      ? null
                      : h(
                          'button',
                          {
                            type: 'button',
                            className: 'pv-mini',
                            title: t('panel.newTitle'),
                            onClick: () => openNew(''),
                          },
                          t('panel.new'),
                        ),
                    view === 'edit'
                      ? null
                      : h(
                          'button',
                          {
                            type: 'button',
                            className: 'pv-mini',
                            title: t('panel.saveDraftTitle'),
                            disabled: draft.trim() === '',
                            onClick: () => openNew(draft),
                          },
                          t('panel.saveDraft'),
                        ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'pv-mini',
                        title: t('panel.refreshTitle'),
                        'aria-label': t('panel.refresh'),
                        disabled: status === 'loading',
                        onClick: () => loadRef.current && loadRef.current(),
                      },
                      h(
                        'svg',
                        { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', 'aria-hidden': 'true' },
                        h('path', {
                          d: 'M13.5 8a5.5 5.5 0 1 1-1.7-3.97M13.5 2.5V5.5h-3',
                          stroke: 'currentColor',
                          strokeWidth: 1.5,
                          strokeLinecap: 'round',
                          strokeLinejoin: 'round',
                        }),
                      ),
                    ),
                  ),
                ),
                view === 'edit'
                  ? null
                  : h(
                      'div',
                      { className: 'pv-searchrow' },
                      // A textarea, not an input: the box is also where a prompt
                      // gets pasted, and an <input> drops the line breaks that
                      // make a prompt a prompt. It grows with the content and
                      // filters the list on every keystroke.
                      h('textarea', {
                        ref: searchRef,
                        className: 'pv-search pv-searcharea',
                        rows: 1,
                        value: query,
                        autoComplete: 'off',
                        spellCheck: false,
                        placeholder: t('panel.search'),
                        'aria-label': t('panel.search'),
                        title: t('panel.searchHint'),
                        onChange: (event) => {
                          setQuery(event.currentTarget.value)
                          grow(event.currentTarget)
                        },
                        onKeyDown: (event) => {
                          // Enter makes a newline here (it is an input box now);
                          // Ctrl/Cmd+Enter is the deliberate "save this" chord.
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault()
                            saveFromQuery()
                          }
                        },
                      }),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'pv-searchbtn',
                          title: t('panel.searchSaveTitle'),
                          disabled: query.trim() === '',
                          onClick: saveFromQuery,
                        },
                        h(
                          'svg',
                          { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', 'aria-hidden': 'true' },
                          h('path', {
                            d: 'M8 3.2v9.6M3.2 8h9.6',
                            stroke: 'currentColor',
                            strokeWidth: 1.7,
                            strokeLinecap: 'round',
                          }),
                        ),
                        t('panel.searchSave'),
                      ),
                    ),
              ),
              form,
              list,
              toast ? h('div', { className: 'pv-toast' }, toast) : null,
              h(
                'div',
                { className: 'pv-note' },
                vaultDir === '' ? t('panel.footer') : h(React.Fragment, null, `${t('panel.vault')}：`, h('code', null, vaultDir)),
              ),
            ),
            document.body,
          )
        : null

      return h(
        'div',
        { className: 'pv-root', ref: anchorRef },
        h(
          'button',
          {
            type: 'button',
            className: 'pv-button',
            title: sessionId ? t('button.title') : t('panel.noSession'),
            'aria-label': t('button.title'),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            disabled: !sessionId,
            onClick: () => {
              setToast('')
              setArmed('')
              setView('list')
              setEditor(null)
              setBusy(false)
              setOpen((value) => !value)
            },
          },
          h(
            'svg',
            { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true' },
            h('path', {
              d: 'M3.2 3.6h9.6v6.2H7.4L4.8 12v-2.2H3.2z',
              stroke: 'currentColor',
              strokeWidth: 1.5,
              strokeLinejoin: 'round',
              strokeLinecap: 'round',
            }),
          ),
          h('span', null, t('button.label')),
        ),
        panel,
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-prompt-vault: dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-prompt-vault'
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-prompt-vault: styles')

      const localeService = ctx.get('locale')

      ctx.slots.inject('conversation.input.left', () =>
        ctx.slots.register(
          { name: 'conversation.input.left', id: 'dsh-prompt-vault', order: 6, locale: NS },
          (props) => h(PromptVault, { ...props, localeService }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
