import { consoleInfo, emptyLine } from './logger.js';

type QueueItem = { command: (args?: any) => Promise<any> | any; args: any };
const queue: QueueItem[] = [];

export function addToQueue(command: any, args: any = {}): void {
  queue.push({ command, args });
}

export async function runQueue(): Promise<void> {
  if (queue.length > 0) {
    const { command, args } = queue.shift() || ({} as QueueItem);
    consoleInfo('Running: [' + (command?.name || command) + ']', 1, 1, true);
    await command(args);
    await runQueue();
    return;
  }

  consoleInfo('Done', 2, 0, true);
  emptyLine();
}


