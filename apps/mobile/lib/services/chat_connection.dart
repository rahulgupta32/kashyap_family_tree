import 'dart:convert';
import 'dart:io';

abstract class ChatConnection {
  Stream<Map<String, dynamic>> get frames;
  int? get closeCode;
  void send(Map<String, dynamic> frame);
  Future<void> close();
}

class NativeChatConnection implements ChatConnection {
  final WebSocket _socket;
  NativeChatConnection._(this._socket);
  static Future<ChatConnection> connect(String baseUrl, String token) async {
    final base = Uri.parse(baseUrl);
    final uri = base.replace(scheme: base.scheme == 'https' ? 'wss' : 'ws', path: '/chat/socket', query: null);
    final socket = await WebSocket.connect(uri.toString()).timeout(const Duration(seconds: 15));
    socket.add(json.encode({'type': 'auth', 'token': token}));
    return NativeChatConnection._(socket);
  }
  @override
  Stream<Map<String, dynamic>> get frames => _socket.map((event) => json.decode(event as String) as Map<String, dynamic>);
  @override
  int? get closeCode => _socket.closeCode;
  @override
  void send(Map<String, dynamic> frame) => _socket.add(json.encode(frame));
  @override
  Future<void> close() async { await _socket.close(); }
}
