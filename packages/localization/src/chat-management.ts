export const chatManagement = {
  create: 'निजी समूह बनाउनुहोस् (Create private group)',
  privateTitle: 'निजी समूह शीर्षक (Private group title)',
  title: 'समूह शीर्षक (Group title)',
  description: 'समूह विवरण (Group description)',
  search: 'सदस्य खोज्नुहोस् (Find group members)',
  searchButton: 'सदस्य खोज (Search members)',
  selected: 'छानिएका सदस्यहरू (Selected members)',
  info: 'समूह जानकारी (Group information)',
  refresh: 'पुनः लोड (Refresh group)',
  save: 'परिवर्तन सुरक्षित गर्नुहोस् (Save group settings)',
  add: 'सदस्य थप्नुहोस् (Add member)',
  remove: 'हटाउनुहोस् (Remove)',
  promote: 'व्यवस्थापक बनाउनुहोस् (Make admin)',
  demote: 'सदस्य बनाउनुहोस् (Make member)',
  transfer: 'स्वामित्व हस्तान्तरण (Transfer ownership)',
  close: 'बन्द गर्नुहोस् (Close)',
  historyNote: 'नयाँ वा पुनः थपिएका निजी समूह सदस्यले सदस्यता पछिका सन्देश मात्र देख्छन्। (New or restored private-group members see messages sent after joining.)',
  transferNote: 'समूह छाड्नुअघि मालिकले स्वामित्व अर्को सदस्यलाई दिनुपर्छ। (The owner must transfer ownership before leaving.)',
};

export const chatReceipts = {
 sent: 'पठाइयो (Sent)',
 delivered: 'प्राप्त भयो (Delivered)',
 read: 'पढियो (Read)',
};

export const chatOutboxLabels = {
 title: 'पठाउन बाँकी सन्देश (Queued messages)',
 queued: 'पठाउन बाँकी (Queued for sending)',
 failed: 'पठाउन सकिएन; जाँच गर्नुहोस् (Sending stopped; review or discard)',
 retry: 'पुनः प्रयास (Retry queued message)',
 discard: 'हटाउनुहोस् (Discard queued message)',
 discardNote: 'पठाउन बाँकी सन्देश हटाउने? सर्भरमा पहिले नै पुगेको सन्देश यसले हटाउँदैन। (Discard queued intent? This cannot unsend a message already received by the server.)',
 storage: 'सुरक्षित सन्देश भण्डारण वा सत्र उपलब्ध छैन। (Secure message queue or session unavailable.)',
};
