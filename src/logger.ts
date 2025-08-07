import { isVerbose } from './state.js';

export const colors = {
  assistant: 32,
  system: 34,
  header: 33,
} as const;

export function writeStdout(content: string, color: number | null = null): void {
  if (color) {
    process.stdout.write(`\x1b[${color}m`);
  }
  process.stdout.write(content);
  if (color) {
    process.stdout.write('\x1b[0m');
  }
}

export function emptyLine(times = 1): void {
  for (let i = 0; i < times; i++) {
    writeStdout('\n');
  }
}

export function consoleHeader(title: string, l1 = 1, l2 = 2, onlyVerbose = false): void {
  if (!isVerbose() && onlyVerbose) return;
  emptyLine(l1);
  writeStdout(`-------------------- ${title} ---------------------`, colors.header);
  emptyLine(l2);
}

export function consoleInfo(title: string, l1 = 1, l2 = 2, onlyVerbose = false): void {
  if (!isVerbose() && onlyVerbose) return;
  emptyLine(l1);
  writeStdout(`>>>> ${title}`, 34);
  emptyLine(l2);
}

export function configureStdout(content: string, text: string): string {
  writeStdout(text, colors.assistant);
  return (content += text);
}


