require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'JoshPrinter'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'sez-print'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  # No Swift bridging header — Expo pods are frameworks and bridging headers are unsupported.
  # Swift talks to LPAPI through JoshLPAPIClient (ObjC).
  s.source_files = 'JoshPrinterModule.swift', 'JoshLPAPIClient.{h,m}', 'LPAPI/LPAPI.h'
  s.public_header_files = 'JoshLPAPIClient.h'
  s.private_header_files = 'LPAPI/LPAPI.h'
  s.preserve_paths = 'LPAPI/*.a'

  s.frameworks = 'UIKit', 'Foundation', 'CoreBluetooth', 'CoreGraphics'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)" "$(PODS_TARGET_SRCROOT)/LPAPI"',
    'LIBRARY_SEARCH_PATHS[sdk=iphoneos*]' => '"$(PODS_TARGET_SRCROOT)/LPAPI"',
    'LIBRARY_SEARCH_PATHS[sdk=iphonesimulator*]' => '"$(PODS_TARGET_SRCROOT)/LPAPI"',
    'OTHER_LDFLAGS[sdk=iphoneos*]' => '-force_load "$(PODS_TARGET_SRCROOT)/LPAPI/LPAPI-2026-03-04-Device.a"',
    'OTHER_LDFLAGS[sdk=iphonesimulator*]' => '-force_load "$(PODS_TARGET_SRCROOT)/LPAPI/LPAPI-2026-03-04-Simulator.a"',
  }

  s.dependency 'ExpoModulesCore'
end
