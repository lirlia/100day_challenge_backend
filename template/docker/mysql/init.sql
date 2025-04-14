-- データベースの作成
CREATE DATABASE IF NOT EXISTS app;

-- ユーザーの作成と権限付与
CREATE USER IF NOT EXISTS 'user'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON app.* TO 'user'@'%';
FLUSH PRIVILEGES;