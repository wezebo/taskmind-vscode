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
    const commentPrefixes = [
        '\\/\\/',    // //
        '#',         // #
        '\\/\\*',    // /*
        '<!--',      // <!--
        ';',         // ;
        '--',        // --
        '%',         // %
        '\\*'        // * (для строк внутри блочных комментариев)
    ].join('|');

    const pattern =
        `(?:^\\s*|[^\\w$])` +                         // 1. Начало строки или не-словесный символ
        `(?:${commentPrefixes})` +                    // 2. Префикс комментария
        `\\s*` +                                      // 3. Пробелы
        `(${tags.join('|')})` +                       // 4. ГРУППА 1: Тег
        `\\b` +                                       // 5. Граница слова
        `\\s*` +                                      // 6. Пробелы
        `(?:\\(\\s*(${VALID_PRIORITIES.join('|')})\\s*\\))?` + // 7. ГРУППА 2 (внутри): Приоритет
        `\\s*` +                                      // 8. Пробелы
        `(\\*)?` +                                    // 9. ГРУППА 3 (опционально): Звездочка для закрепления
        `\\s*[:\\s]?` +                               // 10. Двоеточие/пробелы
        `(.*)`;                                       // 11. ГРУППА 4: Текст задачи

    return new RegExp(pattern, 'gmi');
}

// // TODO: обычный комментарий
// # FIXME(high): питоновский стиль
// /* BUG: блочный комментарий */
// -- NOTE: SQL-комментарий
// % REMARK: LaTeX
// * NOTE: Javadoc
// <!-- TODO: HTML -->
// // TODO: закрепленная задача

export async function scanWorkspaceForTasks(): Promise<Task[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return [];
    }

    const filesToScan = await vscode.workspace.findFiles(
        '**/*.*',
        '**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.vscode/**,**/out/**,**/coverage/**,**/*.min.*,**/*.map'
    );

    const taskRegex = buildTaskRegex();

    const tasksPromises = filesToScan.map(async (file: vscode.Uri) => {
        if (file.fsPath.includes('/node_modules/')) return [];
        
        try {
            const document = await vscode.workspace.openTextDocument(file);
            const fileTasks: Task[] = [];

            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                let match;
                taskRegex.lastIndex = 0;
                while ((match = taskRegex.exec(line.text)) !== null) {
                    const tagType = match[1].toUpperCase();
                    const parsedPriority = match[2] ? match[2].toLowerCase() : DEFAULT_PRIORITY;
                    const isPinned = match[3] === '*';
                    let taskText = match[4].trim();

                    if (taskText.endsWith('*/')) {
                        taskText = taskText.substring(0, taskText.length - 2).trim();
                    } else if (taskText.endsWith('-->')) {
                        taskText = taskText.substring(0, taskText.length - 3).trim();
                    }

                    if (taskText) {
                        fileTasks.push({
                            id: `${file.fsPath}-${i}-${match.index}`,
                            text: taskText,
                            type: tagType as Task['type'],
                            priority: (VALID_PRIORITIES.includes(parsedPriority) ? parsedPriority : DEFAULT_PRIORITY) as Task['priority'],
                            fileName: document.fileName,
                            lineNumber: i + 1,
                            isCompleted: false,
                            createdAt: new Date().toISOString(),
                            status: 'open',
                            pinned: isPinned,
                        });
                    }
                }
            }
            return fileTasks;
        } catch (error) {
            console.error(`Ошибка при парсинге файла ${file.fsPath}:`, error);
            return [];
        }
    });

    const results = await Promise.all(tasksPromises);
    return results.flat();
}
