#include <iostream>
#include <SDL2/SDL.h>
#include <glad/glad.h>
#include "imgui.h"
#include "imgui_impl_sdl2.h"
#include "imgui_impl_opengl3.h"

// ECS インクルード
#include "ecs/World.h"
#include "ecs/components/Transform.h"
#include "ecs/systems/TestSystem.h"

// ウィンドウの基本設定
const int WINDOW_WIDTH = 1280;
const int WINDOW_HEIGHT = 720;
const char* WINDOW_TITLE = "Day64 - C++ Game Engine";

class GameEngine {
private:
    SDL_Window* window = nullptr;
    SDL_GLContext glContext = nullptr;
    bool isRunning = false;

    // ECS World
    std::unique_ptr<Engine::ECS::World> m_world;

    // デルタタイム計算用
    Uint64 m_lastFrameTime = 0;

public:
    bool Initialize() {
        // SDL初期化
        if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER | SDL_INIT_GAMECONTROLLER) != 0) {
            std::cerr << "SDL初期化エラー: " << SDL_GetError() << std::endl;
            return false;
        }

        // OpenGL 3.3コア設定
        SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, 0);
        SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
        SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
        SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);

        // ダブルバッファリング有効
        SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
        SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
        SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);

        // ウィンドウ作成
        SDL_WindowFlags window_flags = (SDL_WindowFlags)(SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
        window = SDL_CreateWindow(
            WINDOW_TITLE,
            SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
            WINDOW_WIDTH, WINDOW_HEIGHT,
            window_flags
        );

        if (!window) {
            std::cerr << "ウィンドウ作成エラー: " << SDL_GetError() << std::endl;
            return false;
        }

        // OpenGLコンテキスト作成
        glContext = SDL_GL_CreateContext(window);
        if (!glContext) {
            std::cerr << "OpenGLコンテキスト作成エラー: " << SDL_GetError() << std::endl;
            return false;
        }

        SDL_GL_MakeCurrent(window, glContext);
        SDL_GL_SetSwapInterval(1); // V-Sync有効

        // GLAD初期化
        if (!gladLoadGL()) {
            std::cerr << "GLAD初期化エラー" << std::endl;
            return false;
        }

        // OpenGL情報表示
        std::cout << "OpenGL Version: " << glGetString(GL_VERSION) << std::endl;
        std::cout << "GLSL Version: " << glGetString(GL_SHADING_LANGUAGE_VERSION) << std::endl;
        std::cout << "Renderer: " << glGetString(GL_RENDERER) << std::endl;

        // Dear ImGui初期化
        IMGUI_CHECKVERSION();
        ImGui::CreateContext();
        ImGuiIO& io = ImGui::GetIO(); (void)io;
        io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;     // キーボードコントロール有効
        // io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;      // ドッキング有効 (今回は無効)

        // Dear ImGuiスタイル設定
        ImGui::StyleColorsDark();

        // プラットフォーム/レンダラー バインディング設定
        ImGui_ImplSDL2_InitForOpenGL(window, glContext);
        ImGui_ImplOpenGL3_Init("#version 330");

        // ECS World初期化
        m_world = std::make_unique<Engine::ECS::World>();

        // テストエンティティ作成
        auto entity1 = m_world->CreateEntity("TestEntity1");
        m_world->AddComponent<Engine::ECS::Transform>(entity1,
            glm::vec3(100.0f, 100.0f, 0.0f));
        m_world->AddComponent<Engine::ECS::Tag>(entity1, "TestTag1");

        auto entity2 = m_world->CreateEntity("TestEntity2");
        m_world->AddComponent<Engine::ECS::Transform>(entity2,
            glm::vec3(200.0f, 150.0f, 0.0f));
        m_world->AddComponent<Engine::ECS::Tag>(entity2, "TestTag2");

        // テストシステム追加
        m_world->AddSystem<Engine::ECS::TestSystem>();

        // デルタタイム初期化
        m_lastFrameTime = SDL_GetPerformanceCounter();

        std::cout << "ゲームエンジン初期化完了!" << std::endl;
        isRunning = true;
        return true;
    }

    void Run() {
        while (isRunning) {
            ProcessEvents();
            Update();
            Render();
        }
    }

    void ProcessEvents() {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            ImGui_ImplSDL2_ProcessEvent(&event);

            switch (event.type) {
                case SDL_QUIT:
                    isRunning = false;
                    break;
                case SDL_WINDOWEVENT:
                    if (event.window.event == SDL_WINDOWEVENT_CLOSE && event.window.windowID == SDL_GetWindowID(window))
                        isRunning = false;
                    break;
                case SDL_KEYDOWN:
                    if (event.key.keysym.sym == SDLK_ESCAPE)
                        isRunning = false;
                    break;
            }
        }
    }

    void Update() {
        // デルタタイム計算
        Uint64 currentTime = SDL_GetPerformanceCounter();
        float deltaTime = (float)(currentTime - m_lastFrameTime) / SDL_GetPerformanceFrequency();
        m_lastFrameTime = currentTime;

        // ECS更新
        if (m_world) {
            m_world->UpdateAllSystems(deltaTime);
        }
    }

    void Render() {
        // Dear ImGuiフレーム開始
        ImGui_ImplOpenGL3_NewFrame();
        ImGui_ImplSDL2_NewFrame();
        ImGui::NewFrame();

        // テスト用UI描画
        RenderUI();

        // OpenGL描画
        int display_w, display_h;
        SDL_GetWindowSize(window, &display_w, &display_h);
        glViewport(0, 0, display_w, display_h);

        // 背景クリア（暗いグレー）
        glClearColor(0.1f, 0.1f, 0.1f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT);

        // 2Dテスト描画
        RenderTestGraphics();

        // Dear ImGui描画
        ImGui::Render();
        ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());

        SDL_GL_SwapWindow(window);
    }

    void RenderUI() {
        // メインメニューバー
        if (ImGui::BeginMainMenuBar()) {
            if (ImGui::BeginMenu("ファイル")) {
                if (ImGui::MenuItem("新規プロジェクト")) {}
                if (ImGui::MenuItem("プロジェクトを開く")) {}
                if (ImGui::MenuItem("保存")) {}
                ImGui::Separator();
                if (ImGui::MenuItem("終了")) { isRunning = false; }
                ImGui::EndMenu();
            }
            if (ImGui::BeginMenu("編集")) {
                if (ImGui::MenuItem("元に戻す")) {}
                if (ImGui::MenuItem("やり直し")) {}
                ImGui::EndMenu();
            }
            if (ImGui::BeginMenu("ウィンドウ")) {
                if (ImGui::MenuItem("ヒエラルキー")) {}
                if (ImGui::MenuItem("インスペクター")) {}
                if (ImGui::MenuItem("ビューポート")) {}
                ImGui::EndMenu();
            }
            ImGui::EndMainMenuBar();
        }

        // ヒエラルキーウィンドウ（エンティティリスト）
        if (ImGui::Begin("ヒエラルキー")) {
            ImGui::Text("シーンオブジェクト:");
            if (ImGui::TreeNode("ECS World")) {
                if (m_world) {
                    const auto& entities = m_world->GetAllEntities();
                    for (const auto& entity : entities) {
                        if (entity.IsValid()) {
                            std::string label = entity.GetName() + " (ID: " + std::to_string(entity.GetID()) + ")";
                            if (ImGui::Selectable(label.c_str())) {
                                // エンティティ選択処理（今後実装）
                            }
                        }
                    }
                }
                ImGui::TreePop();
            }
        }
        ImGui::End();

        // インスペクターウィンドウ（プロパティ編集）
        if (ImGui::Begin("インスペクター")) {
            ImGui::Text("選択オブジェクトのプロパティ:");
            ImGui::Separator();

            if (ImGui::CollapsingHeader("Transform")) {
                static float position[3] = {0.0f, 0.0f, 0.0f};
                static float rotation[3] = {0.0f, 0.0f, 0.0f};
                static float scale[3] = {1.0f, 1.0f, 1.0f};

                ImGui::DragFloat3("Position", position, 0.1f);
                ImGui::DragFloat3("Rotation", rotation, 1.0f);
                ImGui::DragFloat3("Scale", scale, 0.1f);
            }

            if (ImGui::CollapsingHeader("Renderer")) {
                static float color[4] = {1.0f, 1.0f, 1.0f, 1.0f};
                ImGui::ColorEdit4("Color", color);
            }
        }
        ImGui::End();

        // ビューポートウィンドウ（ゲームプレビュー）
        if (ImGui::Begin("ビューポート")) {
            ImGui::Text("ゲームビュー (今後実装)");
            ImGui::Text("サイズ: %dx%d", WINDOW_WIDTH, WINDOW_HEIGHT);
        }
        ImGui::End();

        // 統計情報ウィンドウ
        if (ImGui::Begin("統計情報")) {
            ImGui::Text("Application average %.3f ms/frame (%.1f FPS)",
                       1000.0f / ImGui::GetIO().Framerate, ImGui::GetIO().Framerate);
            ImGui::Text("OpenGL Vendor: %s", glGetString(GL_VENDOR));
            ImGui::Text("OpenGL Renderer: %s", glGetString(GL_RENDERER));
            ImGui::Text("OpenGL Version: %s", glGetString(GL_VERSION));
        }
        ImGui::End();
    }

    void RenderTestGraphics() {
        // 古典的なOpenGL固定パイプラインでテスト描画
        glMatrixMode(GL_PROJECTION);
        glLoadIdentity();
        glOrtho(0, WINDOW_WIDTH, WINDOW_HEIGHT, 0, -1, 1);

        glMatrixMode(GL_MODELVIEW);
        glLoadIdentity();

        // カラフルな四角形を描画
        glBegin(GL_QUADS);
            glColor3f(1.0f, 0.0f, 0.0f); // 赤
            glVertex2f(100, 100);
            glColor3f(0.0f, 1.0f, 0.0f); // 緑
            glVertex2f(200, 100);
            glColor3f(0.0f, 0.0f, 1.0f); // 青
            glVertex2f(200, 200);
            glColor3f(1.0f, 1.0f, 0.0f); // 黄
            glVertex2f(100, 200);
        glEnd();

        // 中央に三角形
        glBegin(GL_TRIANGLES);
            glColor3f(1.0f, 0.5f, 0.0f);
            glVertex2f(WINDOW_WIDTH/2, WINDOW_HEIGHT/2 - 50);
            glVertex2f(WINDOW_WIDTH/2 - 50, WINDOW_HEIGHT/2 + 50);
            glVertex2f(WINDOW_WIDTH/2 + 50, WINDOW_HEIGHT/2 + 50);
        glEnd();
    }

    void Shutdown() {
        // Dear ImGui後始末
        ImGui_ImplOpenGL3_Shutdown();
        ImGui_ImplSDL2_Shutdown();
        ImGui::DestroyContext();

        // SDL後始末
        if (glContext) {
            SDL_GL_DeleteContext(glContext);
        }
        if (window) {
            SDL_DestroyWindow(window);
        }
        SDL_Quit();

        std::cout << "ゲームエンジン終了完了!" << std::endl;
    }
};

int main(int argc, char* argv[]) {
    std::cout << "C++ ゲームエンジン開始..." << std::endl;

    GameEngine engine;

    if (!engine.Initialize()) {
        std::cerr << "エンジン初期化失敗!" << std::endl;
        return -1;
    }

    engine.Run();
    engine.Shutdown();

    return 0;
}
