cmake_minimum_required(VERSION 3.21)

project(MioEyesDesktop VERSION 0.1.0 LANGUAGES CXX)

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

set(MIO_WALLPAPER_UI packaging/plasma-wallpaper/com.mio.Eyes/contents/ui)
set(MIO_SHADER_OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/eye.frag.qsb)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui)
configure_file(${MIO_WALLPAPER_UI}/EyeScene.qml wallpaper-ui/EyeScene.qml COPYONLY)
configure_file(eyes-core.js wallpaper-ui/eyes-core.js COPYONLY)
add_custom_command(
    OUTPUT ${MIO_SHADER_OUTPUT}
    COMMAND Qt6::qsb --glsl "100 es,120,150" --hlsl 50 --msl 12
        -o ${MIO_SHADER_OUTPUT}
        ${CMAKE_CURRENT_SOURCE_DIR}/${MIO_WALLPAPER_UI}/eye.frag
    DEPENDS ${MIO_WALLPAPER_UI}/eye.frag
    VERBATIM
)
add_custom_target(mio-eye-shader ALL DEPENDS ${MIO_SHADER_OUTPUT})

qt_add_executable(mio-desktop
    desktop/main.cpp
)

qt_add_resources(mio-desktop "mio_resources"
    PREFIX "/"
    FILES
        desktop/mio-tray.svg
)

target_link_libraries(mio-desktop PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Network
    Qt6::DBus
    Qt6::WebSockets
)

install(TARGETS mio-desktop RUNTIME DESTINATION bin)
install(PROGRAMS bin/mio DESTINATION bin)
install(FILES
    packaging/mio-desktop.desktop
    DESTINATION share/applications
)
install(FILES
    desktop/mio-tray.svg
    DESTINATION share/icons/hicolor/scalable/apps
    RENAME mio-desktop.svg
)
install(FILES
    packaging/kwin-mio-eyes-cursor.desktop
    DESTINATION share/applications
)
install(FILES
    packaging/kwin-mio-eyes-cursor/metadata.json
    DESTINATION share/kwin/scripts/mio-eyes-cursor
)
install(FILES
    packaging/kwin-mio-eyes-cursor/main.js
    DESTINATION share/kwin/scripts/mio-eyes-cursor/contents/code
)
install(DIRECTORY
    packaging/plasma-wallpaper/com.mio.Eyes
    DESTINATION share/plasma/wallpapers
    FILES_MATCHING
    PATTERN "metadata.json"
    PATTERN "main.xml"
    PATTERN "main.qml"
    PATTERN "EyeScene.qml"
)
install(FILES
    eyes-core.js
    ${MIO_SHADER_OUTPUT}
    DESTINATION share/plasma/wallpapers/com.mio.Eyes/contents/ui
)
