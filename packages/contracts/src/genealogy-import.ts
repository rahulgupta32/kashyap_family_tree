/** Versioned, source-preserving staging only; promotion requires separate release gates. */
export interface GenealogyImportPerson {
 sourceId:string; nameNepali:string; nameEnglish?:string; gender:string; livingStatus:string;
 generation:number; sourceRef:string; consent:string; verification:string; visibility:string;
 targetPersonId?:string;
 birth?:{value:string;calendar:string;precision:string}; death?:{value:string;calendar:string;precision:string};
}
export interface GenealogyImportParent {
 sourceId:string;parentSourceId:string;childSourceId:string;type:string;sourceRef:string;verification:string;
}
export interface GenealogyImportPayload { schemaVersion:1;datasetKey:string;branchId:string;sourceDescription:string;persons:GenealogyImportPerson[];parentLinks:GenealogyImportParent[]; }
export interface GenealogyImportIssue {entity:'BATCH'|'PERSON'|'PARENT_LINK';sourceId:string;code:string;}
export interface GenealogyImportReport {
 validatorVersion:string;sourceHash:string;persons:number;parentLinks:number;mappedTargets:number;unmappedPersons:number;
 duplicateCandidatePersons:number;issues:GenealogyImportIssue[];validationPassed:boolean;promotionAllowed:false;gates:string[];
}
export interface GenealogyImportRun {id:string;sequence:number;createdAt:string;actorId:string;reason:string;report:GenealogyImportReport;}
export interface GenealogyImportBatch {id:string;datasetKey:string;branchId:string;sourceHash:string;sourceDescription:string;createdAt:string;createdBy:string;persons:number;parentLinks:number;}
export interface GenealogyImportDetail extends GenealogyImportBatch {payload:GenealogyImportPayload;runs:GenealogyImportRun[];}
