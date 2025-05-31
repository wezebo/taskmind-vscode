import * as vscode from 'vscode';
import { Task } from './models';

export async function scanWorkspaceForTasks(): Promise<Task[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];

  const tasks: Task[] = [];
  const patterns = ['TODO', 'FIXME', 'BUG', 'NOTE'];
  const regex = new RegExp(patterns.join('|'), 'i');

  // Найдем все текстовые/исходные файлы (надо будет потом добавить различные расширения файлов, мне пока не до этого просто :) )
  const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,md,txt}');

  for (const file of files) {
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const content = Buffer.from(bytes).toString('utf8');
      const lines = content.split(/\r?\n/);

      lines.forEach((line, idx) => {
        if (regex.test(line)) {
          tasks.push({
            id: `${file.fsPath}-${line.trim()}`,
            text: line.trim(),
            type: detectTaskType(line),
            fileName: file.fsPath,
            lineNumber: idx + 1,
            priority: 'normal',
            isCompleted: false,
            createdAt: new Date().toISOString(),
          });
        }
      });
    } catch (err) {
      console.error(`Error reading file ${file.fsPath}:`, err);
    }
  }

  return tasks;
}

function detectTaskType(text: string): string {
  const types = ['FIXME', 'BUG', 'NOTE', 'TODO'];
  const found = types.find(type => text.includes(type));
  return found ?? 'TODO';
}
