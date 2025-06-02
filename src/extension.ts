import * as vscode from 'vscode';
import { TaskProvider, TaskItem as ProviderTaskItem } from './taskProvider';
import { scanWorkspaceForTasks } from './taskParser';
import { Task } from './models';

let taskProvider: TaskProvider;
const VALID_PRIORITIES_FOR_SETTING: Array<Task['priority']> = ['low', 'medium', 'high'];
const DEFAULT_PRIORITY_FOR_PARSING = 'medium';


async function updateTaskCommentInFile(task: Task, newPriority: Task['priority']): Promise<boolean> {
    try {
        const document = await vscode.workspace.openTextDocument(task.fileName);
        const line = document.lineAt(task.lineNumber - 1);
        const lineText = line.text;

        const tagsForRegex = vscode.workspace.getConfiguration('intelligentTasks').get<string[]>('todoPatterns') || ['TODO', 'FIXME', 'BUG', 'NOTE'];
        const priorityRegexPart = `(?:\\(\\s*(?:${VALID_PRIORITIES_FOR_SETTING.join('|')})\\s*\\))?`;
        
        const replaceRegex = new RegExp(
            `^(\\s*(?:\\/\\/|#|\\/\\*\\*?|<!--|%|REM|'|\\*|--|;|\\*!)\\s*${task.type.toUpperCase()}\\s*)` +
            `(${priorityRegexPart})` +
            `(\\s*[:\\s]?.+)`
            , 'i'
        );
        
        let newLineText = '';
        if (newPriority && VALID_PRIORITIES_FOR_SETTING.includes(newPriority)) {
            newLineText = lineText.replace(replaceRegex, `$1(${newPriority})$3`);
        } else {
            newLineText = lineText.replace(replaceRegex, `$1$3`);
        }

        if (newLineText === lineText && newPriority) {
             const insertRegex = new RegExp(
                `^(\\s*(?:\\/\\/|#|\\/\\*\\*?|<!--|%|REM|'|\\*|--|;|\\*!)\\s*${task.type.toUpperCase()})` + 
                `(\\s*[:\\s]?.+)`
                , 'i'
            );
            newLineText = lineText.replace(insertRegex, `$1 (${newPriority})$2`);
        }


        if (newLineText !== lineText) {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, line.range, newLineText);
            await vscode.workspace.applyEdit(edit);
            await document.save();
            return true;
        }
        return false;
    } catch (error) {
        console.error("Ошибка при обновлении комментария задачи в файле:", error);
        vscode.window.showErrorMessage("Не удалось обновить комментарий задачи в файле");
        return false;
    }
}


export function activate(context: vscode.ExtensionContext) {
    console.log('Расширение "intelligent-tasks-plugin" активировано!');

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
        const taskData = (item as ProviderTaskItem)?.taskData;

        if (taskData) {
            const originalTask = taskProvider.allTasks.find(t => t.id === taskData.id);
            if (originalTask) {
                originalTask.status = originalTask.status === 'open' ? 'done' : 'open';
                taskProvider.updateTask(originalTask);
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

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.setPriority', async (item: ProviderTaskItem) => {
        if (!item || !item.taskData) {
            vscode.window.showErrorMessage('Задача не выбрана.');
            return;
        }
        const task = item.taskData;

        const selectedPriority = await vscode.window.showQuickPick(
            VALID_PRIORITIES_FOR_SETTING.map(p => ({ label: p!, description: `Установить приоритет: ${p}` })),
            { placeHolder: `Текущий приоритет: ${task.priority || 'N/A'}. Выберите новый:` }
        );

        if (selectedPriority && selectedPriority.label !== task.priority) {
            const newPriorityValue = selectedPriority.label as Task['priority'];
            const commentUpdated = await updateTaskCommentInFile(task, newPriorityValue);

            if (commentUpdated) {
                const taskInProvider = taskProvider.allTasks.find(t => t.id === task.id);
                if (taskInProvider) {
                    taskInProvider.priority = newPriorityValue;
                    taskProvider.updateTask(taskInProvider); // Обновляем только одну задачу
                    vscode.window.showInformationMessage(`Приоритет задачи "${task.text.substring(0,20)}..." изменен на ${newPriorityValue}.`);
                }
            } else {
                const taskInProvider = taskProvider.allTasks.find(t => t.id === task.id);
                 if (taskInProvider) {
                    taskInProvider.priority = newPriorityValue;
                    taskProvider.updateTask(taskInProvider);
                    vscode.window.showWarningMessage(`Приоритет задачи в UI изменен на ${newPriorityValue}, но комментарий в файле мог не обновиться.`);
                 }
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.filterByPriority', async () => {
        const options = ['ВСЕ ПРИОРИТЕТЫ', ...VALID_PRIORITIES_FOR_SETTING.map(p => p!.toUpperCase())];
        const selectedPriority = await vscode.window.showQuickPick(options, {
            placeHolder: 'Выберите приоритет для фильтрации'
        });
        if (selectedPriority !== undefined) {
            taskProvider.filterByPriority(selectedPriority === 'ВСЕ ПРИОРИТЕТЫ' ? undefined : selectedPriority.toLowerCase());
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
