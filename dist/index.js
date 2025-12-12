#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { exit } from 'process';
// Suppress dotenv informational messages
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, encoding, cb) {
    if (typeof chunk === 'string' && chunk.includes('[dotenv@')) {
        return true; // Suppress dotenv messages
    }
    return originalWrite(chunk, encoding, cb);
};
dotenv.config({ path: `${path.dirname(process.argv[1])}/../.env` });
process.stdout.write = originalWrite; // Restore original write function
const showHelp = () => {
    process.stdout.write(`
        Usage: npm start -- [--help] [--commit] [--estimate] [--push] [--add] [--verbose] [--interactive] [--hint] [gg] [--] [pr]

        Defaults to all flows if no options are provided.
        
        Options:
        -h --help   
        -C --commit     Get commit message
        -E --estimate   Get estimate
        -P --push       Push to origin
        -A --add        Add all files
        -v --verbose    Show verbose output
        -i --interactive Allow interactive improvement of commit messages
        --patch         Get patchnotes
        --cl            Get Customer Lead notes
        --hint          Provide hint for the assistant
        gg              Add all files, get commit message and push to origin
        pr              Create a new branch based on current changes
        --              Get CLI help

    `);
};
async function main() {
    // IMPORTANT: load env before importing modules that read process.env at module-evaluation time (ESM order).
    const { getArgs } = await import('./args.js');
    const { addToQueue, runQueue } = await import('./queue.js');
    const { consoleInfo } = await import('./logger.js');
    const { setStateArgs, setVerbose, setVoiceEnabled, getCommitMessage } = await import('./state.js');
    const { executeCliHelpFlow, executeStatusFlow } = await import('./cliFlows.js');
    const { executeGetCommitMessageFlow } = await import('./commit.js');
    const { executeEstimateFlow } = await import('./estimate.js');
    const { executePrFlow } = await import('./pr.js');
    const { getCLNotes, getPatchNotes } = await import('./notes.js');
    const { branchIsAhead, getNumberOfFiles, push, resolveCommand } = await import('./git.js');
    const args = await getArgs();
    setStateArgs(args);
    const argLength = Object.keys(args).length;
    if (args['--verbose'] || args['-v'])
        setVerbose(true);
    if (args['--voice'])
        setVoiceEnabled(true);
    if (args['--patch'])
        addToQueue(getPatchNotes);
    if (args['--cl'])
        addToQueue(getCLNotes);
    if (args['--help'] || args['-h']) {
        showHelp();
        addToQueue(() => exit(0));
    }
    if (args['--'] && argLength === 1) {
        addToQueue(executeCliHelpFlow);
        addToQueue(() => exit(0));
    }
    if (args['--add'] || args['-A'] || args['gg']) {
        addToQueue(resolveCommand, "git add -A");
    }
    if (args['--commit'] || args['-C'] || args['gg']) {
        addToQueue(executeGetCommitMessageFlow);
    }
    if (args['-P'] || args['--push'] || args['gg']) {
        addToQueue(applyCommit);
        addToQueue(push);
    }
    if (args['--estimate'] || args['-E']) {
        addToQueue(executeEstimateFlow);
    }
    if (args['pr']) {
        consoleInfo("Creating PR branch", 1, 1, true);
        addToQueue(executePrFlow);
    }
    if (argLength === 0 || args['-A'] || args['--add']) {
        addToQueue(executeStatusFlow);
        addToQueue(executeGetCommitMessageFlow);
    }
    await runQueue();
    exit(0);
    async function applyCommit() {
        if ((await getNumberOfFiles()) === 0 && !(await branchIsAhead())) {
            consoleInfo('No files to commit: <applyCommit>');
            return;
        }
        if (!getCommitMessage()) {
            await executeGetCommitMessageFlow();
        }
        const commitMessage = getCommitMessage();
        if (!commitMessage) {
            consoleInfo('No commit message available: <applyCommit>');
            return;
        }
        consoleInfo('Applying commit with command: ' + commitMessage, 2, 1, true);
        await resolveCommand(commitMessage);
    }
}
main();
