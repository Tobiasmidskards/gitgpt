import clipboardy from 'clipboardy';
import { consoleHeader, consoleInfo, emptyLine } from './logger.js';
import { addMessage, streamAssistant, getLatestMessage } from './ai.js';
import { getCliHistory, getStatus } from './git.js';
import { appendCliHistory, rl, initCliHistory } from './readlineUtils.js';
export async function executeCliHelpFlow({ isFollowUp = false }) {
    if (!isFollowUp) {
        consoleHeader('CLI HELP');
    }
    await initCliHistory();
    const cliHistory = await getCliHistory();
    const userInput = await new Promise((resolve) => {
        const question = isFollowUp ? 'Tell me more about the problem: \n\n' : 'What is the problem? \n\n';
        rl.question(question, (answer) => {
            appendCliHistory(String(answer)).finally(() => resolve(answer));
        });
    });
    const rules = `
      1. Single-line format.
      2. Do NOT try to format it like code / include \`\`\` in the message.
    `;
    const userInputMessage = `
        The user provided this information:
        ${userInput}
    `;
    const context = `
        Rules:
        ${rules}
        
        Which Mac command would you use to solve this problem? 
        ${userInputMessage}
        
        This is the history of the user's last 50 commands:
        ${cliHistory}
    `;
    const prompt = `
    ${isFollowUp ? userInputMessage : context}
    Answer only with the command, not the explanation.
    `;
    addMessage(prompt);
    emptyLine();
    await streamAssistant();
    copyLastMessageToClipboard();
    emptyLine(2);
    const followUp = await new Promise((resolve) => {
        rl.question('Do you need a follow-up? (y/n) \n', (answer) => {
            resolve(answer);
        });
    });
    if (followUp === 'y' || followUp === '' || followUp === 'yes') {
        await executeCliHelpFlow({ isFollowUp: true });
    }
    rl.close();
}
export function copyLastMessageToClipboard() {
    try {
        clipboardy.writeSync(getLatestMessage());
    }
    catch (error) {
        console.error('Could not copy to clipboard');
    }
}
export async function executeStatusFlow() {
    consoleHeader('STATUS');
    const status = await getStatus();
    consoleInfo(status, 0, 0);
}
