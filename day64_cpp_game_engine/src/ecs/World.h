#pragma once

#include <memory>
#include <iostream>
#include "Entity.h"
#include "Component.h"
#include "System.h"

namespace Engine {
    namespace ECS {

        /**
         * @brief World クラス
         *
         * ECSアーキテクチャの中核クラス。
         * Entity、Component、Systemを統合管理します。
         */
        class World {
        private:
            EntityManager m_entityManager;
            ComponentManager m_componentManager;
            SystemManager m_systemManager;

        public:
            World() {
                m_systemManager.SetWorld(this);
                std::cout << "World初期化完了" << std::endl;
            }

            ~World() {
                std::cout << "World終了処理開始" << std::endl;
                m_systemManager.Clear();
                m_componentManager.RemoveAllComponents(0); // 全コンポーネント削除
                m_entityManager.Clear();
                std::cout << "World終了処理完了" << std::endl;
            }

            // コピー・ムーブ禁止
            World(const World&) = delete;
            World& operator=(const World&) = delete;
            World(World&&) = delete;
            World& operator=(World&&) = delete;

            // ========== Entity関連 ==========

            Entity CreateEntity() {
                return m_entityManager.CreateEntity();
            }

            Entity CreateEntity(const std::string& name) {
                return m_entityManager.CreateEntity(name);
            }

            void DestroyEntity(EntityID id) {
                m_componentManager.RemoveAllComponents(id);
                m_entityManager.DestroyEntity(id);
            }

            void DestroyEntity(const Entity& entity) {
                DestroyEntity(entity.GetID());
            }

            Entity* GetEntity(EntityID id) {
                return m_entityManager.GetEntity(id);
            }

            const Entity* GetEntity(EntityID id) const {
                return m_entityManager.GetEntity(id);
            }

            const std::vector<Entity>& GetAllEntities() const {
                return m_entityManager.GetAllEntities();
            }

            size_t GetEntityCount() const {
                return m_entityManager.GetEntityCount();
            }

            bool EntityExists(EntityID id) const {
                return m_entityManager.EntityExists(id);
            }

            // ========== Component関連 ==========

            template<typename T, typename... Args>
            T* AddComponent(EntityID entityID, Args&&... args) {
                if (!EntityExists(entityID)) {
                    std::cerr << "Entity ID " << entityID << " が存在しません" << std::endl;
                    return nullptr;
                }
                return m_componentManager.AddComponent<T>(entityID, std::forward<Args>(args)...);
            }

            template<typename T, typename... Args>
            T* AddComponent(const Entity& entity, Args&&... args) {
                return AddComponent<T>(entity.GetID(), std::forward<Args>(args)...);
            }

            template<typename T>
            T* GetComponent(EntityID entityID) {
                return m_componentManager.GetComponent<T>(entityID);
            }

            template<typename T>
            T* GetComponent(const Entity& entity) {
                return GetComponent<T>(entity.GetID());
            }

            template<typename T>
            bool HasComponent(EntityID entityID) {
                return m_componentManager.HasComponent<T>(entityID);
            }

            template<typename T>
            bool HasComponent(const Entity& entity) {
                return HasComponent<T>(entity.GetID());
            }

            template<typename T>
            void RemoveComponent(EntityID entityID) {
                m_componentManager.RemoveComponent<T>(entityID);
            }

            template<typename T>
            void RemoveComponent(const Entity& entity) {
                RemoveComponent<T>(entity.GetID());
            }

            template<typename T>
            std::vector<EntityID> GetEntitiesWithComponent() {
                return m_componentManager.GetEntitiesWithComponent<T>();
            }

            // ========== System関連 ==========

            template<typename T, typename... Args>
            T* AddSystem(Args&&... args) {
                return m_systemManager.AddSystem<T>(std::forward<Args>(args)...);
            }

            template<typename T>
            T* GetSystem() {
                return m_systemManager.GetSystem<T>();
            }

            void UpdateAllSystems(float deltaTime) {
                m_systemManager.UpdateAllSystems(deltaTime);
            }

            void InitializeAllSystems() {
                m_systemManager.InitializeAllSystems();
            }

            void ShutdownAllSystems() {
                m_systemManager.ShutdownAllSystems();
            }

            // ========== ヘルパーメソッド ==========

            // エンティティとコンポーネントを一度に作成
            template<typename... Components>
            Entity CreateEntityWithComponents(const std::string& name = "Entity") {
                Entity entity = CreateEntity(name);
                (AddComponent<Components>(entity), ...);
                return entity;
            }

            // 複数のコンポーネントを持つエンティティを検索
            template<typename... Components>
            std::vector<EntityID> GetEntitiesWithComponents() {
                std::vector<EntityID> result;
                const auto& allEntities = GetAllEntities();

                for (const auto& entity : allEntities) {
                    if (entity.IsValid() && (HasComponent<Components>(entity.GetID()) && ...)) {
                        result.push_back(entity.GetID());
                    }
                }

                return result;
            }

            // デバッグ情報出力
            void PrintDebugInfo() const {
                std::cout << "=== World Debug Info ===" << std::endl;
                std::cout << "Entity Count: " << GetEntityCount() << std::endl;

                const auto& entities = GetAllEntities();
                for (const auto& entity : entities) {
                    if (entity.IsValid()) {
                        std::cout << "Entity ID: " << entity.GetID()
                                  << ", Name: " << entity.GetName()
                                  << ", Active: " << (entity.IsActive() ? "Yes" : "No") << std::endl;
                    }
                }
                std::cout << "========================" << std::endl;
            }
        };

    } // namespace ECS
} // namespace Engine
