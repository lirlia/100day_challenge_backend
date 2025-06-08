#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace Engine {
    namespace ECS {

        // Entity ID型定義
        using EntityID = uint32_t;

        // 無効なEntity ID
        constexpr EntityID INVALID_ENTITY = 0;

        /**
         * @brief Entity クラス
         *
         * ECSアーキテクチャにおけるEntity（実体）を表現します。
         * Entityは軽量な識別子として機能し、コンポーネントを保持するコンテナです。
         */
        class Entity {
        private:
            EntityID m_id;
            std::string m_name;
            bool m_active;

        public:
            // コンストラクタ
            Entity();
            explicit Entity(EntityID id);
            Entity(EntityID id, const std::string& name);

            // デストラクタ
            ~Entity() = default;

            // コピー・ムーブコンストラクタ
            Entity(const Entity&) = default;
            Entity(Entity&&) = default;
            Entity& operator=(const Entity&) = default;
            Entity& operator=(Entity&&) = default;

            // アクセサー
            EntityID GetID() const { return m_id; }
            const std::string& GetName() const { return m_name; }
            void SetName(const std::string& name) { m_name = name; }

            bool IsActive() const { return m_active; }
            void SetActive(bool active) { m_active = active; }

            // 比較演算子
            bool operator==(const Entity& other) const { return m_id == other.m_id; }
            bool operator!=(const Entity& other) const { return m_id != other.m_id; }
            bool operator<(const Entity& other) const { return m_id < other.m_id; }

            // 有効性チェック
            bool IsValid() const { return m_id != INVALID_ENTITY; }
        };

        /**
         * @brief Entity Manager クラス
         *
         * Entityの生成・削除・管理を行います。
         */
        class EntityManager {
        private:
            EntityID m_nextID;
            std::vector<Entity> m_entities;
            std::vector<EntityID> m_freeIDs;

        public:
            EntityManager();
            ~EntityManager() = default;

            // Entity生成
            Entity CreateEntity();
            Entity CreateEntity(const std::string& name);

            // Entity削除
            void DestroyEntity(EntityID id);
            void DestroyEntity(const Entity& entity);

            // Entity取得
            Entity* GetEntity(EntityID id);
            const Entity* GetEntity(EntityID id) const;

            // 全Entity取得
            const std::vector<Entity>& GetAllEntities() const { return m_entities; }

            // Entity数取得
            size_t GetEntityCount() const;

            // 全Entity削除
            void Clear();

            // Entity存在チェック
            bool EntityExists(EntityID id) const;
        };

    } // namespace ECS
} // namespace Engine
