export interface User {
    id: number;
    name: string;
    email?: string | null;
    created_at?: string;
}

export interface Task {
    id: number;
    workflow_id: number;
    name: string;
    description?: string | null;
    status: 'ToDo' | 'InProgress' | 'Done' | 'Blocked';
    assigned_user_id?: number | null;
    due_date?: string | null;
    created_at?: string;
    updated_at?: string;
    assigned_user?: User | null;
    dependencies?: TaskDependency[];
    dependents?: TaskDependency[];
}

export interface TaskDependency {
    task_id: number;
    depends_on_task_id: number;
}

export interface WorkflowDetail {
    id: number;
    name: string;
    description: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    creator_name: string | null;
    total_tasks: number;
    completed_tasks: number;
    tasks: Task[];
    dependencies: TaskDependency[];
}

export interface Workflow {
    id: number;
    name: string;
    description?: string | null;
    created_by_user_id: number;
    created_at?: string;
    updated_at?: string;
    task_counts?: {
        total: number;
        ToDo: number;
        InProgress: number;
        Done: number;
        Blocked: number;
    };
}

export interface TaskFormData {
    name: string;
    description: string | null;
    assigned_user_id: number | null;
    due_date: string | null;
}

export interface WorkflowSubmitData {
    name: string;
    description: string;
    created_by_user_id: number;
}
