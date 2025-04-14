CREATE DATABASE IF NOT EXISTS todo;
USE todo;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status TINYINT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- サンプルデータ
INSERT INTO users (name, created_at, updated_at) VALUES
('ユーザー1', NOW(), NOW()),
('ユーザー2', NOW(), NOW());

INSERT INTO todos (user_id, title, description, status, sort_order, created_at, updated_at) VALUES
(1, 'サンプルTodo1', 'これはサンプルのTodoです', 0, 0, NOW(), NOW()),
(1, 'サンプルTodo2', 'これもサンプルのTodoです', 0, 1, NOW(), NOW()),
(2, 'サンプルTodo3', 'ユーザー2のTodoです', 0, 0, NOW(), NOW());