#pragma once

#include "../System.h"
#include "../components/Transform.h"
#include <iostream>
#include <cmath>

namespace Engine {
    namespace ECS {

        /**
         * @brief Test System
         *
         * ECSシステムの動作確認用テストシステム
         */
        class TestSystem : public System {
        private:
            float m_elapsedTime = 0.0f;

        public:
            TestSystem() = default;
            ~TestSystem() override = default;

            void Initialize() override {
                std::cout << "TestSystem初期化完了" << std::endl;
            }

            void Update(float deltaTime) override {
                m_elapsedTime += deltaTime;

                if (!m_world) return;

                // 5秒ごとにデバッグ情報を出力
                static float lastDebugTime = 0.0f;
                if (m_elapsedTime - lastDebugTime >= 5.0f) {
                    std::cout << "TestSystem Update - Elapsed: " << m_elapsedTime << "s" << std::endl;

                    // Transformコンポーネントを持つエンティティを検索
                    auto entities = m_world->GetEntitiesWithComponent<Transform>();
                    std::cout << "Entities with Transform: " << entities.size() << std::endl;

                    for (EntityID entityID : entities) {
                        auto* transform = m_world->GetComponent<Transform>(entityID);
                        if (transform) {
                            std::cout << "Entity " << entityID << " Transform: "
                                      << "Position(" << transform->position.x << ", "
                                      << transform->position.y << ", " << transform->position.z << ")" << std::endl;
                        }
                    }

                    lastDebugTime = m_elapsedTime;
                }

                // Transform を持つエンティティを少しずつ動かす
                auto entities = m_world->GetEntitiesWithComponent<Transform>();
                for (EntityID entityID : entities) {
                    auto* transform = m_world->GetComponent<Transform>(entityID);
                    if (transform) {
                        // ゆっくりと円運動
                        transform->position.x = 100.0f + 50.0f * cos(m_elapsedTime);
                        transform->position.y = 100.0f + 50.0f * sin(m_elapsedTime);
                        transform->rotation.z += deltaTime * 30.0f; // 30度/秒で回転
                    }
                }
            }

            void Shutdown() override {
                std::cout << "TestSystem終了処理完了" << std::endl;
            }
        };

    } // namespace ECS
} // namespace Engine
