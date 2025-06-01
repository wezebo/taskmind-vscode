import * as vscode from 'vscode';
import * as path from 'path';
import { Task } from './models';

class GroupItem extends vscode.TreeItem {
    public children: TaskItem[] = [];
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = 'groupItem';
        if (filePath) {
            this.iconPath = vscode.ThemeIcon.Folder;
            this.tooltip = filePath;
        }
    }
}

class TaskItem extends vscode.TreeItem {
    constructor(
        public readonly taskData: Task
    ) {
        super(taskData.text, vscode.TreeItemCollapsibleState.None);
        this.description = `(${taskData.type}) ${path.basename(taskData.fileName)}:${taskData.lineNumber}`;
        this.tooltip = `${taskData.fileName}\nСтрока: ${taskData.lineNumber}\nСтатус: ${taskData.status}\nПриоритет: ${taskData.priority || 'N/A'}`;
        this.contextValue = 'taskItem';

        if (taskData.status === 'done') {
            this.iconPath = new vscode.ThemeIcon('check');
        } else {
            switch (taskData.type.toUpperCase()) {
                case 'TODO': this.iconPath = new vscode.ThemeIcon('checklist'); break;
                case 'FIXME': this.iconPath = new vscode.ThemeIcon('tools'); break;
                case 'BUG': this.iconPath = new vscode.ThemeIcon('bug'); break;
                case 'NOTE': this.iconPath = new vscode.ThemeIcon('notebook'); break;
                default: this.iconPath = new vscode.ThemeIcon('tag'); break;
            }
        }

        this.command = {
            command: 'vscode.open',
            title: 'Открыть файл',
            arguments: [
                vscode.Uri.file(taskData.fileName),
                {
                    selection: new vscode.Range(taskData.lineNumber - 1, 0, taskData.lineNumber - 1, 0),
                    preview: false,
                }
            ]
        };
    }
}


export class TaskProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private allTasks: Task[] = [];
    private currentFilterType?: string;

    constructor(private workspaceRoot: string | undefined) {}

    public refresh(tasks: Task[]): void {
        this.allTasks = tasks;
        this._onDidChangeTreeData.fire();
    }

    public filterByType(type?: string): void {
        this.currentFilterType = type;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GroupItem | TaskItem): Thenable<vscode.TreeItem[]> {
        if (!this.workspaceRoot) {
            return Promise.resolve([]);
        }

        let tasksToDisplay = this.allTasks;
        if (this.currentFilterType && this.currentFilterType !== 'ВСЕ ТИПЫ') {
            tasksToDisplay = tasksToDisplay.filter(task => task.type.toUpperCase() === this.currentFilterType?.toUpperCase());
        }

        if (element instanceof GroupItem) {
            return Promise.resolve(element.children);
        } else {
            const groupedByFile: { [filePath: string]: TaskItem[] } = {};
            tasksToDisplay.forEach(task => {
                if (!groupedByFile[task.fileName]) {
                    groupedByFile[task.fileName] = [];
                }
                groupedByFile[task.fileName].push(new TaskItem(task));
            });

            const groupItems = Object.keys(groupedByFile).map(filePath => {
                const relativePath = vscode.workspace.asRelativePath(filePath, false);
                const groupItem = new GroupItem(
                    `${relativePath} (${groupedByFile[filePath].length})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    filePath
                );
                groupItem.children = groupedByFile[filePath];
                return groupItem;
            });
            return Promise.resolve(groupItems);
        }
    }
}

