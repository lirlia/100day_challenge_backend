#pragma once

#include "../Component.h"
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

namespace Engine {
    namespace ECS {

        /**
         * @brief Transform コンポーネント
         *
         * エンティティの位置、回転、スケールを管理します。
         */
        class Transform : public Component {
        public:
            glm::vec3 position;
            glm::vec3 rotation; // オイラー角（度単位）
            glm::vec3 scale;

        public:
            Transform()
                : position(0.0f, 0.0f, 0.0f)
                , rotation(0.0f, 0.0f, 0.0f)
                , scale(1.0f, 1.0f, 1.0f) {
            }

            Transform(const glm::vec3& pos)
                : position(pos)
                , rotation(0.0f, 0.0f, 0.0f)
                , scale(1.0f, 1.0f, 1.0f) {
            }

            Transform(const glm::vec3& pos, const glm::vec3& rot, const glm::vec3& scl)
                : position(pos)
                , rotation(rot)
                , scale(scl) {
            }

            ~Transform() override = default;

            // ワールド変換行列を取得
            glm::mat4 GetModelMatrix() const {
                glm::mat4 model = glm::mat4(1.0f);

                // 移動
                model = glm::translate(model, position);

                // 回転（Z-Y-X順）
                model = glm::rotate(model, glm::radians(rotation.z), glm::vec3(0.0f, 0.0f, 1.0f));
                model = glm::rotate(model, glm::radians(rotation.y), glm::vec3(0.0f, 1.0f, 0.0f));
                model = glm::rotate(model, glm::radians(rotation.x), glm::vec3(1.0f, 0.0f, 0.0f));

                // スケール
                model = glm::scale(model, scale);

                return model;
            }

            // 前方ベクトルを取得
            glm::vec3 GetForward() const {
                glm::mat4 rotMatrix = glm::mat4(1.0f);
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.z), glm::vec3(0.0f, 0.0f, 1.0f));
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.y), glm::vec3(0.0f, 1.0f, 0.0f));
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.x), glm::vec3(1.0f, 0.0f, 0.0f));
                return glm::normalize(glm::vec3(rotMatrix * glm::vec4(0.0f, 0.0f, -1.0f, 0.0f)));
            }

            // 右ベクトルを取得
            glm::vec3 GetRight() const {
                glm::mat4 rotMatrix = glm::mat4(1.0f);
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.z), glm::vec3(0.0f, 0.0f, 1.0f));
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.y), glm::vec3(0.0f, 1.0f, 0.0f));
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.x), glm::vec3(1.0f, 0.0f, 0.0f));
                return glm::normalize(glm::vec3(rotMatrix * glm::vec4(1.0f, 0.0f, 0.0f, 0.0f)));
            }

            // 上ベクトルを取得
            glm::vec3 GetUp() const {
                glm::mat4 rotMatrix = glm::mat4(1.0f);
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.z), glm::vec3(0.0f, 0.0f, 1.0f));
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.y), glm::vec3(0.0f, 1.0f, 0.0f));
                rotMatrix = glm::rotate(rotMatrix, glm::radians(rotation.x), glm::vec3(1.0f, 0.0f, 0.0f));
                return glm::normalize(glm::vec3(rotMatrix * glm::vec4(0.0f, 1.0f, 0.0f, 0.0f)));
            }
        };

        /**
         * @brief Tag コンポーネント
         *
         * エンティティに名前やタグを付けるための軽量コンポーネント
         */
        class Tag : public Component {
        public:
            std::string name;

        public:
            Tag() : name("Entity") {}
            Tag(const std::string& tagName) : name(tagName) {}
            ~Tag() override = default;
        };

    } // namespace ECS
} // namespace Engine
