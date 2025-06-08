cmake_minimum_required(VERSION 3.16)
project(CppGameEngine VERSION 1.0.0)

# C++17を使用
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# macOSの場合のOpenGLフレームワーク
if(APPLE)
    find_package(OpenGL REQUIRED)
    find_library(COCOA_LIBRARY Cocoa)
    find_library(IOKIT_LIBRARY IOKit)
    find_library(COREVIDEO_LIBRARY CoreVideo)
endif()

# 依存関係のパッケージを探す
find_package(PkgConfig REQUIRED)
pkg_check_modules(SDL2 REQUIRED sdl2)
pkg_check_modules(SDL2_IMAGE REQUIRED SDL2_image)

# 外部ライブラリ用のサブディレクトリ
add_subdirectory(external)

# インクルードディレクトリ
include_directories(
    src
    external/imgui
    external/imgui/backends
    external/glad/include
    external/glm
    external/stb
    ${SDL2_INCLUDE_DIRS}
)

# ソースファイル
file(GLOB_RECURSE SOURCES
    "src/*.cpp"
    "src/*.h"
)

# ImGuiソースファイル（必要なもののみ）
file(GLOB IMGUI_SOURCES
    "external/imgui/*.cpp"
    "external/imgui/backends/imgui_impl_opengl3.cpp"
    "external/imgui/backends/imgui_impl_sdl2.cpp"
)

# GLADソースファイル
set(GLAD_SOURCES "external/glad/src/glad.c")

# 全てのソースファイルを結合
set(ALL_SOURCES ${SOURCES} ${IMGUI_SOURCES} ${GLAD_SOURCES})

# 実行ファイル
add_executable(${PROJECT_NAME} ${ALL_SOURCES})

# リンクライブラリ
if(APPLE)
    target_link_libraries(${PROJECT_NAME}
        ${OPENGL_LIBRARIES}
        ${COCOA_LIBRARY}
        ${IOKIT_LIBRARY}
        ${COREVIDEO_LIBRARY}
    )
    # SDL2のライブラリを直接指定
    target_link_libraries(${PROJECT_NAME}
        /opt/homebrew/lib/libSDL2.dylib
        /opt/homebrew/lib/libSDL2_image.dylib
    )
else()
    target_link_libraries(${PROJECT_NAME}
        ${SDL2_LIBRARIES}
        ${SDL2_IMAGE_LIBRARIES}
        GL
        dl
    )
endif()

# コンパイルフラグ
target_compile_options(${PROJECT_NAME} PRIVATE ${SDL2_CFLAGS_OTHER})

# デバッグ時の追加フラグ
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_definitions(${PROJECT_NAME} PRIVATE DEBUG=1)
endif()
