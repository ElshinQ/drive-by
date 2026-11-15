import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item } from '../types'
import { scene, textPips } from './scene'

const PANE = 'drive-by'
const TOOL = 'mcp__drive-by__'

// Change the tag when Item's fields change: it declines what an earlier
// version stored, which outlives a reload.
const items = atom({ plugin: 'drive-by', key: 'items' } as const, [], {
  shape: 'items-1',
})
// Ids the agent was already reminded about (1.3.1). Each item is nudged once: closing
// one item no longer makes a "new" open set that re-sends the items still waiting.
const reminded = atom({ plugin: 'drive-by', key: 'reminded' } as const, [] as string[])
const showClosed = atom({ plugin: 'drive-by', key: 'showClosed' } as const, false)
// True when the main loop's current turn put a question to the person (an
// AskUserQuestion, or a wrap-up with an ask or option buttons). The turn-end
// reminder then waits, so it does not bury the question.
const asked = atom({ plugin: 'drive-by', key: 'asked' } as const, false)

// Tools whose call means the turn ends on a question for the person.
const ASKS = /^(AskUserQuestion|mcp__ccd_turn__wrap_up)$/
const isQuestion = (e: Record<string, unknown>) => {
  if (e.tool === 'AskUserQuestion') return true
  const ask = typeof e.ask === 'string' && e.ask.trim() !== ''
  const actions = Array.isArray(e.actions) && e.actions.length > 0
  return ask || actions
}

// Messages a person typed: the terminal, the desktop app (sdk), the phone bridge.
const PERSON = new Set(['composer', 'sdk', 'bridge', 'unclassified'])
// Short acknowledgements carry no ask: "ok", "thanks", "go ahead", "lgtm".
const ACK =
  /^(ok(ay)?|k|y(es|eah|ep|up)?|no(pe)?|thanks?( you)?|thx|ty|cool|nice|great|perfect|good|sure|go( ahead| on)?|continue|carry on|proceed|lgtm|done|👍|🙏|✅)[\s.!]*$/i

export const isAck = (text: string) => ACK.test(text.trim())
const MAX_TEXT = 600

const clip = (text: string, n: number) =>
  text.length > n ? `${text.slice(0, n - 1)}…` : text

const nextId = (list: readonly Item[]) => {
  const top = list.reduce((max, one) => Math.max(max, Number(one.id.slice(2)) || 0), 0)
  return `D-${top + 1}`
}

const openOf = (list: readonly Item[]) => list.filter(one => one.status === 'open')

const listText = (list: readonly Item[]) => {
  const open = openOf(list)
  if (open.length === 0) return 'No open drive-by tasks.'
  return [
    `${open.length} open drive-by task(s):`,
    ...open.map(one => `- ${one.id}: ${clip(one.text, 300)}`),
  ].join('\n')
}

// The session atom is what the pane draws; $.store keeps the list across sessions and app
// restarts (1.3.0: a restart used to wipe every task). Every write mirrors the list there.
const STORE_KEY = 'items-v1'

async function persist($: EngineInterface) {
  try {
    await $.store.set(STORE_KEY, await read($, items))
  } catch {
    // A full or failing store must never block logging an ask.
  }
}

const isItemList = (v: unknown): v is Item[] =>
  Array.isArray(v) && v.every(one => one && typeof one === 'object' && typeof (one as Item).id === 'string'
    && typeof (one as Item).text === 'string' && typeof (one as Item).status === 'string')

// At session start an empty list is filled from the store; a list the session already holds wins.
async function restore($: EngineInterface) {
  const current = await read($, items)
  if (current.length > 0) {
    await persist($)
    return
  }
  const saved = await $.store.get(STORE_KEY).catch(() => undefined)
  if (isItemList(saved) && saved.length > 0) await update($, items, () => saved)
}

async function add($: EngineInterface, text: string, source: Item['source']) {
  const createdAt = await $.clock.now()
  let made: Item | undefined
  await update($, items, list => {
    made = { id: nextId(list), text: clip(text.trim(), MAX_TEXT), status: 'open', source, createdAt }
    return [...list, made]
  })
  await persist($)
  return made as Item
}

async function close(
  $: EngineInterface,
  id: string,
  status: 'done' | 'dropped' | 'open',
  note: string | undefined,
) {
  const closedAt = await $.clock.now()
  let found = false
  await update($, items, list =>
    list.map(one => {
      if (one.id !== id) return one
      found = true
      return status === 'open'
        ? { ...one, status, closedAt: undefined, note: undefined }
        : { ...one, status, closedAt, note }
    }),
  )
  if (found) await persist($)
  return found
}

const age = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const hours = Math.round(m / 60)
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export const register: Register = (on, options) => {
  const remindAtTurnEnd = options.remindAtTurnEnd !== false
  const skipShortReplies = options.skipShortReplies !== false

  on('session.start', async ($, e, next) => {
    await restore($)
    await $.command.register({
      name: 'drive-by',
      description: 'Open the drive-by tasks pane',
    })
    await $.tool.register({
      name: 'list',
      description:
        'List the open drive-by tasks: asks the user made in passing during this session. Check it before you end a turn.',
      isDeferred: false,
    })
    await $.tool.register({
      name: 'add',
      description:
        'Add a drive-by task. Use it to split one message into several separate asks, or to log an ask you noticed that was not captured.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The ask, in one short sentence.' } },
        required: ['text'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'close',
      description:
        'Mark a drive-by task done. Proof is required: the file and line, commit, test run or output that shows it is done.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The task id, for example D-3.' },
          proof: { type: 'string', description: 'Evidence that it is done.' },
        },
        required: ['id', 'proof'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'drop',
      description:
        'Drop a drive-by task that needs no work. A reason is required, for example "answered in chat", "duplicate of D-2", "the user withdrew it".',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The task id, for example D-3.' },
          reason: { type: 'string', description: 'Why no work is needed.' },
        },
        required: ['id', 'reason'],
      },
      isDeferred: false,
    })
    void $.ui.open({ id: PANE, title: 'Drive-by' })

    return next(e)
  })

  on('command.run', { command: 'drive-by' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Drive-by' })
    return { text: listText(await read($, items)) }
  })

  // Auto-capture: every message the person sends becomes an open item.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    const isSkipped = skipShortReplies && isAck(text)
    if (e.command || e.isMeta || !PERSON.has(e.origin.kind) || text === '' || isSkipped) {
      return next(e)
    }
    const item = await add($, text, 'auto')
    const note =
      `[drive-by] This message is logged as ${item.id}. ` +
      `Before you end the turn: do it and call ${TOOL}close with proof, ` +
      `or call ${TOOL}drop with a reason (a plain question you answered is "answered in chat"). ` +
      `If it holds several asks, split them with ${TOOL}add and drop ${item.id} as "split".`

    return next({ ...e, context: [...(e.context ?? []), note] })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: /^mcp__drive-by__list$/ }, async $ => ({
    result: listText(await read($, items)),
  })).catch(() => ({ result: 'drive-by: the tool failed.', isError: true as const }))

  on('tool.call', { tool: /^mcp__drive-by__add$/ }, async ($, e) => {
    const text = str((e as Record<string, unknown>).text)
    if (!text) return { result: 'text is required.', isError: true }
    const item = await add($, text, 'agent')
    return { result: `Added ${item.id}.` }
  }).catch(() => ({ result: 'drive-by: the tool failed.', isError: true as const }))

  on('tool.call', { tool: /^mcp__drive-by__close$/ }, async ($, e) => {
    const input = e as Record<string, unknown>
    const id = str(input.id).toUpperCase()
    const proof = str(input.proof)
    if (!proof) return { result: 'proof is required to close a task.', isError: true }
    const found = await close($, id, 'done', clip(proof, 400))
    return found
      ? { result: `${id} closed.\n${listText(await read($, items))}` }
      : { result: `No task ${id}.`, isError: true }
  }).catch(() => ({ result: 'drive-by: the tool failed.', isError: true as const }))

  on('tool.call', { tool: /^mcp__drive-by__drop$/ }, async ($, e) => {
    const input = e as Record<string, unknown>
    const id = str(input.id).toUpperCase()
    const reason = str(input.reason)
    if (!reason) return { result: 'reason is required to drop a task.', isError: true }
    const found = await close($, id, 'dropped', clip(reason, 400))
    return found
      ? { result: `${id} dropped.\n${listText(await read($, items))}` }
      : { result: `No task ${id}.`, isError: true }
  }).catch(() => ({ result: 'drive-by: the tool failed.', isError: true as const }))

  // A new main-loop turn starts with no question asked.
  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) await update($, asked, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Watch, never change, the calls that end a turn on a question.
  on('tool.call', { tool: ASKS }, async ($, e, next) => {
    const input = e as Record<string, unknown>
    if (input.agentId === undefined && isQuestion(input)) await update($, asked, () => true)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Turn-end guard: each open item gets one reminder, not one per change to the set.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer') return done

    const open = openOf(await read($, items))
    $.ui.status(open.length > 0 ? `drive-by: ${open.length} open` : undefined)
    if (open.length === 0 || !remindAtTurnEnd) return done
    // The turn ended on a question: let the person answer first. The set is
    // not marked as nudged, so the reminder comes after their reply.
    if (await read($, asked)) return done

    const seen = new Set(await read($, reminded))
    const fresh = open.filter(one => !seen.has(one.id))
    if (fresh.length === 0) return done
    await update($, reminded, list => [...list, ...fresh.map(one => one.id)])
    const waiting = open.length - fresh.length

    void $.prompt.submit({
      text:
        `${listText(fresh).replace('open drive-by task(s)', 'new open drive-by task(s)')}\n\n` +
        (waiting > 0 ? `(${waiting} earlier item(s) still open; you already addressed them.)\n\n` : '') +
        `For each one: do it and call ${TOOL}close with proof, call ${TOOL}drop with a reason, ` +
        `or say in one line why it must wait. Do not end the turn with an item you did not address.`,
    })

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const list = await read($, items)
    const isShowingClosed = await read($, showClosed)
    const now = await $.clock.now()
    const open = openOf(list)
    const done = list.filter(one => one.status === 'done').length
    const dropped = list.filter(one => one.status === 'dropped').length
    const closed = list.filter(one => one.status !== 'open').reverse()
    const newestOpen = open[open.length - 1]?.id
    const width = Math.max(20, e.props.bodyColumns - 4)
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined

    return (
      <Box flexDirection="column" gap="sm">
        {Svg ? (
          <Svg
            source={scene(list)}
            alt={open.length > 0 ? `${open.length} drive-by tasks open` : 'All drive-by tasks clear'}
            isInteractive
          />
        ) : (
          <Text mono color={open.length > 0 ? 'warning' : 'success'}>
            {textPips(list) || '·'}
          </Text>
        )}

        <Box flexDirection="row" gap="md">
          <Text size="title" weight="semibold" tabular color={open.length > 0 ? 'warning' : 'success'}>
            {open.length}
          </Text>
          <Box flexDirection="column">
            <Text size="caption" dimColor>open</Text>
            <Text size="caption" tabular>
              <Text color="success">{done} done</Text>
              <Text dimColor> · {dropped} dropped</Text>
            </Text>
          </Box>
        </Box>

        {list.length === 0 && (
          <Text dimColor>No drive-by tasks yet. Every message you send lands here.</Text>
        )}
        {list.length > 0 && open.length === 0 && (
          <Text color="success">All clear. Nothing lost.</Text>
        )}

        {open.map(one => (
          <Box
            key={`card-${one.id}`}
            flexDirection="column"
            borderStyle="round"
            borderColor={one.id === newestOpen ? 'claude' : 'subtle'}
            paddingX={1}
            gap="xs"
          >
            <Box flexDirection="row" gap="sm">
              <Text mono weight="semibold" color="claude">{one.id}</Text>
              <Text size="caption" dimColor>
                {one.source === 'auto' ? 'you' : 'agent'} · {age(now - one.createdAt)}
              </Text>
            </Box>
            <Text>{clip(one.text, width * 3)}</Text>
            <Box flexDirection="row" gap="xs">
              <Button
                key={`done-${one.id}`}
                label="Done"
                variant="primary"
                onPress={() => close($, one.id, 'done', 'Closed by you in the pane')}
              />
              <Button
                key={`drop-${one.id}`}
                label="Drop"
                variant="secondary"
                onPress={() => close($, one.id, 'dropped', 'Dropped by you in the pane')}
              />
            </Box>
          </Box>
        ))}

        {closed.length > 0 && (
          <Button
            key="toggle-closed"
            label={isShowingClosed ? 'Hide closed' : `Show closed (${closed.length})`}
            plain
            onPress={() => update($, showClosed, v => !v)}
          />
        )}
        {isShowingClosed &&
          closed.map(one => (
            <Box key={`closed-${one.id}`} flexDirection="column" paddingX={1}>
              <Text dimColor>
                <Text color={one.status === 'done' ? 'success' : 'inactive'}>
                  {one.status === 'done' ? '■' : '▪'}
                </Text>{' '}
                <Text mono>{one.id}</Text> <Text strikethrough={one.status === 'dropped'}>{clip(one.text, width * 2)}</Text>
              </Text>
              {one.note && <Text size="caption" dimColor>  ↳ {clip(one.note, width * 2)}</Text>}
              <Button
                key={`reopen-${one.id}`}
                label="Reopen"
                plain
                onPress={() => close($, one.id, 'open', undefined)}
              />
            </Box>
          ))}
      </Box>
    )
  })
}
