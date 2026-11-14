import type { Item } from '../types'

// 2-bit palette: four tones, darkest to lightest.
const P = ['#1d1a16', '#5b4a32', '#c99b4f', '#f4e6c4'] as const

// The car, 14 by 7 pixels. Digits are palette tones, dots are empty.
const CAR = [
  '....222222....',
  '...21111112...',
  '..2111211112..',
  '22222222222222',
  '22222222222223',
  '22002222220022',
  '..00......00..',
]

const W = 100
const H = 30

const px = (x: number, y: number, tone: number, extra = '') =>
  `<rect x="${x}" y="${y}" width="1" height="1" fill="${P[tone]}"${extra}/>`

function sprite(rows: readonly string[], ox: number, oy: number) {
  let out = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c !== undefined && c !== '.') out += px(ox + x, oy + y, Number(c))
    }
  })
  return out
}

function pips(list: readonly Item[]) {
  const shown = list.slice(-23)
  const newestOpen = [...shown].reverse().find(one => one.status === 'open')?.id
  return shown
    .map((one, i) => {
      const x = 4 + i * 4
      if (one.status === 'done') return `<rect x="${x}" y="3" width="3" height="3" fill="${P[3]}"/>`
      if (one.status === 'dropped') return `<rect x="${x}" y="3" width="3" height="3" fill="${P[1]}"/>`
      const blink = one.id === newestOpen ? ' class="blink"' : ''
      return `<rect x="${x + 0.5}" y="3.5" width="2" height="2" fill="none" stroke="${P[2]}" stroke-width="1"${blink}/>`
    })
    .join('')
}

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [12, 10, 0], [31, 8, 0.6], [48, 12, 1.2], [67, 9, 0.3], [83, 11, 0.9], [94, 7, 1.5],
]

export function scene(list: readonly Item[]) {
  const open = list.filter(one => one.status === 'open').length
  const isMoving = open > 0
  // More open items, faster road: the scene shows the load.
  const speed = Math.max(0.18, 0.9 - open * 0.12).toFixed(2)

  const stars = STARS.map(
    ([x, y, d]) => px(x, y, 1, ` class="tw" style="animation-delay:${d}s"`),
  ).join('')

  let dashes = ''
  for (let x = 0; x < W + 16; x += 8) dashes += `<rect x="${x}" y="26" width="4" height="1" fill="${P[2]}"/>`

  const puffs = isMoving
    ? `<g class="puff">${px(12, 24, 1)}${px(11, 23, 1)}</g><g class="puff p2">${px(12, 24, 1)}</g>`
    : ''

  const flag = isMoving
    ? ''
    : `<g transform="translate(80 13)">
        <rect x="0" y="0" width="1" height="13" fill="${P[3]}"/>
        <g class="wave">${checker(1, 0)}</g><g class="wave w2">${checker(1, 1)}</g>
      </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="300" height="90" shape-rendering="crispEdges">
<style>
  .tw{animation:tw 2.4s steps(2) infinite}
  @keyframes tw{50%{fill:${P[3]}}}
  .blink{animation:bl .8s steps(2) infinite}
  @keyframes bl{50%{opacity:.15}}
  .road{animation:road ${speed}s linear infinite}
  @keyframes road{to{transform:translateX(-8px)}}
  .bob{animation:bob .36s steps(2) infinite}
  @keyframes bob{50%{transform:translateY(-1px)}}
  .puff{animation:puff .9s steps(4) infinite;opacity:0}
  .p2{animation-delay:.45s}
  @keyframes puff{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(-6px,-3px)}}
  .wave{animation:wave .7s steps(1) infinite}
  .w2{animation-delay:.35s;opacity:0}
  @keyframes wave{0%{opacity:1}50%{opacity:0}}
  @media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<rect width="${W}" height="${H}" fill="${P[0]}"/>
${stars}
${pips(list)}
<rect y="22" width="${W}" height="${H - 22}" fill="${P[1]}"/>
<g${isMoving ? ' class="road"' : ''}>${dashes}</g>
${puffs}
<g${isMoving ? ' class="bob"' : ''}>${sprite(CAR, isMoving ? 14 : 58, 16)}</g>
${flag}
</svg>`
}

function checker(ox: number, phase: number) {
  let out = ''
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 6; x++) {
      const tone = (x + y + phase) % 2 === 0 ? 3 : 0
      // Second frame drops the far corner: the flag ripples.
      if (phase === 1 && x === 5 && y === 0) continue
      out += px(ox + x, y, tone)
    }
  }
  return out
}

// The terminal has no Svg: one cell per item.
export function textPips(list: readonly Item[]) {
  return list
    .slice(-30)
    .map(one => (one.status === 'done' ? '■' : one.status === 'dropped' ? '▪' : '□'))
    .join('')
}
