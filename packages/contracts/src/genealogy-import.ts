/** Versioned, source-preserving staging only; promotion requires separate release gates. */
export interface GenealogyImportPerson {
 sourceId:string; nameNepali:string; nameEnglish?:string; gender:string; livingStatus:string;
 generation:number; sourceRef:string; consent:string; verification:string; visibility:string;
 targetPersonId?:string;
 sourceNames?:{givenNepali?:string;middleNepali?:string;familyNepali?:string;givenEnglish?:string;middleEnglish?:string;familyEnglish?:string;knownAs?:string};
 birth?:{value:string;calendar:string;precision:string}; death?:{value:string;calendar:string;precision:string};
}
export interface GenealogyImportParent {
 sourceId:string;parentSourceId:string;childSourceId:string;type:string;sourceRef:string;verification:string;
 sourceDetails?:{parentRole?:string;legalStatus?:string;startDate?:string;startCalendar?:string;endDate?:string;endCalendar?:string;certainty?:string;relationshipStatus?:string;visibility?:string;proposedBy?:string;reviewedBy?:string;reviewDate?:string;notes?:string};
}
export interface GenealogyImportEvidence {
 sourceId:string;sourceType:string;description:string;recordedDate:string;reliability:string;permission:string;accessClass:string;recordedBy:string;reviewStatus:string;
 custodian?:string;sourceDate?:string;language?:string;repository?:string;fileReference?:string;url?:string;relatedBranchId?:string;reviewedBy?:string;notes?:string;
}
export interface GenealogyImportUnion {
 sourceId:string;partner1SourceId:string;partner2SourceId:string;unionType:string;status:string;sourceRef:string;visibility:string;
 startDate?:string;startCalendar?:string;startPrecision?:string;endDate?:string;endCalendar?:string;endPrecision?:string;
 ceremonyPlace?:string;registrationRef?:string;consentLegalReview?:string;proposedBy?:string;reviewedBy?:string;notes?:string;
}
export interface GenealogyImportClaim {
 sourceId:string;entityType:string;entitySourceId:string;fieldOrRelationship:string;riskLevel:string;visibility:string;status:string;
 claimA?:string;claimASourceRef?:string;claimB?:string;claimBSourceRef?:string;assignedAuthority?:string;decision?:string;decisionEvidenceRef?:string;decisionDate?:string;appealStatus?:string;auditNotes?:string;
}
export interface GenealogyImportPayload { schemaVersion:1;datasetKey:string;branchId:string;sourceDescription:string;persons:GenealogyImportPerson[];parentLinks:GenealogyImportParent[];evidenceSources?:GenealogyImportEvidence[];unions?:GenealogyImportUnion[];claims?:GenealogyImportClaim[]; }
export interface GenealogyImportIssue {entity:'BATCH'|'PERSON'|'PARENT_LINK'|'SOURCE'|'UNION'|'CLAIM';sourceId:string;code:string;}
export interface GenealogyImportReport {
 peerBatches?:{id:string;sourceHash:string}[];
 validatorVersion:string;sourceHash:string;persons:number;parentLinks:number;mappedTargets:number;unmappedPersons:number;
 duplicateCandidatePersons:number;issues:GenealogyImportIssue[];validationPassed:boolean;promotionAllowed:false;gates:string[];
}
export interface GenealogyImportRun {id:string;sequence:number;createdAt:string;actorId:string;reason:string;report:GenealogyImportReport;}
export interface GenealogyImportBatch {id:string;datasetKey:string;branchId:string;sourceHash:string;sourceDescription:string;createdAt:string;createdBy:string;persons:number;parentLinks:number;}
export interface GenealogyImportDetail extends GenealogyImportBatch {payload:GenealogyImportPayload;runs:GenealogyImportRun[];}
