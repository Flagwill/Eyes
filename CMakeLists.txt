cmake_minimum_required(VERSION 3.21)

project(MioEyesDesktop VERSION 0.1.0 LANGUAGES CXX)

include(GNUInstallDirs)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Widgets Quick Qml Network DBus WebEngineQuick)
find_package(KF6WindowSystem REQUIRED)
find_package(LayerShellQt REQUIRED)

qt_add_executable(mio-desktop
    desktop/main.cpp
)

qt_add_resources(mio-desktop "mio_resources"
    PREFIX "/"
    FILES
        desktop/DesktopWindow.qml
        desktop.html
        desktop.css
        desktop.js
        eyes.js
        desktop/mio-tray.svg
)

target_link_libraries(mio-desktop PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Quick
    Qt6::Qml
    Qt6::Network
    Qt6::DBus
    Qt6::WebEngineQuick
    KF6::WindowSystem
    LayerShellQt::Interface
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
