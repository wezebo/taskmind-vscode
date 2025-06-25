import * as assert from 'assert';
import {TaskItem, TaskProvider} from "../../src/taskProvider";
import { Task } from '../../src/models';

suite('TaskProvider', () => {
  const mockTasks: Task[] = [
    {
      id: 'file1.ts-1-0',
      text: 'Fix this bug',
      type: 'BUG',
      priority: 'high',
      fileName: '/workspace/file1.ts',
      lineNumber: 2,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      status: 'open',
      pinned: false,
    },
    {
      id: 'file2.ts-2-0',
      text: 'Add feature',
      type: 'TODO',
      priority: 'medium',
      fileName: '/workspace/file2.ts',
      lineNumber: 10,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      status: 'open',
      pinned: true,
    }
  ];

  test('should group tasks by file', async () => {
    const provider = new TaskProvider('/workspace');
    provider.refresh(mockTasks);

    const children = await provider.getChildren();
    assert.strictEqual(children.length, 2);
  });

  test('should filter tasks by type', async () => {
    const provider = new TaskProvider('/workspace');
    provider.refresh(mockTasks);
    provider.filterByType('BUG');

    const groups = await provider.getChildren();
    const group = groups[0];
    const tasks = await provider.getChildren(group as any);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual((tasks[0] as TaskItem).taskData.type, 'BUG');
  });

  test('should filter tasks by search query', async () => {
    const provider = new TaskProvider('/workspace');
    provider.refresh(mockTasks);
    provider.filterBySearchQuery('feature');

    const groups = await provider.getChildren();
    assert.strictEqual(groups.length, 1);
    const tasks = await provider.getChildren(groups[0] as any);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual((tasks[0] as TaskItem).taskData.text, 'Add feature');
  });
});
