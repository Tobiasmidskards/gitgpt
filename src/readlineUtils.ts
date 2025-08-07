import readline from 'readline';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { consoleInfo } from './logger.js';

export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  historySize: 1000,
  removeHistoryDuplicates: true,
});

export const CLI_HISTORY_FILE = path.join(os.homedir(), '.gitgpt_cli_history');
let cliHistoryInitialized = false;

function getRlHistory(): string[] {
  // @ts-ignore
  return (rl as unknown as { history?: string[] }).history || [];
}
function setRlHistory(history: string[]) {
  // @ts-ignore
  (rl as unknown as { history?: string[] }).history = history;
}

export async function initCliHistory() {
  if (cliHistoryInitialized) return;
  try {
    await fs.promises.access(CLI_HISTORY_FILE).catch(async () => {
      await fs.promises.writeFile(CLI_HISTORY_FILE, '');
    });
    const data = await fs.promises.readFile(CLI_HISTORY_FILE, 'utf8').catch(() => '');
    const lines = data.split('\n').filter((line) => line.trim().length > 0);
    setRlHistory(lines.reverse());
    // @ts-ignore
    (rl as any).historyIndex = -1;
    cliHistoryInitialized = true;
    consoleInfo(`Loaded ${lines.length} CLI help history items`, 1, 1, true);
  } catch {
    // ignore
  }
}

export async function appendCliHistory(entry: string) {
  const trimmed = (entry || '').trim();
  if (!trimmed) return;
  try {
    const hist = getRlHistory();
    if (hist[0] && hist[0].trim() === trimmed) return;
    await fs.promises.appendFile(CLI_HISTORY_FILE, trimmed + '\n');
    setRlHistory([trimmed, ...hist].slice(0, 1000));
  } catch {
    // ignore
  }
}

export async function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}


