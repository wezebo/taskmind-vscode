import * as vscode from 'vscode';
import { Task } from './models';

const DEFAULT_PRIORITY = 'medium';
const VALID_PRIORITIES = ['low', 'medium', 'high'];

function configuredTaskTags(): string[] {
    const config = vscode.workspace.getConfiguration('intelligentTasks');
    const patterns = config.get<string[]>('todoPatterns');
    return Array.isArray(patterns) ? patterns : ['TODO', 'FIXME', 'BUG', 'NOTE'];
}

function buildTaskRegex(): RegExp {
    const tags = configuredTaskTags();
    // Пример: 
    // TODO: Исправить баг
    // FIXME(low): Низкий приоритет
    // BUG(high): Критичный баг
    const pattern = `(?:\\/\\/|#|\\/\\*\\*?|<!--|%|REM|'|\\*|--|;|\\*!)\\s*(${tags.join('|')})\\s*(?:\\(\\s*(${VALID_PRIORITIES.join('|')})\\s*\\))?\\s*[:\\s]?(.*)`;
    return new RegExp(pattern, 'gi'); // g - глобальный поиск, i - регистронезависимый
}

export async function scanWorkspaceForTasks(): Promise<Task[]> {
    const tasks: Task[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return tasks;
    }

    const filesToScan = await vscode.workspace.findFiles(
        '**/*.*',
        '**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.vscode/**,**/out/**,**/coverage/**,**/*.min.*,**/*.map'
    );

    const taskRegex = buildTaskRegex();

    for (const file of filesToScan) {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                let match;
                taskRegex.lastIndex = 0;
                while ((match = taskRegex.exec(line.text)) !== null) {
                    const tagType = match[1].toUpperCase();
                    const parsedPriority = match[2] ? match[2].toLowerCase() : DEFAULT_PRIORITY;
                    let taskText = match[3].trim();

                    if (taskText.endsWith('*/')) {
                        taskText = taskText.substring(0, taskText.length - 2).trim();
                    } else if (taskText.endsWith('-->')) {
                        taskText = taskText.substring(0, taskText.length - 3).trim();
                    }

                    if (taskText) {
                        tasks.push({
                            id: `${file.fsPath}-${i}-${match.index}`,
                            text: taskText,
                            type: tagType as Task['type'],
                            priority: (VALID_PRIORITIES.includes(parsedPriority) ? parsedPriority : DEFAULT_PRIORITY) as Task['priority'],
                            fileName: document.fileName,
                            lineNumber: i + 1,
                            isCompleted: false,
                            createdAt: new Date().toISOString(),
                            status: 'open',
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Ошибка при парсинге файла ${file.fsPath}:`, error);
        }
    }
    return tasks;
}
