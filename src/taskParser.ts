import * as vscode from 'vscode';
import { Task } from './models';

function configuredTaskTags(): string[] {
    const config = vscode.workspace.getConfiguration('intelligentTasks');
    return config.get<string[]>('todoPatterns') || ['TODO', 'FIXME', 'BUG', 'NOTE'];
}

function buildTaskRegex(): RegExp {
    const tags = configuredTaskTags();
    // (любой из стандартных префиксов комментария) + (пробелы) + (ОДИН ИЗ ТЕГОВ) + (граница слова) + (опциональное двоеточие и пробелы) + (текст задачи)
    // Пример: // TODO: Исправить баг
    const pattern = `(?:\\/\\/|#|\\/\\*\\*?|<!--|%|REM|'|\\*|--|;|\\*!)\\s*(${tags.join('|')})\\b(?:[:\\s]+)(.*)`;
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
                    let taskText = match[2].trim();

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
                            priority: 'medium',
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
