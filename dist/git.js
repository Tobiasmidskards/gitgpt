import { exec } from 'child_process';
import { consoleInfo, writeStdout } from './logger.js';
export async function resolveCommand(command, defaultsTo = '') {
    consoleInfo('Resolving command: ' + command, 1, 1, true);
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (stderr && typeof stderr === 'string' && stderr.includes('To github.com')) {
                return resolve(stderr || defaultsTo);
            }
            if (error || stderr) {
                return reject(error || stderr);
            }
            return resolve(stdout || defaultsTo);
        });
    });
}
export async function getStatus() {
    return await resolveCommand('git status --porcelain --branch --short');
}
export async function getDiff() {
    return await resolveCommand("git --no-pager diff -U25 --cached --stat --line-prefix '$ ' -- ':!package-lock.json' ':!composer.lock'", 'No changes to commit');
}
export async function getCliHistory() {
    try {
        return await resolveCommand('cat ~/.zsh_history | tail -n 50');
    }
    catch (error) {
        return 'No history found';
    }
}
export async function getPreviousCommitMessages(numberOfMessages = 5) {
    return await resolveCommand(`git log --oneline --no-merges --no-decorate --no-color --pretty=format:'%h %ad %s' --abbrev-commit | head -n ${numberOfMessages}`);
}
// duplicate definitions removed below
export async function push() {
    try {
        consoleInfo('Pushing to origin', 2, 2);
        writeStdout(await resolveCommand('git push'));
    }
    catch (error) {
        console.error(error);
    }
}
export async function getNumberOfFiles() {
    const command = 'git diff --cached --name-only | wc -l';
    const numberOfFiles = await resolveCommand(command);
    return parseInt(numberOfFiles);
}
export async function branchIsAhead() {
    const command = "git status | grep 'Your branch is ahead' | wc -l";
    const isAhead = await resolveCommand(command);
    return parseInt(isAhead) > 0;
}
