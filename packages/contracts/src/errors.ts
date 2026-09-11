// ============================================================================
// Kashyap Adhikari Family Tree — Error Catalogue & Machine Codes
// ============================================================================

export enum ErrorCode {
  // Auth Errors (1000 - 1099)
  INVALID_PHONE_NUMBER = 'AUTH_1001',
  OTP_EXPIRED = 'AUTH_1002',
  OTP_MAX_ATTEMPTS_EXCEEDED = 'AUTH_1003',
  OTP_RESEND_COOLDOWN = 'AUTH_1004',
  INVALID_OTP = 'AUTH_1005',
  SESSION_EXPIRED = 'AUTH_1006',
  ACCOUNT_SUSPENDED = 'AUTH_1007',
  ACCOUNT_DELETED = 'AUTH_1008',
  UNAUTHORIZED = 'AUTH_1009',
  FORBIDDEN = 'AUTH_1010',
  REFRESH_TOKEN_REUSED = 'AUTH_1011',
  ROLE_ASSIGNMENT_DENIED = 'AUTH_1012',
  SELF_ELEVATION_PROHIBITED = 'AUTH_1013',
  FORBIDDEN_BROWSER_ORIGIN = 'AUTH_1014',

  // Profile & Privacy Errors (2000 - 2099)
  PROFILE_NOT_FOUND = 'PROF_2001',
  CANNOT_EDIT_LOCKED_FIELD = 'PROF_2002',
  INVALID_PRIVACY_SETTING = 'PROF_2003',
  MINOR_PRIVACY_RESTRICTION = 'PROF_2004',

  // Genealogy & Tree Errors (3000 - 3099)
  PERSON_NOT_FOUND = 'GEN_3001',
  SELF_LINK_PROHIBITED = 'GEN_3002',
  CYCLE_DETECTED = 'GEN_3003',
  DUPLICATE_PARENT_LINK = 'GEN_3004',
  DUPLICATE_SPOUSE_LINK = 'GEN_3005',
  INVALID_GENERATION_GAP = 'GEN_3006',
  BRANCH_MISMATCH = 'GEN_3007',
  PERSON_ALREADY_LINKED = 'GEN_3008',
  MAX_TREE_DEPTH_EXCEEDED = 'GEN_3009',

  // Claim Errors (4000 - 4099)
  ACTIVE_CLAIM_EXISTS = 'CLAIM_4001',
  PERSON_ALREADY_CLAIMED = 'CLAIM_4002',
  INVALID_CLAIM_STATE = 'CLAIM_4003',
  SELF_VERIFICATION_PROHIBITED = 'CLAIM_4004',
  INSUFFICIENT_EVIDENCE = 'CLAIM_4005',

  // Change Request & Duplicate Errors (5000 - 5099)
  CHANGE_REQUEST_NOT_FOUND = 'CHG_5001',
  CANNOT_MODIFY_PROCESSED_REQUEST = 'CHG_5002',
  DUPLICATE_MERGE_CYCLE = 'DUP_5003',
  MERGE_CONFLICTING_PARENTS = 'DUP_5004',
  CANNOT_MERGE_CLAIMED_PERSONS = 'DUP_5005',

  // Domain Rule Errors (6000 - 6099)
  RULESET_NOT_APPROVED = 'RULE_6001',
  NO_RELATIONSHIP_PATH = 'RULE_6002',
  UNMAPPED_KINSHIP_TERM = 'RULE_6003',
  AUTHORITY_GATE_LOCKED = 'RULE_6004',

  // Community & Chat Errors (7000 - 7099)
  POST_UNDER_MODERATION = 'COM_7001',
  USER_BLOCKED = 'CHAT_7002',
  CONVERSATION_NOT_FOUND = 'CHAT_7003',
  POST_NOT_FOUND = 'COM_7004',
  EVENT_NOT_FOUND = 'EVT_7005',

  // System & Infrastructure (9000 - 9999)
  INTERNAL_SERVER_ERROR = 'SYS_9001',
  DATABASE_TRANSACTION_FAILED = 'SYS_9002',
  RATE_LIMIT_EXCEEDED = 'SYS_9003',
  SERVICE_UNAVAILABLE = 'SYS_9004',
  EXTERNAL_PROVIDER_ERROR = 'SYS_9005'
}

export interface ApiErrorResponse {
  success: false;
  errorCode: ErrorCode;
  message: string;
  messageNepali?: string;
  details?: Record<string, any>;
  timestamp: string;
  path: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
    cursor?: string;
  };
}
