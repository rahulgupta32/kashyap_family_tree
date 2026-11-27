import 'dart:typed_data';

/// Reject adb error text and empty/truncated captures before labelling them PNGs.
bool isPngScreenshot(List<int> bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33) return false;
  for (var i = 0; i < signature.length; i++) {
    if (bytes[i] != signature[i]) return false;
  }
  final header = ByteData.sublistView(Uint8List.fromList(bytes));
  return header.getUint32(8) == 13 &&
      String.fromCharCodes(bytes.sublist(12, 16)) == 'IHDR' &&
      header.getUint32(16) > 0 &&
      header.getUint32(20) > 0;
}
