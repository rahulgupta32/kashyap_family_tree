import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'dev_preview/preview_app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (!allowDevPreview(debug: kDebugMode, requested: devPreviewRequested)) {
    throw UnsupportedError(
        'Offline preview requires a debug build with ENABLE_DEV_PREVIEW=true.');
  }
  runApp(const DevelopmentPreviewApp());
}
