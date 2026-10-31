import { GenealogyImportPerson, GenealogyImportIssue } from '@kashyap/contracts';

/** Differences require review, including filling an empty target field. Never authorizes a write. */
export function validateTargetFields(person:GenealogyImportPerson,target:{generation:number;gender:string;living_status:string;birth_date:string|null;death_date:string|null;nepali_names:string[];english_names:string[]}):GenealogyImportIssue[] {
 const issues:GenealogyImportIssue[]=[];
 const add=(field:string)=>issues.push({entity:'PERSON',sourceId:person.sourceId,code:`TARGET_${field}_RECONCILIATION_REQUIRED`});
 if(person.generation!==target.generation)add('GENERATION');
 if(person.gender!==target.gender)add('GENDER');
 if(person.livingStatus!==target.living_status)add('LIVING_STATUS');
 // Exact source spelling is retained; normalized matches are duplicate candidates,
 // not permission to replace a name or add an alias to an accepted Person.
 if(!target.nepali_names.includes(person.nameNepali))add('NEPALI_NAME');
 if(person.nameEnglish!==undefined&&!target.english_names.includes(person.nameEnglish))add('ENGLISH_NAME');
 for(const [field,date,existing] of [['BIRTH_DATE_AD',person.birth,target.birth_date],['DEATH_DATE_AD',person.death,target.death_date]] as const){
  if(date?.calendar==='AD'&&date.precision==='EXACT'&&date.value!==existing)add(field);
 }
 return issues;
}
