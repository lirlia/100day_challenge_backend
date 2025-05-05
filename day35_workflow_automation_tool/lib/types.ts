export interface User {
    id: number;
    name: string;
    email: string;
    created_at: string;
    updated_at: string;
}

export interface Task {
    id: number;
    workflow_id: number;
    name: string;
    description: string | null;
    assigned_user_id: number | null;
    created_by_user_id: number | null;
    due_date: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'on_hold';
    order_index: number;
    created_at: string;
    updated_at: string;
    assigned_user_name?: string | null;
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
     description: string | null;
     created_by_user_id: number | null;
     created_at: string;
     updated_at: string;
     creator_name?: string | null;
     total_tasks?: number;
     completed_tasks?: number;
}

export interface TaskFormData {
    name: string;
    description: string;
    assigned_user_id: number | null;
    due_date: string; // Expect YYYY-MM-DD
}
