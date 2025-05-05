# Day 35: Workflow Automation Tool

## Overview

This project implements a workflow automation tool using Next.js, TypeScript, Tailwind CSS (with Glassmorphism design), Zustand, and better-sqlite3. It allows users to define workflows, manage tasks within them, set dependencies between tasks, and visualize the progress on a Kanban board.

## Features

-   **User Switching:** Simple user switching mechanism via a dropdown in the header (using Zustand for state management).
-   **Workflow Management:**
    -   List workflows with task statistics (total/completed count).
    -   Create new workflows via a modal.
    -   View workflow details (name, description, creator, dates).
    -   (Edit/Delete workflow UI is stubbed but not implemented).
-   **Task Management (within a workflow):**
    -   Visualize tasks on a Kanban board divided by status (Pending, In Progress, Completed, On Hold).
    -   Change task status using a dropdown menu on the task card (replaced drag-and-drop due to library issues).
    -   Create new tasks via a modal.
    -   Edit existing tasks (name, description, assignee, due date) via a modal.
    -   Delete tasks (with confirmation).
-   **Task Dependencies:**
    -   Define prerequisite tasks for a task.
    -   Add dependencies via a modal on the task card.
    -   View dependencies listed on the task card.
    -   Remove dependencies.
    -   Backend validation prevents status changes if prerequisites are not met.
    -   Backend validation prevents creating circular dependencies.
-   **Database:**
    -   Uses SQLite (`db/dev.db`) with `better-sqlite3`.
    -   Schema includes `users`, `workflows`, `tasks`, `task_dependencies`.
    -   Automatic `updated_at` timestamping via triggers.
-   **API:**
    -   Next.js Route Handlers for CRUD operations on workflows, tasks, and dependencies.
    -   Includes endpoints for fetching workflow lists with statistics and workflow details with tasks/dependencies.
-   **Styling:**
    -   Tailwind CSS with a Glassmorphism theme (blurred backgrounds, subtle borders).
    -   Responsive design.
-   **State Management:**
    -   Zustand for managing the current user selection and user list.
    -   React `useState` and `useCallback` for component-level state and handlers.
-   **UI Components:**
    -   Header with user switcher.
    -   Workflow list page with cards.
    -   Workflow detail page with Kanban board.
    -   Task cards with details, status dropdown, and dependency management.
    -   Reusable Modal component.
    -   Forms for creating/editing workflows and tasks, and adding dependencies.
    -   Notifications using `react-toastify`.

## Known Issues / Limitations

-   Workflow editing and deletion UI is not implemented.
-   Drag-and-drop for status changes was replaced with a dropdown due to persistent issues with `@hello-pangea/dnd` and React 18/StrictMode.
-   Error handling is basic.
-   No real authentication.

## Setup and Running

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Run the development server:**
    ```bash
    npm run dev -- -p 3001
    ```
3.  Open [http://localhost:3001](http://localhost:3001) in your browser.

## Database Schema (`lib/db.ts`)

-   **`users`**: `id`, `name`, `email`, `created_at`, `updated_at`
-   **`workflows`**: `id`, `name`, `description`, `created_by_user_id`, `created_at`, `updated_at`
-   **`tasks`**: `id`, `workflow_id`, `name`, `description`, `assigned_user_id`, `created_by_user_id`, `due_date`, `status`, `order_index`, `created_at`, `updated_at`
-   **`task_dependencies`**: `task_id`, `depends_on_task_id` (Composite PK, ON DELETE CASCADE)
