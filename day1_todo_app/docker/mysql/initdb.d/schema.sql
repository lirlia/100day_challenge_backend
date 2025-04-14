-- day1_todo_app/docker/mysql/initdb.d/schema.sql
-- データベースがなければ作成 (docker-compose の environment で指定しているので基本的には不要だが念のため)
-- CREATE DATABASE IF NOT EXISTS todo_app_db;
-- USE todo_app_db;
-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'ユーザーID',
  name VARCHAR(255) NOT NULL UNIQUE COMMENT 'ユーザー名',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時'
) COMMENT = 'ユーザー';
-- ToDo テーブル
CREATE TABLE IF NOT EXISTS todos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'ToDo ID',
  user_id BIGINT NOT NULL COMMENT 'ユーザーID',
  title VARCHAR(255) NOT NULL COMMENT 'タイトル',
  description TEXT COMMENT '詳細',
  status ENUM(
    'not started',
    'in progress',
    'done',
    'pending',
    'cancel'
  ) NOT NULL DEFAULT 'not started' COMMENT '状態',
  sort_order DOUBLE NOT NULL DEFAULT 0 COMMENT 'ソート順',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
  archived_at TIMESTAMP NULL DEFAULT NULL COMMENT 'アーカイブ日時',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_archived_sort (user_id, archived_at, sort_order),
  -- 検索用インデックス
  INDEX idx_user_created (user_id, created_at) -- デフォルトソート用インデックス
) COMMENT = 'ToDo';
-- 初期ユーザーデータ投入
INSERT INTO users (name)
VALUES ('User A'),
  ('User B'),
  ('User C') ON DUPLICATE KEY
UPDATE name = name;
-- 既に存在する場合は何もしない
-- (オプション) 初期ToDoデータ投入 (例)
-- INSERT INTO todos (user_id, title, description, status, sort_order) VALUES
-- (1, '最初のタスク', 'これは最初のタスクです', 'not started', 1.0),
-- (1, '次のタスク', 'これは2番目のタスクです', 'inprogress', 2.0),
-- (2, 'ユーザーBのタスク', '', 'done', 1.0);
