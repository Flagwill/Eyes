# Eyes' Rive asset is a set of frozen basis poses blended by a state machine.
# It contains no Rive events, audio or other keyed callbacks, yet the pinned
# runtime reports keyed callbacks for every blend animation on every advance,
# including the ~140 animations whose mix is zero. Profiling the wallpaper's
# render thread attributed about a third of its busy time to that scan.
#
# Patch a copy of the (header-only template) instance in the build directory and
# put it ahead of the downloaded include path. The downloaded MIT sources stay
# verbatim for inspection. Fail if an upstream edit makes the match ambiguous.
set(eyes_blend_header_relative rive/animation/blend_state_instance.hpp)
file(READ ${eyes_rive_runtime_SOURCE_DIR}/include/${eyes_blend_header_relative} eyes_blend_header)
string(REPLACE "\r\n" "\n" eyes_blend_header "${eyes_blend_header}")
set(eyes_blend_before
    "                animation.m_AnimationInstance.advance(seconds,\n                                                      stateMachineInstance);")
set(eyes_blend_after
    "                // Eyes: no keyed events exist in the shipped asset. The\n                // frozen poses still advance, but skip the per-animation\n                // callback scan (see ADR-016).\n                animation.m_AnimationInstance.advance(seconds, nullptr);")
string(FIND "${eyes_blend_header}" "${eyes_blend_before}" eyes_blend_start)
if(eyes_blend_start LESS 0)
    message(FATAL_ERROR "Pinned Rive blend-state layout changed; review ${eyes_blend_header_relative} patch")
endif()
string(LENGTH "${eyes_blend_before}" eyes_blend_count)
math(EXPR eyes_blend_end "${eyes_blend_start} + ${eyes_blend_count}")
string(SUBSTRING "${eyes_blend_header}" ${eyes_blend_end} -1 eyes_blend_tail)
string(FIND "${eyes_blend_tail}" "${eyes_blend_before}" eyes_blend_duplicate)
if(NOT eyes_blend_duplicate LESS 0)
    message(FATAL_ERROR "Ambiguous Rive blend-state patch in ${eyes_blend_header_relative}")
endif()
string(REPLACE "${eyes_blend_before}" "${eyes_blend_after}" eyes_blend_header "${eyes_blend_header}")
set(eyes_rive_runtime_patched_include ${CMAKE_CURRENT_BINARY_DIR}/rive-runtime-patched)
file(CONFIGURE OUTPUT ${eyes_rive_runtime_patched_include}/${eyes_blend_header_relative}
    CONTENT "${eyes_blend_header}" @ONLY)
