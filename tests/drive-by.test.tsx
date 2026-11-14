import { expect, test } from 'claude-code/testing'

import { scene } from '../hooks/scene'

const import_scene = async () => ({ scene })

const PANE = {
  plugin: 'drive-by',
  component: 'Pane',
  requestId: 'drive-by',
  props: {
    title: 'Drive-by',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const USER = { kind: 'sdk' } as const

// Each hook here stands for the engine beneath the mod.
function engine(on: any, sent: string[]) {
  on('command.register', () => ({ value: { command: 'drive-by' } }))
  on('tool.register', (_: unknown, e: { name: string }) => ({
    value: { tool: `mcp__drive-by__${e.name}` },
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: unknown, e: { text: string; context?: string[] }) => {
    sent.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('turn.complete', () => ({ text: 'ok' }))
}

test('a message becomes an open item and closes only with proof', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const entered = await $.prompt.submit({ text: 'Also fix the RTL header', origin: USER, wait: false })
  expect(entered.context?.some(c => c.includes('D-1'))).toBe(true)

  const noProof = await $.tool.call({ tool: 'mcp__drive-by__close', id: 'D-1', proof: '' } as any)
  expect(noProof.isError).toBe(true)

  const ok = await $.tool.call({ tool: 'mcp__drive-by__close', id: 'd-1', proof: 'header.tsx:12' } as any)
  expect(String(ok.result)).toContain('D-1 closed')

  const list = await $.tool.call({ tool: 'mcp__drive-by__list' } as any)
  expect(String(list.result)).toBe('No open drive-by tasks.')
})

test('the turn-end guard nudges once per unchanged open set', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Check the backup job', origin: USER, wait: false })

  const end = { reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' } as const
  await $.turn.complete(end)
  await $.turn.complete({ ...end, turnId: 't2' })

  const nudges = sent.filter(t => t.includes('open drive-by task'))
  expect(nudges.length).toBe(1)
  expect(nudges[0]).toContain('D-1')
})

test('the pane draws the scene, the count and a card, and Done closes it', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Rename the lane file', origin: USER, wait: false })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Rename the lane file/ }))?.text).toBe('Rename the lane file')
    expect((await ui.find({ type: 'Text', text: /^1$/ }))?.text).toBe('1')
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /□/ }))?.text).toBe('□')
    }
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'done-D-1' })
  expect((await ui.find({ type: 'Text', text: /All clear/ }))?.text).toBe('All clear. Nothing lost.')
  await ui.unmount()
})

test('the scene drives while items are open and parks at the flag when clear', async () => {
  const { scene } = await import_scene()
  const base = { source: 'auto', createdAt: 0 } as const
  const busy = scene([{ ...base, id: 'D-1', text: 'a', status: 'open' }])
  const calm = scene([{ ...base, id: 'D-1', text: 'a', status: 'done' }])
  expect(busy.includes('class="road"')).toBe(true)
  expect(busy.includes('class="wave"')).toBe(false)
  expect(calm.includes('class="wave"')).toBe(true)
  expect(calm.includes('prefers-reduced-motion')).toBe(true)
  expect(busy.length < 131072).toBe(true)
})

test('commands and plugin prompts are not captured', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'from a plugin', origin: { kind: 'plugin', name: 'x' } as any, wait: false })

  const list = await $.tool.call({ tool: 'mcp__drive-by__list' } as any)
  expect(String(list.result)).toBe('No open drive-by tasks.')
})

test('short acknowledgements are skipped by default; asks are kept', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const text of ['ok', 'Thanks!', 'go ahead', 'lgtm', 'yes.']) {
    await $.prompt.submit({ text, origin: USER, wait: false })
  }
  await $.prompt.submit({ text: 'ok, also rename the button', origin: USER, wait: false })

  const list = await $.tool.call({ tool: 'mcp__drive-by__list' } as any)
  expect(String(list.result)).toBe('1 open drive-by task(s):\n- D-1: ok, also rename the button')
})

test('short replies are kept when skipShortReplies is off', { options: { skipShortReplies: false } }, async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'ok', origin: USER, wait: false })

  const list = await $.tool.call({ tool: 'mcp__drive-by__list' } as any)
  expect(String(list.result)).toContain('D-1: ok')
})

test('no reminder when remindAtTurnEnd is off', { options: { remindAtTurnEnd: false } }, async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Check the backup job', origin: USER, wait: false })
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' })

  expect(sent.filter(t => t.includes('open drive-by task')).length).toBe(0)
})
