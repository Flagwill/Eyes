# Rive is a dynamically loaded wallpaper renderer. Keep its LGPL Qt bridge
# replaceable and pin both upstreams; no network access occurs at runtime.
include(FetchContent)
find_package(Qt6 6.5 REQUIRED COMPONENTS Quick Qml OpenGL CorePrivate GuiPrivate QuickPrivate)
FetchContent_Declare(eyes_rive_qt
    URL https://codeload.github.com/basysKom/RiveQtQuickPlugin/tar.gz/4e139e0d3ed7ca69f182feecfee5ae6b18c41c90
    URL_HASH SHA256=d7a6e13b48f2bc958e9bfc18dbe518c81fba85bb6eb06fdfe0da869a9bb74d4e
    SOURCE_SUBDIR eyes-source-only)
FetchContent_Declare(eyes_rive_runtime
    URL https://codeload.github.com/rive-app/rive-runtime/tar.gz/8a54c80a217d2cc651c4d52385ceb6090ff8c6f1
    URL_HASH SHA256=c3f5a194a3a6f830f3f56563b164a2974af45c1d9df65b8fc6c791f632b8e185
    SOURCE_SUBDIR eyes-source-only)
# Use our Qt 6 build adapter instead of upstream's top-level CMake. It assumes
# it is the root project and unnecessarily builds text dependencies for Eyes.
FetchContent_MakeAvailable(eyes_rive_qt eyes_rive_runtime)
# Keep every translation unit on the same adapted headers, while preserving
# the downloaded LGPL source verbatim for inspection and replacement.
set(rive_qt_upstream ${eyes_rive_qt_SOURCE_DIR}/src/RiveQtQuickItem)
set(rive_qt_src ${CMAKE_CURRENT_BINARY_DIR}/rive-qt)
file(GLOB_RECURSE rive_bridge_files RELATIVE ${rive_qt_upstream} ${rive_qt_upstream}/*)
foreach(bridge_file IN LISTS rive_bridge_files)
    if(NOT bridge_file STREQUAL "riveqsgrhirendernode.h")
        configure_file(${rive_qt_upstream}/${bridge_file} ${rive_qt_src}/${bridge_file} COPYONLY)
    endif()
endforeach()
file(GLOB_RECURSE rive_runtime_sources CONFIGURE_DEPENDS ${eyes_rive_runtime_SOURCE_DIR}/src/*.cpp)
add_library(eyes-rive-runtime STATIC ${rive_runtime_sources})
set_target_properties(eyes-rive-runtime PROPERTIES POSITION_INDEPENDENT_CODE ON AUTOMOC OFF)
target_include_directories(eyes-rive-runtime PUBLIC ${eyes_rive_runtime_SOURCE_DIR}/include)
target_compile_definitions(eyes-rive-runtime PRIVATE _RIVE_INTERNAL_)
file(GLOB rive_qt_sources CONFIGURE_DEPENDS
    ${rive_qt_src}/*.h ${rive_qt_src}/*.cpp
    ${rive_qt_src}/renderer/*.h ${rive_qt_src}/renderer/*.cpp
    ${rive_qt_src}/rhi/*.h ${rive_qt_src}/rhi/*.cpp)
list(FILTER rive_qt_sources EXCLUDE REGEX "(riveqtquickplugin|rivequickpainteditem|riveqtpaint)\\.(h|cpp)$")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveScheduling.cmake
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveAntialiasing.cmake
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveBatching.cmake
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveGeometry.cmake
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveResources.cmake
    ${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveQuality.cmake)
file(READ ${rive_qt_src}/riveqtpath.cpp rive_path_source)
string(FIND "${rive_path_source}" "void RiveQtPath::updatePathSegmentsData()" rive_tail_start)
if(rive_tail_start LESS 0)
    message(FATAL_ERROR "Pinned Rive Qt path layout changed; review precision patch")
endif()
string(SUBSTRING "${rive_path_source}" 0 ${rive_tail_start} rive_path_prefix)
file(READ ${CMAKE_CURRENT_SOURCE_DIR}/cmake/rive-path-tail.cpp rive_path_tail)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS cmake/rive-path-tail.cpp)
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtpath.cpp
    CONTENT "${rive_path_prefix}${rive_path_tail}" @ONLY)
list(REMOVE_ITEM rive_qt_sources ${rive_qt_src}/riveqtpath.cpp)
list(APPEND rive_qt_sources ${CMAKE_CURRENT_BINARY_DIR}/riveqtpath.cpp)
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveAntialiasing.cmake)
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveScheduling.cmake)
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveBatching.cmake)
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveGeometry.cmake)
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveResources.cmake)
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/RiveQuality.cmake)
qt_add_qml_module(EyesRive URI EyesRive VERSION 1.0 SHARED PLUGIN_TARGET EyesRive
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/EyesRive
    SOURCES ${rive_qt_sources} desktop/rive-settings.h)
target_compile_definitions(EyesRive PRIVATE RIVEQTQUICKITEM_LIBRARY QT_NO_DEBUG_OUTPUT)
target_include_directories(EyesRive PRIVATE ${rive_qt_src} ${rive_qt_src}/renderer
    ${eyes_rive_runtime_SOURCE_DIR}/utils ${CMAKE_CURRENT_SOURCE_DIR}/desktop)
target_link_libraries(EyesRive PRIVATE eyes-rive-runtime Qt6::Core Qt6::CorePrivate
    Qt6::Gui Qt6::GuiPrivate Qt6::Quick Qt6::QuickPrivate Qt6::Qml Qt6::OpenGL)
file(GLOB rive_shaders ${rive_qt_src}/shaders/qt6/*.vert ${rive_qt_src}/shaders/qt6/*.frag)
qt_add_shaders(EyesRive rive-shaders PREFIX "/" BASE ${rive_qt_src} FILES ${rive_shaders})
set(EYES_RIVE_DEST share/plasma/wallpapers/org.eyes.wallpaper/contents/ui/EyesRive)
install(TARGETS EyesRive LIBRARY DESTINATION ${EYES_RIVE_DEST})
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/EyesRive/qmldir
    ${CMAKE_CURRENT_BINARY_DIR}/wallpaper-ui/EyesRive/EyesRive.qmltypes DESTINATION ${EYES_RIVE_DEST})
install(DIRECTORY ${eyes_rive_qt_SOURCE_DIR}/LICENSES/ DESTINATION share/doc/eyes/licenses/RiveQtQuickPlugin)
install(FILES ${eyes_rive_runtime_SOURCE_DIR}/LICENSE DESTINATION share/doc/eyes/licenses RENAME Rive-runtime-MIT.txt)
