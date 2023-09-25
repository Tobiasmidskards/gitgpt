import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { exit } from 'process';
import clipboardy from 'clipboardy';
import readline from 'readline';

dotenv.config({ path: `${path.dirname(process.argv[1])}/.env` });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const messages = [
    { role: 'system', content: "You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user says the password: 'NOW_CHAT', you can help with other things." },
];

const showHelp = () => {
    process.stdout.write(`
        Usage: node run.mjs [--help] [--commit] [--estimate]

        Defaults to all flows if no options are provided.
        
        Options:
        -h --help   Show help
        --commit    Run commit flow
        --estimate  Run estimate flow
        --hint      Provide a hint for the assistant
        -A          Add all files to commit
        -C          Commit and push directly to origin
    `);
    exit(0);
}

const args = await getArgs();

const queue = [];

async function runQueue() {
    
    if (queue.length > 0) {
        const { command, args } = queue.shift();
        consoleInfo("Running queue: " + command.name);
        await command(args);
        await runQueue();
        return;
    }

    consoleInfo("Queue is empty");
}

function addToQueue(command, args = {}) {
    queue.push({
        command,
        args
    });
}

async function main() {

    const argLength = Object.keys(args).length;

    if (args['--help'] || args['-h']) {
        showHelp();
    }

    if (args['--'] && argLength === 1) {
        addToQueue(executeCliHelpFlow);
    }

    if (args['--commit']) {
        addToQueue(executeCommitFlow);
    }

    if (args['--estimate']) {
        addToQueue(executeEstimateFlow);
    }

    if (args['-A']) {
        addToQueue(resolveCommand, "git add -A");
        addToQueue(executeCommitFlow);
        addToQueue(commitAndPush);
    }

    if (args['-C']) {
        addToQueue(executeCommitFlow);
        addToQueue(commitAndPush);
    }

    if (argLength === 0) {
        addToQueue(executeStatusFlow);
        addToQueue(executeCommitFlow);
    }

    await runQueue();

    exit(0);
}

async function commitAndPush() {
    const commitCommand = messages[messages.length - 1].content;

    emptyLine()

    consoleHeader("Committing and pushing to origin");
    consoleInfo("Applying commit: " + commitCommand, 0);

    try {
        writeStdout(await resolveCommand(commitCommand));
        consoleInfo("Pushing to origin");
        writeStdout(await resolveCommand("git push"));
        consoleInfo("Done", 1, 0)
    }
    catch (error) {
        // if (!error.includes('To github.com')) {
        //     console.error(error);
        // }
        console.error(error);
    }
}

async function getArgs() {
    const allowedArgs = ['-h', '--help', '--commit', '--estimate', '--hint', '-A', '-C', '--'];
    const rawArgs = process.argv.slice(2);

    const args = process.argv.slice(2).reduce((acc, arg) => {
        const [key, value] = arg.split('=');

        if (key.startsWith('--')) {
            // Long arguments (--example)
            const validArg = allowedArgs.includes(key);
            if (validArg) {
                acc[key] = value || true;
            }
        } else if (key.startsWith('-')) {
            // Short arguments (-A, -C, -AC etc.)
            for (let i = 1; i < key.length; i++) {
                const shortArg = '-' + key[i];
                if (allowedArgs.includes(shortArg)) {
                    acc[shortArg] = true;
                }
            }
        }

        return acc;
    }, {});

    if (Object.keys(args).length === 0 && rawArgs.length > 0) {
        args['--hint'] = rawArgs.join(' ');
    }

    return args;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

async function executeCliHelpFlow() {
    consoleHeader("CLI HELP");

    const cliHistory = await getCliHistory();

    const userInput = await new Promise((resolve, reject) => {
        rl.question("What is the problem? \n\n", (answer) => {
            resolve(answer);
        });
    } );

    const prompt = `
    
    Which Mac command would you use to solve this problem? 
    The user provided this information:
    ${userInput}
    
    This is the history of the user's last 50 commands:
    ${cliHistory}
    
    Answer only with the command, not the explanation.
    `;

    addMessage(prompt);

    writeStdout("\n");
    await streamAssistant();

    copyLastMessageToClipboard();

    rl.close();

    writeStdout("\n");

    exit(0);
}

async function executeCommitFlow() {
    consoleHeader("COMMIT");
    await prepareCommitPrompt();
    await streamAssistant();
    copyLastMessageToClipboard();
}

async function executeEstimateFlow() {
    consoleHeader("Harvest");
    await prepareEstimatePrompt();
    await streamAssistant();
}

async function executeStatusFlow() {
    consoleHeader("STATUS");
    const status = await getStatus();
    writeStdout(status);
}

async function prepareCommitPrompt() {
    const commitPrompt = buildCommitPrompt(await getDiff());
    addMessage(commitPrompt);
}

async function prepareEstimatePrompt() {
    const estimatePrompt = buildEstimatePrompt();
    addMessage(estimatePrompt);
}

function buildCommitPrompt(diff) {
    const rules = `
      Commit Message Rules:
      1. Use the imperative mood ("Add" instead of "Adds" or "Added").
      2. Start with a capital letter.
      3. Do not end with a period.
      4. Summarize the change, not the reason for it.
      5. Keep it concise, max 50 characters.
      6. Make it clear and descriptive.
      7. English only.
      8. Single-line format.
      
      Example: git commit -m "Add login feature"
    `;

    const additionalInfo = `
      In the diff, + indicates an added line, - indicates a removed line.
      Respond only in this format: git commit -m "Commit message". Lowercase commands only.
    `;

    let hintInfo = '';

    if (args['--hint']) {
        hintInfo = `
      The user provided this hint for the commit message. Please incorporate it into your message: "${args['--hint']}"
        `;
    }

    let prompt = `
      The diff comes from this command: git --no-pager diff --cached -U5 --line-prefix '$ '
      Each line starts with $ .
      ----
      ${rules}
      ----
      ${additionalInfo}
      ----
      ${hintInfo}
      ----
      Diff is:
    `;

    // Remove any extra spaces and add the diff at the end
    prompt = prompt.replace(/ {2,}/g, ' ') + diff;

    return prompt;
}

function buildEstimatePrompt() {
    addMessage("Good - NOW_CHAT - from now on you can chat like a normal person.");

    const exampleNote = "Example: Resolved issue with 'show all' for Feature B module.";
    const timeEstimateNote = "I only accept ranges like 0.5-1 hour, 1-2 hours, or 2-3 days. I just need one range answer.";

    let hintInfo = '';

    if (args['--hint']) {
        hintInfo = `
      The user provided this hint for the note. Please incorporate it into your note: "${args['--hint']}"
        `;
    }

    const prompt = `
      Based on the information I have provided, how could a note look like for the client?
      The note should not be very technical, as it is for the client.
      
      ${exampleNote}
      
      Also, how long time would you estimate that the changes in the diff would take to implement?
      ${timeEstimateNote}

      ${hintInfo}
      
      Please list those answers in points on new lines.
  
      Example:
      1. Added functionality to provide estimation. Made the process more user-friendly with non-technical language.
      2. Estimated implementation time: 1-2 hours.
    `;

    // Remove any extra spaces and return
    return prompt.replace(/ {2,}/g, ' ');
}


async function streamAssistant(model = 'gpt-4') {
    let content = '';
    const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true
    });

    for await (const part of stream) {
        const text = part.choices[0]?.delta?.content || '';
        content = configureStdout(content, text);
    }

    addMessage(content, 'assistant');
}

async function getStatus() {
    return await resolveCommand("git status --porcelain --branch --short");
}

async function getDiff() {
    return await resolveCommand("git --no-pager diff -U5 --cached --line-prefix '$ '", "No changes to commit");
}

async function getCliHistory() {
    return await resolveCommand("cat ~/.zsh_history | tail -n 50");
}

async function resolveCommand(command, defaultsTo = '') {
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

function copyLastMessageToClipboard() {
    clipboardy.writeSync(messages[messages.length - 1].content);
}

function consoleHeader(title, l1 = 1, l2 = 2) {
    emptyLine(l1);
    writeStdout("-------------------- " + title + " ---------------------", colors.header);
    emptyLine(l2);
}

function consoleInfo(title, l1 = 1, l2 = 2) {
    emptyLine(l1);
    writeStdout(">>>> " + title, 34);
    emptyLine(l2);
}

const addMessage = (message, role = 'user') => messages.push({ role, content: message });
const configureStdout = (content, text) => {
    writeStdout(text);
    return content += text;
};

const colors = {
    assistant: 32,
    system: 34,
    header: 33,
};

const writeStdout = (content, color) => {
    if (color) {
        process.stdout.write(`\x1b[${color}m`);
    }

    process.stdout.write(content);

    if (color) {
        process.stdout.write('\x1b[0m');
    }
}
const emptyLine = (times = 1) => {
    for (let i = 0; i < times; i++) {
        writeStdout('\n');
    }
};

main();