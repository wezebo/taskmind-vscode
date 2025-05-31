import * as vscode from 'vscode';
import { Task } from './models';

export async function scanWorkspaceForTasks(): Promise<Task[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];

  const tasks: Task[] = [];
  const patterns = ["TODO", "FIXME", "BUG", "NOTE"];
  const regex = new RegExp(patterns.join("|"), "i");

  await vscode.workspace.findTextInFiles({ pattern: '**/*' }, result => {
    result.matches.forEach(match => {
      if (regex.test(match.preview.text)) {
        tasks.push({
          id: `${result.uri.fsPath}-${match.preview.text}`,
          text: match.preview.text.trim(),
          type: detectTaskType(match.preview.text),
          fileName: result.uri.fsPath,
          lineNumber: match.range.start.line + 1,
          priority: 'normal',
          isCompleted: false,
          createdAt: new Date().toISOString()
        });
      }
    });
  });

  return tasks;
}

function detectTaskType(text: string): string {
  if (text.includes('FIXME')) return 'FIXME';
  if (text.includes('BUG')) return 'BUG';
  if (text.includes('NOTE')) return 'NOTE';
  return 'TODO';
}