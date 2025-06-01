import * as vscode from 'vscode';
import { TaskProvider } from './taskProvider';
import { scanWorkspaceForTasks } from './taskParser';
import { Task } from './models';

let taskProvider: TaskProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Расширение "intelligent-tasks-plugin"');

    const rootPath = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined;

    taskProvider = new TaskProvider(rootPath);
    vscode.window.registerTreeDataProvider('intelligentTasksView', taskProvider);

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.scanWorkspace', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Intelligent Tasks: Сканирование задач...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Поиск задач..." });
            const tasks = await scanWorkspaceForTasks();
            taskProvider.refresh(tasks);
            progress.report({ increment: 100, message: "Готово!" });
            vscode.window.showInformationMessage(`Найдено ${tasks.length} задач.`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.markAsDone', async (item: vscode.TreeItem | { taskData: Task }) => {
        const taskData = (item as any).taskData as Task | undefined;

        if (taskData) {
            const originalTask = taskProvider['allTasks'].find(t => t.id === taskData.id);
            if (originalTask) {
                originalTask.status = originalTask.status === 'open' ? 'done' : 'open';
                taskProvider.refresh([...taskProvider['allTasks']]); // Обновляем копией массива
                vscode.window.showInformationMessage(`Задача "${originalTask.text.substring(0, 20)}..." отмечена как ${originalTask.status}.`);
            }
        } else {
            vscode.window.showErrorMessage('Не удалось определить задачу для отметки.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.filterByType', async () => {
        const config = vscode.workspace.getConfiguration('intelligentTasks');
        const tags = config.get<string[]>('todoPatterns') || [];
        const options = ['ВСЕ ТИПЫ', ...tags.map(tag => tag.toUpperCase())];
        const selectedType = await vscode.window.showQuickPick(options, {
            placeHolder: 'Выберите тип задач для отображения'
        });
        if (selectedType !== undefined) {
            taskProvider.filterByType(selectedType === 'ВСЕ ТИПЫ' ? undefined : selectedType);
        }
    }));


    const scanOnStartup = vscode.workspace.getConfiguration('intelligentTasks').get('scanOnStartup', true);
    if (scanOnStartup) {
        vscode.commands.executeCommand('intelligentTasks.scanWorkspace');
    }

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
        const autoRefreshOnSave = vscode.workspace.getConfiguration('intelligentTasks').get('autoRefreshOnSave', true);
        if (autoRefreshOnSave && vscode.workspace.getWorkspaceFolder(document.uri)) {
            vscode.commands.executeCommand('intelligentTasks.scanWorkspace');
        }
    }));
}

export function deactivate() {
    console.log('Расширение "intelligent-tasks-plugin" деактивировано.');
}
