Pod::Spec.new do |s|
  s.name           = 'BunariScrypt'
  s.version        = '1.0.0'
  s.summary        = 'Native scrypt key derivation for the Bunari Private journal.'
  s.description    = 'Derives Private-journal wrapping keys with scrypt (RFC 7914) in native code.'
  s.license        = 'MIT'
  s.author         = 'Bunari'
  s.homepage       = 'https://github.com/shkelqimi138/bunari'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/shkelqimi138/bunari.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
