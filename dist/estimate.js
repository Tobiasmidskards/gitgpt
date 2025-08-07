import { consoleHeader } from './logger.js';
import { addMessage } from './ai.js';
import { getStateArgs } from './state.js';
export async function executeEstimateFlow() {
    consoleHeader('Harvest');
    const estimatePrompt = buildEstimatePrompt();
    addMessage(estimatePrompt);
}
export function buildEstimatePrompt() {
    addMessage('Good - NOW_CHAT - from now on you can chat like a normal person.');
    const exampleNote = "Example: Resolved issue with 'show all' for Feature B module.";
    const timeEstimateNote = 'I only accept ranges like 0.5-1 hour, 1-2 hours, or 2-3 days. I just need one range answer.';
    let hintInfo = '';
    const args = getStateArgs();
    if (args['--hint']) {
        hintInfo = `
      The user provided this hint for the note. Please incorporate it into your note: "${args['--hint'] || ''}"
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
    return prompt.replace(/ {2,}/g, ' ');
}
