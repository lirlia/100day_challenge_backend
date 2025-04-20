# Day 9: Collaborative Online Text Editor

## Overview

This project implements a real-time collaborative online text editor similar to Google Docs, allowing multiple users to edit the same document simultaneously. It utilizes Operational Transformation (OT) via the `ot.js` library to handle concurrent edits and displays each user's cursor position.

## Core Features

-   **Real-time Collaboration:** Multiple users can edit a single text document concurrently. Changes are synchronized in real-time using OT.
-   **User Cursor Display:** Each connected user's cursor position is shown in the editor with a distinct color.
-   **User Identification:** Different browser tabs/windows are treated as separate users. Each user is assigned a unique ID and color upon connection.
-   **Server-Side Document State:** The latest version of the document is maintained on the server (in memory for simplicity).

## Technology Stack

-   **Framework:** Next.js (App Router)
-   **Language:** TypeScript
-   **Real-time Engine:** Node.js with `ws` (WebSocket library)
-   **OT Library:** `ot.js`
-   **Styling:** Tailwind CSS

## Architecture

-   **Frontend (Next.js Client):**
    -   Connects to the WebSocket server on page load.
    -   Receives initial document state and revision number.
    -   Sends local edits (as OT operations) and cursor movements to the server via WebSocket.
    -   Receives operations and cursor updates from other users via WebSocket and applies them locally using `ot.js`.
    -   Displays the text content and colored cursors of other users.
-   **Backend (Node.js WebSocket Server):**
    -   Manages WebSocket connections.
    -   Maintains the authoritative document state (content, revision) and connected client information (ID, color, cursor position) in memory.
    -   Receives OT operations from clients, applies them to the server document using `ot.js`, and updates the revision number.
    -   Transforms and broadcasts operations to other connected clients.
    -   Receives and broadcasts cursor position updates.
    -   Handles client disconnections.

## Setup and Running

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Start the WebSocket server:**
    ```bash
    npm run start:ws
    ```
3.  **Start the Next.js development server (in a separate terminal):**
    ```bash
    npm run dev
    ```
4.  Open multiple browser tabs/windows to `http://localhost:3001` to simulate multiple users.

## Notes

-   `ot.js` is used for the Operational Transformation logic.
-   The WebSocket server runs as a separate Node.js process. 