cmake_minimum_required(VERSION 3.21)

project(Eyes VERSION 0.1.0 LANGUAGES CXX)

include(GNUInstallDirs)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS
    Core
    Gui
    Widgets
    Network
    DBus
    WebSockets
    ShaderTools
)

set(EYES_WALLPAPER_UI packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui)
set(EYES_SHADER_OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/eye.frag.qsb)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui)
configure_file(${EYES_WALLPAPER_UI}/EyeScene.qml wallpaper-ui/EyeScene.qml COPYONLY)
configure_file(eyes-core.js wallpaper-ui/eyes-core.js COPYONLY)
add_custom_command(
    OUTPUT ${EYES_SHADER_OUTPUT}
    COMMAND Qt6::qsb --glsl "100 es,120,150" --hlsl 50 --msl 12
        -o ${EYES_SHADER_OUTPUT}
        ${CMAKE_CURRENT_SOURCE_DIR}/${EYES_WALLPAPER_UI}/eye.frag
    DEPENDS ${EYES_WALLPAPER_UI}/eye.frag
    VERBATIM
)
add_custom_target(eyes-eye-shader ALL DEPENDS ${EYES_SHADER_OUTPUT})

qt_add_executable(eyes-desktop
    desktop/main.cpp
)

qt_add_resources(eyes-desktop "eyes_resources"
    PREFIX "/"
    FILES
        desktop/eyes-tray.svg
)

target_link_libraries(eyes-desktop PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Network
    Qt6::DBus
    Qt6::WebSockets
)

install(TARGETS eyes-desktop RUNTIME DESTINATION bin)
install(PROGRAMS bin/eyes DESTINATION bin)
install(FILES
    packaging/eyes-desktop.desktop
    DESTINATION share/applications
)
install(FILES
    desktop/eyes-tray.svg
    DESTINATION share/icons/hicolor/scalable/apps
    RENAME eyes-desktop.svg
)
install(FILES
    packaging/kwin-eyes-cursor.desktop
    DESTINATION share/applications
)
install(FILES
    packaging/kwin-eyes-cursor/metadata.json
    DESTINATION share/kwin/scripts/eyes-cursor
)
install(FILES
    packaging/kwin-eyes-cursor/main.js
    DESTINATION share/kwin/scripts/eyes-cursor/contents/code
)
install(DIRECTORY
    packaging/plasma-wallpaper/org.eyes.wallpaper
    DESTINATION share/plasma/wallpapers
    FILES_MATCHING
    PATTERN "metadata.json"
    PATTERN "main.xml"
    PATTERN "main.qml"
    PATTERN "EyeScene.qml"
)
install(FILES
    eyes-core.js
    ${EYES_SHADER_OUTPUT}
    DESTINATION share/plasma/wallpapers/org.eyes.wallpaper/contents/ui
)
