import { isVerbose } from './state.js';
export const colors = {
    assistant: 32,
    system: 34,
    header: 33,
};
export function writeStdout(content, color = null) {
    if (color) {
        process.stdout.write(`\x1b[${color}m`);
    }
    process.stdout.write(content);
    if (color) {
        process.stdout.write('\x1b[0m');
    }
}
export function emptyLine(times = 1) {
    for (let i = 0; i < times; i++) {
        writeStdout('\n');
    }
}
export function consoleHeader(title, l1 = 1, l2 = 2, onlyVerbose = false) {
    if (!isVerbose() && onlyVerbose)
        return;
    emptyLine(l1);
    writeStdout(`-------------------- ${title} ---------------------`, colors.header);
    emptyLine(l2);
}
export function consoleInfo(title, l1 = 1, l2 = 2, onlyVerbose = false) {
    if (!isVerbose() && onlyVerbose)
        return;
    emptyLine(l1);
    writeStdout(`>>>> ${title}`, 34);
    emptyLine(l2);
}
export function configureStdout(content, text) {
    writeStdout(text, colors.assistant);
    return (content += text);
}
