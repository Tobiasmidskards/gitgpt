import { consoleHeader, consoleInfo } from './logger.js';
import { getDiff, resolveCommand } from './git.js';
import { streamAssistant } from './ai.js';

export async function executePrFlow() {
  consoleHeader('PR BRANCH');

  const diff = await getDiff();
  if (!diff || diff.trim() === '' || diff.trim() === 'No changes to commit') {
    consoleInfo('No changes to create PR branch for', 1, 1, true);
    return;
  }

  const branchName = await generateBranchName(diff);
  if (!branchName) {
    consoleInfo('Failed to generate branch name');
    return;
  }

  consoleInfo(`Creating branch: ${branchName}`, 2, 1);
  try {
    await resolveCommand(`git checkout -b ${branchName}`);
    consoleInfo(`Successfully created and switched to branch: ${branchName}`);
  } catch (error) {
    consoleInfo('Failed to create branch with error: ' + error);
  }
}

export async function generateBranchName(diff: string): Promise<string | null> {
  const rules = `
        Branch Naming Rules:
        1. Start with one of: feature/, chore/, bug/, hotfix/
        2. Use kebab-case (lowercase with hyphens)
        3. Be descriptive but concise (max 30 characters after prefix)
        4. Use present tense verbs
        5. No special characters except hyphens
        6. English only
        
        Type Guidelines:
        - feature/: New functionality or enhancements
        - chore/: Maintenance, refactoring, or tooling changes
        - bug/: Bug fixes
        - hotfix/: Critical production fixes
        
        Examples:
        - feature/user-login
        - feature/payment-integration
        - chore/update-dependencies
        - bug/fix-validation-error
        - hotfix/security-patch
    `;

  const prompt = `
        Based on the following git diff, generate a branch name that follows the rules below.
        
        ${rules}
        
        Respond with ONLY the branch name, nothing else.
        
        Diff:
        ${diff}
    `;

  try {
    const branchName = await streamAssistant(false, [{ role: 'user', content: prompt }]);
    return branchName.trim();
  } catch (error) {
    console.error('Error generating branch name:', error);
    return null;
  }
}


