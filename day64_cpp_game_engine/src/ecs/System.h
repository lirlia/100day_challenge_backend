#pragma once

#include <memory>
#include <vector>
#include <typeinfo>
#include "Entity.h"
#include "Component.h"

namespace Engine {
    namespace ECS {

        // 前方宣言
        class World;

        /**
         * @brief System 基底クラス
         *
         * すべてのシステムはこのクラスを継承します。
         * システムはロジックのみを持ち、データは持ちません。
         */
        class System {
        protected:
            World* m_world = nullptr;

        public:
            System() = default;
            virtual ~System() = default;

            // コピー・ムーブ禁止
            System(const System&) = delete;
            System& operator=(const System&) = delete;
            System(System&&) = delete;
            System& operator=(System&&) = delete;

            // Worldへの参照を設定
            void SetWorld(World* world) { m_world = world; }

            // システムの初期化
            virtual void Initialize() {}

            // システムの更新（毎フレーム呼ばれる）
            virtual void Update(float deltaTime) = 0;

            // システムの終了処理
            virtual void Shutdown() {}
        };

        // System Type ID
        using SystemTypeID = std::size_t;

        /**
         * @brief System Type Registry
         *
         * システム型のIDを管理するためのヘルパークラス
         */
        class SystemTypeRegistry {
        private:
            static SystemTypeID s_nextTypeID;

        public:
            template<typename T>
            static SystemTypeID GetTypeID() {
                static SystemTypeID typeID = s_nextTypeID++;
                return typeID;
            }
        };

        /**
         * @brief System Manager
         *
         * システムの登録・管理・実行を行います。
         */
        class SystemManager {
        private:
            std::vector<std::unique_ptr<System>> m_systems;
            World* m_world = nullptr;

        public:
            SystemManager() = default;
            ~SystemManager() = default;

            // Worldへの参照を設定
            void SetWorld(World* world) { m_world = world; }

            // システム追加
            template<typename T, typename... Args>
            T* AddSystem(Args&&... args) {
                static_assert(std::is_base_of_v<System, T>, "T must be derived from System");

                auto system = std::make_unique<T>(std::forward<Args>(args)...);
                T* systemPtr = system.get();

                system->SetWorld(m_world);
                system->Initialize();

                m_systems.push_back(std::move(system));

                return systemPtr;
            }

            // システム取得
            template<typename T>
            T* GetSystem() {
                static_assert(std::is_base_of_v<System, T>, "T must be derived from System");

                for (auto& system : m_systems) {
                    T* castedSystem = dynamic_cast<T*>(system.get());
                    if (castedSystem) {
                        return castedSystem;
                    }
                }

                return nullptr;
            }

            // 全システムの更新
            void UpdateAllSystems(float deltaTime) {
                for (auto& system : m_systems) {
                    system->Update(deltaTime);
                }
            }

            // 全システムの初期化
            void InitializeAllSystems() {
                for (auto& system : m_systems) {
                    system->Initialize();
                }
            }

            // 全システムの終了処理
            void ShutdownAllSystems() {
                for (auto& system : m_systems) {
                    system->Shutdown();
                }
            }

            // 全システム削除
            void Clear() {
                ShutdownAllSystems();
                m_systems.clear();
            }
        };

    } // namespace ECS
} // namespace Engine
