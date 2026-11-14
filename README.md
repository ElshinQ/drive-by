# Drive-by

![Drive-by](.claude-plugin/icon.png)

Never lose an ask in a long Claude Code session.

Drive-by logs every message you send as a task in a side pane. The agent closes a task only with proof, or drops it with a reason. If a turn ends with open tasks, the agent gets one reminder that lists them.

## Why it exists

In a long session you talk to the agent while it works. You give feedback, then a comment, then a question, then you notice something else. Hours later, some of those asks are lost: compacted out of the context, misread, or never done. Nothing tells you which.

The agent's own task list does not fix this. That list is the agent's plan. Drive-by is a list of *your* asks, captured by a hook, so it does not depend on the agent to notice them.

## What it does

| Part | What happens |
|---|---|
| Auto-capture | Each message you type becomes a task (`D-1`, `D-2`, ...). The agent gets a short hidden note with the id. Slash commands and plugin prompts are skipped. Short replies such as "ok" or "thanks" are skipped by default. |
| Agent tools | `list`, `add`, `close`, `drop`. `close` needs proof (a file and line, a commit, a test run). `drop` needs a reason ("answered in chat", "duplicate of D-2"). The agent can split one message into several tasks with `add`. |
| Side pane | Open tasks as cards, with Done and Drop buttons for you. Closed tasks keep their proof and can be reopened. In the desktop app, an animated 2-bit pixel scene shows the load: a car drives while tasks are open and parks at a flag when all are clear. It stops for reduced motion. The terminal shows a row of squares instead. |
| Turn-end reminder | When a turn ends with open tasks, the agent gets one reminder that lists them. The same open set is never reminded twice, so it cannot loop. |
| Status line | `drive-by: N open` |

Type `/drive-by` to open the pane and print the open list.

## Install

At the prompt of a terminal session:

```
/plugin install drive-by --marketplace ElshinQ/drive-by
```

From a shell:

```bash
claude plugin install drive-by --marketplace ElshinQ/drive-by
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `ElshinQ/drive-by`, then Add plugin.

Choose the user scope to have it in every session. A session that is already running picks it up with `/reload-plugins`.

## Options

| Option | Default | Effect |
|---|---|---|
| `remindAtTurnEnd` | `true` | Send the agent one reminder when a turn ends with open tasks. |
| `skipShortReplies` | `true` | Do not log short acknowledgements ("ok", "thanks", "go ahead", "lgtm"). |

Set them in `/config`, or in `settings.json` under `pluginConfigs["drive-by"].options`.

## What it changes in your session

Be clear about the cost before you install:

- Each captured message carries one short hidden note to the agent: a few dozen tokens.
- A turn that ends with open tasks starts one more short turn: the reminder.
- The agent makes extra tool calls to close or drop tasks.

## Privacy

Tasks are stored in the session's own plugin state on your machine. The plugin makes no network calls and sends nothing to any outside service.

## Limits

- It is built on Claude Code's function-hooks plugin API, which is in early access. A Claude Code release can change that API. Open an issue if it breaks.
- Tasks belong to one session. A new session starts with an empty list.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

## Licence

MIT. See [LICENSE](LICENSE).

Made by Noor Elshin.
