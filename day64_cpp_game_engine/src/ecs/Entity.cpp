#include "Entity.h"
#include <algorithm>
#include <vector>
#include <iostream>

namespace Engine {
    namespace ECS {

        // Entity クラス実装
        Entity::Entity() : m_id(INVALID_ENTITY), m_name("Entity"), m_active(true) {
        }

        Entity::Entity(EntityID id) : m_id(id), m_name("Entity"), m_active(true) {
        }

        Entity::Entity(EntityID id, const std::string& name) : m_id(id), m_name(name), m_active(true) {
        }

        // EntityManager クラス実装
        EntityManager::EntityManager() : m_nextID(1) {
            // ID 0 は INVALID_ENTITY として予約
            std::cout << "EntityManager初期化完了" << std::endl;
        }

        Entity EntityManager::CreateEntity() {
            return CreateEntity("Entity");
        }

        Entity EntityManager::CreateEntity(const std::string& name) {
            EntityID newID;

            // 再利用可能なIDがある場合は使用
            if (!m_freeIDs.empty()) {
                newID = m_freeIDs.back();
                m_freeIDs.pop_back();
            } else {
                newID = m_nextID++;
            }

            // 新しいEntityを作成
            Entity newEntity(newID, name);

            // ベクターのサイズを調整
            if (newID >= m_entities.size()) {
                m_entities.resize(newID + 1);
            }

            m_entities[newID] = newEntity;

            std::cout << "Entity作成: ID=" << newID << ", Name=" << name << std::endl;
            return newEntity;
        }

        void EntityManager::DestroyEntity(EntityID id) {
            if (id == INVALID_ENTITY || id >= m_entities.size()) {
                std::cerr << "無効なEntity ID: " << id << std::endl;
                return;
            }

            // Entityを無効化
            m_entities[id] = Entity(); // デフォルトコンストラクタでINVALID_ENTITYに

            // IDを再利用可能リストに追加
            m_freeIDs.push_back(id);

            std::cout << "Entity削除: ID=" << id << std::endl;
        }

        void EntityManager::DestroyEntity(const Entity& entity) {
            DestroyEntity(entity.GetID());
        }

        Entity* EntityManager::GetEntity(EntityID id) {
            if (id == INVALID_ENTITY || id >= m_entities.size() || !m_entities[id].IsValid()) {
                return nullptr;
            }
            return &m_entities[id];
        }

        const Entity* EntityManager::GetEntity(EntityID id) const {
            if (id == INVALID_ENTITY || id >= m_entities.size() || !m_entities[id].IsValid()) {
                return nullptr;
            }
            return &m_entities[id];
        }

        size_t EntityManager::GetEntityCount() const {
            size_t count = 0;
            for (const auto& entity : m_entities) {
                if (entity.IsValid()) {
                    count++;
                }
            }
            return count;
        }

        void EntityManager::Clear() {
            m_entities.clear();
            m_freeIDs.clear();
            m_nextID = 1;
            std::cout << "全Entity削除完了" << std::endl;
        }

        bool EntityManager::EntityExists(EntityID id) const {
            return GetEntity(id) != nullptr;
        }

    } // namespace ECS
} // namespace Engine
