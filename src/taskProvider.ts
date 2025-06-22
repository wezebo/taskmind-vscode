import * as vscode from 'vscode';
import * as path from 'path';
import { Task } from './models';

class GroupItem extends vscode.TreeItem {
    public children: TaskItem[] = [];
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly groupType?: 'file' | 'priority',
        public readonly groupValue?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = 'groupItem';
        if (groupType === 'file') {
            this.iconPath = vscode.ThemeIcon.Folder;
            this.tooltip = groupValue;
        } else if (groupType === 'priority') {
            switch (groupValue?.toLowerCase()) {
                case 'high': this.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red')); break;
                case 'medium': this.iconPath = new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.yellow')); break;
                case 'low': this.iconPath = new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green')); break;
            }
        }
    }
}

export class TaskItem extends vscode.TreeItem {
  constructor(public readonly taskData: Task) {
    const displayText = taskData.pinned ? `★ ${taskData.text}` : taskData.text;
    super(displayText, vscode.TreeItemCollapsibleState.None);

    this.description = `(${taskData.type}) P: ${taskData.priority || 'N/A'}`;
    this.tooltip = `${path.basename(taskData.fileName)}:${ taskData.lineNumber }\nСтатус: ${taskData.status}\nПриоритет: ${taskData.priority || 'N/A'}${ taskData.pinned ? '\n✓ Закреплено' : '' }`;
    this.contextValue = 'taskItem';

        if (taskData.status === 'done') {
            this.iconPath = new vscode.ThemeIcon('check');
        }
        else if (taskData.aiSuggestions && taskData.aiSuggestions.length > 0) {
            this.iconPath = new vscode.ThemeIcon('sparkle');
        }
        else {
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

    private _allTasks: Task[] = [];
    public get allTasks(): Task[] {
        return this._allTasks;
    }

    private currentFilterType?: string;
    private currentFilterPriority?: string;
    private currentSearchQuery?: string;

  constructor(private workspaceRoot: string | undefined) {}

    public refresh(tasks: Task[]): void {
        this._allTasks = tasks;
        this._onDidChangeTreeData.fire();
    }

    public filterByType(type?: string): void {
        this.currentFilterType = type;
        this._onDidChangeTreeData.fire();
    }

    public filterByPriority(priority?: string): void {
        this.currentFilterPriority = priority;
        this._onDidChangeTreeData.fire();
    }

    public filterBySearchQuery(query?: string): void {
      this.currentSearchQuery = query;
      this._onDidChangeTreeData.fire();
    }

    public updateTask(updatedTask: Task) {
        const index = this._allTasks.findIndex(task => task.id === updatedTask.id);
        if (index !== -1) {
            this._allTasks[index] = updatedTask;
            this._onDidChangeTreeData.fire();
        }
    }


    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GroupItem | TaskItem): Thenable<vscode.TreeItem[]> {
        if (!this.workspaceRoot) {
            return Promise.resolve([]);
        }

        let tasksToDisplay = this._allTasks;

        if (this.currentFilterType && this.currentFilterType !== 'ВСЕ ТИПЫ') {
            tasksToDisplay = tasksToDisplay.filter(task => task.type.toUpperCase() === this.currentFilterType?.toUpperCase());
        }

        if (this.currentFilterPriority && this.currentFilterPriority !== 'ВСЕ ПРИОРИТЕТЫ') {
            tasksToDisplay = tasksToDisplay.filter(task => (task.priority || 'N/A').toLowerCase() === this.currentFilterPriority?.toLowerCase());
        }

      if (this.currentSearchQuery && this.currentSearchQuery.trim() !== '') {
        const searchQuery = this.currentSearchQuery.toLowerCase().trim();
        tasksToDisplay = tasksToDisplay.filter(
            (task) =>
                task.text.toLowerCase().includes(searchQuery) ||
                task.type.toLowerCase().includes(searchQuery) ||
                (task.priority || '').toLowerCase().includes(searchQuery) ||
                path.basename(task.fileName).toLowerCase().includes(searchQuery)
        );
      }

        if (element instanceof TaskItem && element.taskData.aiSuggestions) {
            return Promise.resolve(
                element.taskData.aiSuggestions.map((suggestion, index) => {
                    const item = new vscode.TreeItem(
                        `💡 Предложение ${index + 1}`,
                        vscode.TreeItemCollapsibleState.None
                    );
                    item.command = {
                        command: 'intelligentTasks.showAISuggestion',
                        title: 'Показать предложение ИИ',
                        arguments: [element.taskData, suggestion]
                    };
                    return item;
                })
            );
        }

        if (element instanceof GroupItem) {
          element.children.sort((a, b) => {
            if (a.taskData.pinned !== b.taskData.pinned) {
              return a.taskData.pinned ? -1 : 1;
            }
            return a.taskData.text.localeCompare(b.taskData.text);
          });
          return Promise.resolve(element.children);
        } else {
            const groupedByFile: { [filePath: string]: TaskItem[] } = {};
            tasksToDisplay.forEach(task => {
                if (!groupedByFile[task.fileName]) {
                    groupedByFile[task.fileName] = [];
                }
                groupedByFile[task.fileName].push(new TaskItem(task));
            });

      Object.keys(groupedByFile).forEach((filePath) => {
        groupedByFile[filePath].sort((a, b) => {
          if (a.taskData.pinned !== b.taskData.pinned) {
            return a.taskData.pinned ? -1 : 1;
          }
          return a.taskData.text.localeCompare(b.taskData.text);
        });
      });

      const groupItems = Object.keys(groupedByFile).map((filePath) => {
        const relativePath = vscode.workspace.asRelativePath(filePath, false);
        const groupItem = new GroupItem(
          `${relativePath} (${groupedByFile[filePath].length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'file',
          filePath
        );
        groupItem.children = groupedByFile[filePath];
        return groupItem;
      });
      return Promise.resolve(groupItems.sort((a, b) => a.label.localeCompare(b.label))); // Сортируем файлы
    }
  }
}
