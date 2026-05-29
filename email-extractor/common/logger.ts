// Simple structured terminal logger with colors and timestamps.

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const RED    = '\x1b[31m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const WHITE  = '\x1b[37m'

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8) // HH:MM:SS
}

function prefix(level: string, color: string, layer: string): string {
  return `${DIM}[${timestamp()}]${RESET} ${color}${BOLD}${level}${RESET} ${DIM}[${layer}]${RESET}`
}

function formatExtra(data: unknown): string {
  if (data === undefined || data === null) return ''
  if (data instanceof Error) {
    return `\n  ${RED}${data.name}: ${data.message}${RESET}${data.stack ? `\n${DIM}${data.stack.split('\n').slice(1).join('\n')}${RESET}` : ''}`
  }
  if (typeof data === 'object') {
    return ` ${DIM}${JSON.stringify(data)}${RESET}`
  }
  return ` ${DIM}${data}${RESET}`
}

export const log = {
  info(layer: string, message: string, data?: unknown) {
    console.log(`${prefix('INFO ', CYAN, layer)} ${WHITE}${message}${RESET}${formatExtra(data)}`)
  },
  success(layer: string, message: string, data?: unknown) {
    console.log(`${prefix('OK   ', GREEN, layer)} ${WHITE}${message}${RESET}${formatExtra(data)}`)
  },
  warn(layer: string, message: string, data?: unknown) {
    console.warn(`${prefix('WARN ', YELLOW, layer)} ${YELLOW}${message}${RESET}${formatExtra(data)}`)
  },
  error(layer: string, message: string, err?: unknown) {
    console.error(`${prefix('ERROR', RED, layer)} ${RED}${BOLD}${message}${RESET}${formatExtra(err)}`)
  },
}
