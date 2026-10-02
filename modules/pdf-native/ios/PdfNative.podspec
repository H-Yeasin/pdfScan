Pod::Spec.new do |s|
  s.name           = 'PdfNative'
  s.version        = '1.0.0'
  s.summary        = 'PDF page count, size, rendering and text with word boxes'
  s.description    = 'Local Expo module for PDF Scan (§7 R1), built on PDFKit'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
