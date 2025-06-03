export interface Task {
  id: string;
  text: string;
  type: 'TODO' | 'FIXME' | 'BUG' | 'NOTE' | string;
  priority?: 'low' | 'medium' | 'high' | string;
  fileName: string;
  lineNumber: number;
  isCompleted: boolean;
  createdAt: string;
  status: 'open' | 'done';
  aiSuggestions?: string[];
}
