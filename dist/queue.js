import { consoleInfo, emptyLine } from './logger.js';
const queue = [];
export function addToQueue(command, args = {}) {
    queue.push({ command, args });
}
export async function runQueue() {
    if (queue.length > 0) {
        const { command, args } = queue.shift() || {};
        consoleInfo('Running: [' + (command?.name || command) + ']', 1, 1, true);
        await command(args);
        await runQueue();
        return;
    }
    consoleInfo('Done', 2, 0, true);
    emptyLine();
}
