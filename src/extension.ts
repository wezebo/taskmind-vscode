import * as vscode from 'vscode';
import { TaskProvider, TaskItem as ProviderTaskItem } from './taskProvider';
import { scanWorkspaceForTasks } from './taskParser';
import { Task } from './models';
import { Ollama } from "ollama";

let taskProvider: TaskProvider;
let tasksTreeView: vscode.TreeView<vscode.TreeItem>;
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
    tasksTreeView = vscode.window.createTreeView('intelligentTasksView', {
        treeDataProvider: taskProvider
    });
    context.subscriptions.push(tasksTreeView);

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

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.markAsDone', async (item: vscode.TreeItem | {
        taskData: Task
    }) => {
        // If called from keyboard shortcut, get the selected item
        if (!item) {
            const selection = tasksTreeView.selection[0];
            if (selection instanceof ProviderTaskItem) {
                item = selection;
            }
        }

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
            VALID_PRIORITIES_FOR_SETTING.map(p => ({label: p!, description: `Установить приоритет: ${p}`})),
            {placeHolder: `Текущий приоритет: ${task.priority || 'N/A'}. Выберите новый:`}
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

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.getAISuggestion', async (item: ProviderTaskItem) => {
        // If called from keyboard shortcut, get the selected item
        if (!item) {
            const selection = tasksTreeView.selection[0];
            if (selection instanceof ProviderTaskItem) {
                item = selection;
            }
        }

        if (!item || !item.taskData) {
            vscode.window.showErrorMessage('Задача не выбрана.');
            return;
        }

        const task = item.taskData;
        const response = await getAISuggestion(task);

        if (response) {
            // Сохраняем предложение в задаче
            const taskInProvider = taskProvider.allTasks.find(t => t.id === task.id);
            if (taskInProvider) {
                taskInProvider.aiSuggestions = taskInProvider.aiSuggestions || [];
                taskInProvider.aiSuggestions.push(response);
                taskProvider.updateTask(taskInProvider);
            }

            // Показываем пользователю
            showSuggestionPanel(task, response);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intelligentTasks.showAISuggestion', (task: Task, suggestion: string) => {
            showSuggestionPanel(task, suggestion);
        }
    ));

  context.subscriptions.push(
      vscode.commands.registerCommand(
          'intelligentTasks.togglePinned',
          async (item: ProviderTaskItem) => {
            if (!item) {
              const selection = tasksTreeView.selection[0];
              if (selection instanceof ProviderTaskItem) {
                item = selection;
              }
            }

            if (!item || !item.taskData) {
              vscode.window.showErrorMessage('Задача не выбрана.');
              return;
            }

            const task = item.taskData;
            const commentUpdated = await toggleTaskPinnedStatus(task);

            if (commentUpdated) {
              const taskInProvider = taskProvider.allTasks.find(
                  (t) => t.id === task.id
              );
              if (taskInProvider) {
                taskInProvider.pinned = !taskInProvider.pinned;
                taskProvider.updateTask(taskInProvider);
                vscode.window.showInformationMessage(
                    `Задача "${task.text.substring(0, 20)}..." ${
                        taskInProvider.pinned ? 'закреплена' : 'откреплена'
                    }.`
                );
              }
            } else {
              vscode.window.showWarningMessage(
                  `Не удалось обновить статус закрепления задачи в файле.`
              );
            }
          }
      )
  );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'intelligentTasks.searchTasks',
            async () => {
                const searchQuery = await vscode.window.showInputBox({
                    placeHolder: 'Введите текст для поиска задач',
                    prompt:
                        'Поиск будет производиться по тексту задачи, типу, приоритету и имени файла',
                });

                if (searchQuery !== undefined) {
                    taskProvider.filterBySearchQuery(
                        searchQuery.trim() === '' ? undefined : searchQuery
                    );
                }
            }
        )
    );
}


async function getAISuggestion(task: Task): Promise<string | null> {
    try {
        const config = vscode.workspace.getConfiguration('intelligentTasks');
        const ollamaUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
        const aiModel = config.get<string>('aiModel') || 'codellama';
        const contextLines = config.get<number>('contextLines', 10);

        const ollama = new Ollama({host: ollamaUrl});

        const document = await vscode.workspace.openTextDocument(task.fileName);
        const startLine = Math.max(0, task.lineNumber - contextLines - 1); // -1 потому что lineNumber начинается с 1
        const endLine = Math.min(document.lineCount, task.lineNumber + contextLines);
        let context = '';

        for (let i = startLine; i < endLine; i++) {
            context += document.lineAt(i).text + '\n';
        }

        const prompt = `Ты - помощник разработчика. Проанализируй задачу и предложи решение.
Задача: ${task.text}
Тип: ${task.type}
Приоритет: ${task.priority || 'не указан'}
Контекст кода:
\`\`\`
${context}
\`\`\`

Предложи 1-2 конкретных решения. Будь лаконичен.`;

        const response = await ollama.generate({
            model: aiModel,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.2,
                num_predict: 300
            }
        });

        return response.response;
    } catch (error) {
        console.error("Ошибка при обращении к Ollama:", error);
        vscode.window.showErrorMessage(`Ошибка ИИ: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

function showSuggestionPanel(task: Task, suggestion: string) {
    const panel = vscode.window.createWebviewPanel(
        'aiSuggestion',
        `ИИ-предложение для задачи: ${task.text.substring(0, 20)}...`,
        vscode.ViewColumn.Beside,
        {enableScripts: true}
    );

    panel.webview.html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>ИИ-предложение</title>
        <style>
            body { 
                padding: 20px; 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, sans-serif;
                background-color: #1e1e1e;
                color: #d4d4d4;
                line-height: 1.5;
            }
            .task-info { 
                background: #252526; 
                padding: 15px; 
                border-radius: 5px; 
                margin-bottom: 20px; 
                border-left: 3px solid #569cd6;
            }
            .suggestion { 
                background: #2d2d30; 
                padding: 15px; 
                border-radius: 5px; 
                white-space: pre-wrap;
                border-left: 3px solid #4ec9b0;
            }
            h3 {
                color: #569cd6;
                margin-top: 0;
            }
            p {
                margin-bottom: 0.5em;
            }
        </style>
    </head>
    <body>
        <div class="task-info">
            <h3>Задача: ${escapeHtml(task.text)}</h3>
            <p>Файл: ${escapeHtml(task.fileName)}:${task.lineNumber}</p>
            <p>Тип: ${task.type} | Приоритет: ${task.priority || 'не указан'}</p>
        </div>
        <div class="suggestion">${escapeHtml(suggestion)}</div>
    </body>
    </html>`;
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function deactivate() {
    console.log('Расширение "intelligent-tasks-plugin" деактивировано.');
}

async function toggleTaskPinnedStatus(task: Task): Promise<boolean> {
  try {
    const document = await vscode.workspace.openTextDocument(task.fileName);
    const line = document.lineAt(task.lineNumber - 1);
    const lineText = line.text;

    const taskTypePattern = new RegExp(`\\b${task.type.toUpperCase()}\\b`, 'i');
    const typeMatch = taskTypePattern.exec(lineText);

    if (!typeMatch) {
      console.error('Тип задачи не найден в строке: ', lineText);
      return false;
    }

    const typeEndPos = typeMatch.index + task.type.length;

    const beforeType = lineText.substring(0, typeEndPos);
    let afterType = lineText.substring(typeEndPos);

    const afterTypePattern =
        /^(\s*)(?:\((\s*(?:low|medium|high)\s*)\))?\s*(\*)?(\s*[:\s]?.+)$/i;
    const afterMatch = afterTypePattern.exec(afterType);

    if (!afterMatch) {
      console.error('Не найден контент после типа задачи', afterType);
      return false;
    }

    const spaceAfterType = afterMatch[1] || '';
    const priority = afterMatch[2] || '';
    const pinnedMarker = afterMatch[3] || '';
    const taskContent = afterMatch[4];

    const newPinnedMarker = pinnedMarker ? '' : '*';

    let newAfterType = spaceAfterType;

    if (priority) {
      newAfterType += `(${priority})`;
    }

    newAfterType += newPinnedMarker;

    newAfterType += taskContent;

    const newLineText = beforeType + newAfterType;

    if (newLineText !== lineText) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, line.range, newLineText);
      await vscode.workspace.applyEdit(edit);
      await document.save();
      return true;
    }
    return false;
  } catch (error) {
    console.error(
        'Ошибка при обновлении статуса закрепления задачи в файле:',
        error
    );
    vscode.window.showErrorMessage(
        'Не удалось обновить статус закрепления задачи в файле'
    );
    return false;
  }
}
