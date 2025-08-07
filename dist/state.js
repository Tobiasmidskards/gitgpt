import { encodingForModel } from "js-tiktoken";
// Global mutable state, accessed via getters/setters for safety
let verbose = false;
let useVoice = false;
let commitMessage = null;
let args = {};
export const tokenLimit = 512000 / 2;
export const encoder = await encodingForModel("gpt-4");
export function isVerbose() {
    return verbose;
}
export function setVerbose(value) {
    verbose = value;
}
export function isVoiceEnabled() {
    return useVoice;
}
export function setVoiceEnabled(value) {
    useVoice = value;
}
export function getCommitMessage() {
    return commitMessage;
}
export function setCommitMessage(value) {
    commitMessage = value;
}
export function getStateArgs() {
    return args;
}
export function setStateArgs(newArgs) {
    args = { ...newArgs };
}
export function updateStateArgs(partial) {
    args = { ...args, ...partial };
}
