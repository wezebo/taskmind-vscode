export interface Task {
  id: string;
  text: string;
  type: string;
  priority: string;
  fileName: string;
  lineNumber: number;
  isCompleted: boolean;
  createdAt: string;
}