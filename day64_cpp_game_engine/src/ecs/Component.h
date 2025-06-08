#pragma once

#include <typeinfo>
#include <cstdint>
#include <memory>
#include <unordered_map>
#include <vector>
#include "Entity.h"

namespace Engine {
    namespace ECS {

        // Component Type ID
        using ComponentTypeID = std::size_t;

        /**
         * @brief Component 基底クラス
         *
         * すべてのコンポーネントはこのクラスを継承します。
         * コンポーネントはデータのみを保持し、ロジックは持ちません。
         */
        class Component {
        public:
            Component() = default;
            virtual ~Component() = default;

            // コピー禁止（必要に応じてコンポーネントごとに実装）
            Component(const Component&) = delete;
            Component& operator=(const Component&) = delete;

            // ムーブは可能
            Component(Component&&) = default;
            Component& operator=(Component&&) = default;
        };

        /**
         * @brief Component Type Registry
         *
         * コンポーネント型のIDを管理するためのヘルパークラス
         */
        class ComponentTypeRegistry {
        private:
            static ComponentTypeID s_nextTypeID;

        public:
            template<typename T>
            static ComponentTypeID GetTypeID() {
                static ComponentTypeID typeID = s_nextTypeID++;
                return typeID;
            }
        };

        /**
         * @brief Component Manager
         *
         * エンティティとコンポーネントの関係を管理します。
         */
        class ComponentManager {
        private:
            // Entity ID -> Component Type ID -> Component のマップ
            std::unordered_map<EntityID, std::unordered_map<ComponentTypeID, std::unique_ptr<Component>>> m_components;

        public:
            ComponentManager() = default;
            ~ComponentManager() = default;

            // コンポーネント追加
            template<typename T, typename... Args>
            T* AddComponent(EntityID entityID, Args&&... args) {
                static_assert(std::is_base_of_v<Component, T>, "T must be derived from Component");

                ComponentTypeID typeID = ComponentTypeRegistry::GetTypeID<T>();
                auto component = std::make_unique<T>(std::forward<Args>(args)...);
                T* componentPtr = component.get();

                m_components[entityID][typeID] = std::move(component);

                return componentPtr;
            }

            // コンポーネント取得
            template<typename T>
            T* GetComponent(EntityID entityID) {
                static_assert(std::is_base_of_v<Component, T>, "T must be derived from Component");

                ComponentTypeID typeID = ComponentTypeRegistry::GetTypeID<T>();

                auto entityIt = m_components.find(entityID);
                if (entityIt != m_components.end()) {
                    auto componentIt = entityIt->second.find(typeID);
                    if (componentIt != entityIt->second.end()) {
                        return static_cast<T*>(componentIt->second.get());
                    }
                }

                return nullptr;
            }

            // コンポーネント存在チェック
            template<typename T>
            bool HasComponent(EntityID entityID) {
                return GetComponent<T>(entityID) != nullptr;
            }

            // コンポーネント削除
            template<typename T>
            void RemoveComponent(EntityID entityID) {
                static_assert(std::is_base_of_v<Component, T>, "T must be derived from Component");

                ComponentTypeID typeID = ComponentTypeRegistry::GetTypeID<T>();

                auto entityIt = m_components.find(entityID);
                if (entityIt != m_components.end()) {
                    entityIt->second.erase(typeID);

                    // もしエンティティにコンポーネントがなくなったら、エンティティエントリも削除
                    if (entityIt->second.empty()) {
                        m_components.erase(entityIt);
                    }
                }
            }

            // エンティティの全コンポーネント削除
            void RemoveAllComponents(EntityID entityID) {
                m_components.erase(entityID);
            }

            // 特定の型のコンポーネントを持つエンティティ一覧を取得
            template<typename T>
            std::vector<EntityID> GetEntitiesWithComponent() {
                static_assert(std::is_base_of_v<Component, T>, "T must be derived from Component");

                std::vector<EntityID> entities;
                ComponentTypeID typeID = ComponentTypeRegistry::GetTypeID<T>();

                for (const auto& [entityID, components] : m_components) {
                    if (components.find(typeID) != components.end()) {
                        entities.push_back(entityID);
                    }
                }

                return entities;
            }
        };

    } // namespace ECS
} // namespace Engine
