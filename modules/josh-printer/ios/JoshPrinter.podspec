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

  s.source_files = 'JoshPrinterModule.swift', 'JoshPrinter-Bridging-Header.h', 'LPAPI/LPAPI.h'
  s.public_header_files = 'LPAPI/LPAPI.h'
  s.preserve_paths = 'LPAPI/*.a', 'JoshPrinter-Bridging-Header.h'

  s.frameworks = 'UIKit', 'Foundation', 'CoreBluetooth', 'CoreGraphics'

  # Device vs simulator LPAPI static libraries (vendor ships separate .a files).
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_OBJC_BRIDGING_HEADER' => '$(PODS_TARGET_SRCROOT)/JoshPrinter-Bridging-Header.h',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)" "$(PODS_TARGET_SRCROOT)/LPAPI"',
    'LIBRARY_SEARCH_PATHS[sdk=iphoneos*]' => '"$(PODS_TARGET_SRCROOT)/LPAPI"',
    'LIBRARY_SEARCH_PATHS[sdk=iphonesimulator*]' => '"$(PODS_TARGET_SRCROOT)/LPAPI"',
    'OTHER_LDFLAGS[sdk=iphoneos*]' => '-force_load "$(PODS_TARGET_SRCROOT)/LPAPI/LPAPI-2026-03-04-Device.a"',
    'OTHER_LDFLAGS[sdk=iphonesimulator*]' => '-force_load "$(PODS_TARGET_SRCROOT)/LPAPI/LPAPI-2026-03-04-Simulator.a"',
  }

  s.dependency 'ExpoModulesCore'
end
