const TTY = process.stderr.isTTY;
const COLOR = TTY && process.env.NO_COLOR === undefined;

const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold:  COLOR ? "\x1b[1m" : "",
  dim:   COLOR ? "\x1b[2m" : "",
  cyan:  COLOR ? "\x1b[36m" : "",
  green: COLOR ? "\x1b[32m" : "",
  yellow:COLOR ? "\x1b[33m" : "",
  red:   COLOR ? "\x1b[31m" : "",
};

const KEY_WIDTH = 12;

function write(line) {
  process.stderr.write(line + "\n");
}

export function blank() {
  write("");
}

export function title(name, version) {
  write(`${c.bold}${name}${c.reset}${c.dim} v${version}${c.reset}`);
}

export function section(name) {
  write(`${c.bold}${c.cyan}${name}${c.reset}`);
}

export function kv(key, value) {
  const k = key.padEnd(KEY_WIDTH);
  write(`  ${c.dim}${k}${c.reset} ${value}`);
}

export function ready(msg = "ready") {
  write(`${c.green}● ${msg}${c.reset}`);
}

export function info(msg) {
  write(msg);
}

export function warn(msg) {
  write(`${c.yellow}⚠  ${msg}${c.reset}`);
}

export function error(msg) {
  write(`${c.red}✖  ${msg}${c.reset}`);
}
