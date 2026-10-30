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

include(cmake/Rive.cmake)

# Explicit benchmark target; it is neither installed nor part of normal builds.
add_executable(eyes-render-benchmark EXCLUDE_FROM_ALL tools/render-benchmark.cpp)
target_link_libraries(eyes-render-benchmark PRIVATE Qt6::Quick Qt6::GuiPrivate)
add_executable(eyes-geometry-test EXCLUDE_FROM_ALL tests/triangle-clip.cpp)
target_include_directories(eyes-geometry-test PRIVATE desktop)
target_link_libraries(eyes-geometry-test PRIVATE Qt6::Gui)

set(EYES_WALLPAPER_UI packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui)
set(EYES_SHADER_OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/eye.frag.qsb)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui)
configure_file(${EYES_WALLPAPER_UI}/EyeScene.qml wallpaper-ui/EyeScene.qml COPYONLY)
configure_file(${EYES_WALLPAPER_UI}/RiveEyeScene.qml wallpaper-ui/RiveEyeScene.qml COPYONLY)
configure_file(${EYES_WALLPAPER_UI}/AnimationClock.qml wallpaper-ui/AnimationClock.qml COPYONLY)
configure_file(assets/eyes/eyes.riv wallpaper-ui/eyes.riv COPYONLY)
# QML imports a single classic script; browsers load the same two sources in order.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    eyes-core.js vendor/sentient-eye-engine/rig.js)
file(READ vendor/sentient-eye-engine/rig.js EYES_RIG_SOURCE)
file(READ eyes-core.js EYES_CORE_SOURCE)
file(WRITE ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/eyes-core.js
    "${EYES_RIG_SOURCE}\n${EYES_CORE_SOURCE}")
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
        assets/eyes/manifest.json
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
install(PROGRAMS packaging/configure-plasma-wallpaper.py
    DESTINATION share/eyes)
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
    PATTERN "RiveEyeScene.qml"
    PATTERN "AnimationClock.qml"
)
install(FILES
    ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/eyes-core.js
    ${EYES_SHADER_OUTPUT}
    ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/eyes.riv
    DESTINATION share/plasma/wallpapers/org.eyes.wallpaper/contents/ui
)
install(FILES vendor/sentient-eye-engine/LICENSE
    DESTINATION share/doc/eyes/licenses RENAME Sentient-Eye-Engine-MIT.txt)
