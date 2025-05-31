import * as vscode from 'vscode';
import { Task } from './models';

export class TaskProvider implements vscode.TreeDataProvider<Task> {
  private _tasks: Task[] = [];
  private _onDidChangeTreeData: vscode.EventEmitter<Task | undefined | void> = new vscode.EventEmitter<Task | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Task | undefined | void> = this._onDidChangeTreeData.event;

  refresh(tasks: Task[]) {
    this._tasks = tasks;
    this._onDidChangeTreeData.fire();
  }

  markTaskAsDone(task: Task) {
    task.isCompleted = true;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Task): vscode.TreeItem {
    const label = element.isCompleted ? `✔️ ${element.text}` : element.text;
    const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    treeItem.command = {
      command: 'vscode.open',
      title: 'Открыть файл',
      arguments: [vscode.Uri.file(element.fileName), { selection: new vscode.Range(element.lineNumber - 1, 0, element.lineNumber - 1, 0) }]
    };
    treeItem.contextValue = 'task';
    return treeItem;
  }

  getChildren(): Task[] {
    return this._tasks;
  }
}