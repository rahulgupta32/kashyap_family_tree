import 'package:flutter/foundation.dart';

const offlineReview = kDebugMode && bool.fromEnvironment('ENABLE_DEV_PREVIEW');
const communityReelsEnabled = offlineReview || bool.fromEnvironment('ENABLE_COMMUNITY_REELS');
