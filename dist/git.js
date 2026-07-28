import { exec, execFile } from 'child_process';
import { consoleInfo, writeStdout } from './logger.js';
import { askQuestion } from './readlineUtils.js';
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
export async function resolveGitCommand(args, defaultsTo = '') {
    consoleInfo('Running git with args: ' + args.join(' '), 1, 1, true);
    return new Promise((resolve, reject) => {
        execFile('git', args, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            return resolve(stdout || stderr || defaultsTo);
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
function isNoUpstreamError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('has no upstream branch') || message.includes('no upstream');
}
export async function getCurrentBranch() {
    const branch = (await resolveGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    if (!branch || branch === 'HEAD') {
        throw new Error('Could not determine current branch name');
    }
    return branch;
}
export async function push() {
    try {
        consoleInfo('Pushing to origin', 2, 2);
        writeStdout(await resolveGitCommand(['push']));
    }
    catch (error) {
        if (!isNoUpstreamError(error)) {
            console.error(error);
            return;
        }
        let branch;
        try {
            branch = await getCurrentBranch();
        }
        catch (branchError) {
            console.error(branchError);
            return;
        }
        const answer = (await askQuestion(`No upstream for '${branch}'. Push and set upstream to origin/${branch}? [Y/n] `))
            .trim()
            .toLowerCase();
        if (answer === 'n' || answer === 'no') {
            consoleInfo('Skipping push', 1, 1);
            return;
        }
        try {
            consoleInfo(`Pushing and setting upstream to origin/${branch}`, 2, 2);
            writeStdout(await resolveGitCommand(['push', '--set-upstream', 'origin', branch]));
        }
        catch (pushError) {
            console.error(pushError);
        }
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
