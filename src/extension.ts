import * as vscode from 'vscode';
import { TaskProvider } from './taskProvider';
import { scanWorkspaceForTasks } from './taskParser';

export function activate(context: vscode.ExtensionContext) {
  const taskProvider = new TaskProvider();

  vscode.window.registerTreeDataProvider('intelligentTasksView', taskProvider);

  vscode.commands.registerCommand('intelligentTasks.scanWorkspace', async () => {
    const tasks = await scanWorkspaceForTasks();
    taskProvider.refresh(tasks);
    vscode.window.showInformationMessage('Сканирование завершено.');
  });

  vscode.commands.registerCommand('intelligentTasks.markAsDone', (task) => {
    taskProvider.markTaskAsDone(task);
  });
}

export function deactivate() {}