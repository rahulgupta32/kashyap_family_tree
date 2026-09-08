import { ErrorCode } from '@kashyap/contracts';

export const errorMessages: Record<ErrorCode, { en: string; ne: string }> = {
  [ErrorCode.INVALID_PHONE_NUMBER]: {
    en: 'Invalid phone number format. Please provide a valid 10-digit mobile number.',
    ne: 'मोबाइल नम्बर ढाँचा अमान्य छ। कृपया १० अंकको मान्य नम्बर प्रविष्ट गर्नुहोस्।'
  },
  [ErrorCode.OTP_EXPIRED]: {
    en: 'OTP code has expired. Please request a new one.',
    ne: 'ओटिपी कोडको समय समाप्त भयो। कृपया नयाँ कोड अनुरोध गर्नुहोस्।'
  },
  [ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED]: {
    en: 'Maximum OTP verification attempts exceeded. Please request a new OTP.',
    ne: 'ओटिपी प्रयास संख्या नाघ्यो। कृपया नयाँ ओटिपी माग्नुहोस्।'
  },
  [ErrorCode.OTP_RESEND_COOLDOWN]: {
    en: 'Please wait before requesting another OTP.',
    ne: 'कृपया नयाँ ओटिपी माग्नु अघि केही समय पर्खनुहोस्।'
  },
  [ErrorCode.INVALID_OTP]: {
    en: 'Invalid OTP code. Please check and try again.',
    ne: 'गलत ओटिपी कोड। कृपया जाँच गरी पुनः प्रयास गर्नुहोस्।'
  },
  [ErrorCode.SESSION_EXPIRED]: {
    en: 'Session expired. Please log in again.',
    ne: 'सत्र समाप्त भयो। कृपया पुनः लगइन गर्नुहोस्।'
  },
  [ErrorCode.ACCOUNT_SUSPENDED]: {
    en: 'Your account has been suspended by administration.',
    ne: 'तपाईंको खाता प्रशासनद्वारा निलम्बन गरिएको छ।'
  },
  [ErrorCode.ACCOUNT_DELETED]: {
    en: 'This account has been deleted.',
    ne: 'यो खाता हटाइएको छ।'
  },
  [ErrorCode.UNAUTHORIZED]: {
    en: 'Authentication required.',
    ne: 'लगइन आवश्यक छ।'
  },
  [ErrorCode.FORBIDDEN]: {
    en: 'You do not have permission to perform this action.',
    ne: 'तपाईंसँग यो कार्य गर्ने अनुमति छैन।'
  },
  [ErrorCode.PROFILE_NOT_FOUND]: {
    en: 'Profile not found.',
    ne: 'प्रोफाइल फेला परेन।'
  },
  [ErrorCode.CANNOT_EDIT_LOCKED_FIELD]: {
    en: 'This field is locked and requires a formal change request to modify.',
    ne: 'यो विवरण सुरक्षित गरिएको छ र परिमार्जन गर्न औपचारिक अनुरोध चाहिन्छ।'
  },
  [ErrorCode.INVALID_PRIVACY_SETTING]: {
    en: 'Invalid privacy setting provided.',
    ne: 'अमान्य गोपनीयता सेटिङ।'
  },
  [ErrorCode.MINOR_PRIVACY_RESTRICTION]: {
    en: 'Minor profile details are protected by strict privacy rules.',
    ne: 'नाबालिगको विवरण कडा गोपनीयता नियमहरूद्वारा सुरक्षित छ।'
  },
  [ErrorCode.PERSON_NOT_FOUND]: {
    en: 'Person record not found.',
    ne: 'व्यक्ति विवरण फेला परेन।'
  },
  [ErrorCode.SELF_LINK_PROHIBITED]: {
    en: 'A person cannot be linked as their own parent or spouse.',
    ne: 'कुनै पनि व्यक्ति आफैंको बुबा/आमा वा पति/पत्नी हुन सक्दैन।'
  },
  [ErrorCode.CYCLE_DETECTED]: {
    en: 'Cannot create relationship: this would create an impossible ancestry loop (cycle).',
    ne: 'सम्बन्ध जोड्न सकिएन: यसले वंशावली चक्र (loop) सिर्जना गर्दछ।'
  },
  [ErrorCode.DUPLICATE_PARENT_LINK]: {
    en: 'Parent link already exists.',
    ne: 'अभिभावक सम्बन्ध पहिले नै अवस्थित छ।'
  },
  [ErrorCode.DUPLICATE_SPOUSE_LINK]: {
    en: 'Spouse link already exists.',
    ne: 'दाम्पत्य सम्बन्ध पहिले नै अवस्थित छ।'
  },
  [ErrorCode.INVALID_GENERATION_GAP]: {
    en: 'Generation gap between parent and child is outside biologically realistic bounds.',
    ne: 'पुस्ताको अन्तर स्वाभाविक सीमा बाहिर छ।'
  },
  [ErrorCode.BRANCH_MISMATCH]: {
    en: 'Branch lineage mismatch.',
    ne: 'शाखा वा कुल विवरण मेल खाएन।'
  },
  [ErrorCode.PERSON_ALREADY_LINKED]: {
    en: 'This person is already linked to another account.',
    ne: 'यो व्यक्ति पहिले नै अर्को खातासँग जोडिएको छ।'
  },
  [ErrorCode.MAX_TREE_DEPTH_EXCEEDED]: {
    en: 'Requested tree depth exceeds safe rendering limits.',
    ne: 'अनुरोध गरिएको पुस्ता गहिराइ सीमा भन्दा बढी भयो।'
  },
  [ErrorCode.ACTIVE_CLAIM_EXISTS]: {
    en: 'An active verification claim already exists for this person.',
    ne: 'यो व्यक्तिको लागि दाबी प्रक्रिया पहिले नै विचाराधीन छ।'
  },
  [ErrorCode.PERSON_ALREADY_CLAIMED]: {
    en: 'This person profile has already been claimed and verified by a user.',
    ne: 'यो प्रोफाइल पहिले नै प्रमाणित भई दाबी भइसकेको छ।'
  },
  [ErrorCode.INVALID_CLAIM_STATE]: {
    en: 'Invalid claim state transition.',
    ne: 'दाबी अवस्था अमान्य छ।'
  },
  [ErrorCode.SELF_VERIFICATION_PROHIBITED]: {
    en: 'Administrators cannot verify their own claims or immediate family claims.',
    ne: 'प्रशासकले आफ्नै वा नजिकको परिवारको दाबी प्रमाणीकरण गर्न पाउँदैन।'
  },
  [ErrorCode.INSUFFICIENT_EVIDENCE]: {
    en: 'Please provide required evidence attachments.',
    ne: 'कृपया आवश्यक प्रमाण कागजातहरू संलग्न गर्नुहोस्।'
  },
  [ErrorCode.CHANGE_REQUEST_NOT_FOUND]: {
    en: 'Change request not found.',
    ne: 'परिमार्जन अनुरोध फेला परेन।'
  },
  [ErrorCode.CANNOT_MODIFY_PROCESSED_REQUEST]: {
    en: 'Processed change request cannot be modified.',
    ne: 'प्रक्रिया भइसकेको अनुरोध परिमार्जन गर्न सकिँदैन।'
  },
  [ErrorCode.DUPLICATE_MERGE_CYCLE]: {
    en: 'Merging these persons would create an ancestry loop.',
    ne: 'यी व्यक्तिहरू गाभ्दा वंशावली चक्र बन्दछ।'
  },
  [ErrorCode.MERGE_CONFLICTING_PARENTS]: {
    en: 'Cannot automatically merge: conflicting parent links require manual resolution.',
    ne: 'अभिभावक विवरण बाझिएकाले स्वतः गाभ्न सकिएन।'
  },
  [ErrorCode.CANNOT_MERGE_CLAIMED_PERSONS]: {
    en: 'Cannot merge two persons that are both claimed by active user accounts.',
    ne: 'सक्रिय खाता भएका दुई व्यक्तिलाई गाभ्न मिल्दैन।'
  },
  [ErrorCode.RULESET_NOT_APPROVED]: {
    en: 'This domain ruleset has not received required cultural authority sign-off.',
    ne: 'यो नियम संग्रहलाई आधिकारिक धार्मिक/सांस्कृतिक स्वीकृति प्राप्त भएको छैन।'
  },
  [ErrorCode.NO_RELATIONSHIP_PATH]: {
    en: 'No verified genealogical path exists between these individuals.',
    ne: 'यी व्यक्तिहरू बीच कुनै प्रमाणित नाता बाटो फेला परेन।'
  },
  [ErrorCode.UNMAPPED_KINSHIP_TERM]: {
    en: 'No standard Nata/Saino terminology mapped for this kinship path.',
    ne: 'यस नाता बाटोको लागि कुनै आधिकारिक नाता/साइनो शब्दावली सूचीकृत छैन।'
  },
  [ErrorCode.AUTHORITY_GATE_LOCKED]: {
    en: 'This feature is pending human authority sign-off (Open Gate).',
    ne: 'यो सुविधा आधिकारिक हस्ताक्षरको पर्खाइमा छ।'
  },
  [ErrorCode.POST_UNDER_MODERATION]: {
    en: 'Post is currently under community moderation.',
    ne: 'यो सामग्री समुदायको समीक्षा अन्तर्गत छ।'
  },
  [ErrorCode.USER_BLOCKED]: {
    en: 'Communication with this user is blocked.',
    ne: 'यस प्रयोगकर्तासँगको संवाद रोकिएको छ।'
  },
  [ErrorCode.CONVERSATION_NOT_FOUND]: {
    en: 'Conversation not found.',
    ne: 'कुराकानी फेला परेन।'
  },
  [ErrorCode.POST_NOT_FOUND]: {
    en: 'Community post not found.',
    ne: 'सामुदायिक पोस्ट फेला परेन।'
  },
  [ErrorCode.EVENT_NOT_FOUND]: {
    en: 'Event not found.',
    ne: 'कार्यक्रम फेला परेन।'
  },

  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    en: 'An internal error occurred. Please try again later.',
    ne: 'आन्तरिक त्रुटि भयो। कृपया पछि पुनः प्रयास गर्नुहोस्।'
  },
  [ErrorCode.DATABASE_TRANSACTION_FAILED]: {
    en: 'Database transaction could not be completed.',
    ne: 'डाटाबेस कारोबार पूरा हुन सकेन।'
  },
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    en: 'Too many requests. Please slow down.',
    ne: 'धेरै अनुरोधहरू आए। कृपया केही समय पछि प्रयास गर्नुहोस्।'
  },
  [ErrorCode.SERVICE_UNAVAILABLE]: {
    en: 'Service is temporarily unavailable.',
    ne: 'सेवा अस्थायी रूपमा उपलब्ध छैन।'
  },
  [ErrorCode.EXTERNAL_PROVIDER_ERROR]: {
    en: 'External gateway service error.',
    ne: 'बाह्य सेवा प्रदायक त्रुटि।'
  }
};
