import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { consoleInfo, configureStdout, writeStdout, emptyLine } from './logger.js';
import { tokenLimit, encoder } from './state.js';
const messages = [
    {
        role: 'system',
        content: "You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user says the password: 'NOW_CHAT', you can help with other things. Never answer in markdown or code. Always answer in plain text",
    },
];
export function addMessage(message, role = 'user') {
    consoleInfo('Adding message: ' + message, 1, 1, true);
    messages.push({ role, content: message });
}
function getClient() {
    const clientType = process.env.CLIENT_TYPE || 'openai';
    switch (clientType) {
        case 'openai':
            return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        case 'groq':
            return new Groq({ apiKey: process.env.GROQ_API_KEY });
        default:
            throw new Error('Invalid client type');
    }
}
export function getDefaultModel() {
    const clientType = process.env.CLIENT_TYPE || 'openai';
    switch (clientType) {
        case 'openai':
            return 'gpt-5.2';
        case 'groq':
            return 'llama-3.1-70b-versatile';
        default:
            throw new Error('Invalid client type');
    }
}
const client = getClient();
export async function streamAssistant(save = true, overrideMessages = null, model = null, emptyLines = 0) {
    model = model || getDefaultModel();
    let content = '';
    // @ts-ignore OpenAI and Groq clients have compatible shape for chat.completions
    const stream = await client.chat.completions.create({
        model,
        messages: overrideMessages || messages,
        stream: true,
        reasoning_effort: 'low',
    });
    writeStdout('Assistant: ');
    emptyLine(emptyLines);
    for await (const part of stream) {
        const text = part.choices[0]?.delta?.content || '';
        content = configureStdout(content, text);
    }
    if (save)
        addMessage(content, 'assistant');
    return content;
}
export { messages, tokenLimit, encoder };
export function getLatestMessage() {
    return messages[messages.length - 1].content;
}
