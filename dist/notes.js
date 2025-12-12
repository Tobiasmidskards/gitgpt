import { consoleHeader, consoleInfo, emptyLine } from './logger.js';
import { addMessage, streamAssistant, getLatestMessage } from './ai.js';
import { resolveCommand } from './git.js';
import { rl } from './readlineUtils.js';
import clipboardy from 'clipboardy';
export async function getPatchNotes() {
    consoleHeader('PATCH NOTES');
    const patchNotes = await resolveCommand("git log --oneline --no-merges --no-decorate --no-color --pretty=format:'%h %s' --abbrev-commit --since='last week'");
    const rules = `
      Patch Notes Rules:
      1. Use the git log output to create a list of patch notes.
      2. Group similar changes together.
      3. Do NOT include the commit hash.
      4. Do NOT include the commit message.
      5. Do NOT include the commit date.
      6. Do NOT include the commit author.
      7. Leave out anything that is not relevant to the user.
      8. The notes should be concise and descriptive.
      9. English only.
      10. Should be read by a non-technical person.     
      11. Each line should start with a - (dash).
    `;
    const prompt = `
      The user wants to see the patch notes for the last month.
      Based on the following git log output, create a list of patch notes:
      ${patchNotes}
      
      ${rules}
      
      Please list those notes on new lines.
    `;
    addMessage(prompt);
    await streamAssistant(true, null);
    copyLastMessageToClipboard();
    emptyLine(2);
    const followUp = await new Promise((resolve) => {
        rl.question('Do you want to write the patch notes? (y/N) \n', (answer) => resolve(answer));
    });
    if (followUp === 'y' || followUp === 'yes') {
        await writePatchNotes();
    }
}
export async function getCLNotes() {
    consoleHeader('CL NOTES');
    const log = await resolveCommand("git log --oneline --no-merges --no-decorate --no-color --pretty=format:'%h %s' --abbrev-commit --since='last week'");
    const rules = `
      Feature Rules:
      1. Use the git log output to create a list of notes.
      2. Group similar changes together.
      3. Do NOT include the commit hash.
      4. Do NOT include the commit message.
      5. Do NOT include the commit date.
      6. Do NOT include the commit author.
      7. Leave out anything that is not relevant to the CL.
      8. The notes should be concise and descriptive.
      9. English only.
      11. Explain the change in a way that a non-technical person can understand.
      12. Each line should start with a - (dash).
      13. A maximum of 5 notes. - Therefore, group similar changes together so only the most important ones are listed.
    `;
    const prompt = `
      The user wants to see what features have been added in the last week.
      Based on the following git log output, create a list of features:
      
      ${log}
      
      ${rules}
      
      Please list those notes on new lines.
    `;
    addMessage(prompt);
    await streamAssistant(true, null);
    copyLastMessageToClipboard();
    emptyLine(2);
}
export async function writePatchNotes() {
    const patchNotes = getLatestMessage();
    const date = new Date().toISOString().split('T')[0];
    const fileName = `CHANGELOG.md`;
    const content = `## ${date} (auto-generated) (last week)\n\n${patchNotes}\n\n`;
    const command = `echo "${content}" >> ${fileName}`;
    await resolveCommand(command);
    consoleInfo('Patch notes written to file: ' + fileName, 1, 1, true);
}
function copyLastMessageToClipboard() {
    try {
        const text = getLatestMessage();
        clipboardy.writeSync(text);
    }
    catch (error) {
        console.error('Could not copy to clipboard');
    }
}
