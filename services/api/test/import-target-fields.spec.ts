import { validateTargetFields } from '../src/modules/genealogy-import/import-target-fields';
const person:any={sourceId:'source-one',nameNepali:'काल्पनिक अधिकारी',nameEnglish:'Fictional Adhikari',generation:2,gender:'UNKNOWN',livingStatus:'DECEASED',birth:{calendar:'AD',precision:'EXACT',value:'1950-01-02'},death:{calendar:'AD',precision:'EXACT',value:'2020-03-04'}};
const target={generation:2,gender:'UNKNOWN',living_status:'DECEASED',nepali_names:[person.nameNepali],english_names:[person.nameEnglish],birth_date:'1950-01-02',death_date:'2020-03-04'};
describe('Import target field reconciliation',()=>{
 it('accepts exact fields and names present among existing aliases',()=>{expect(validateTargetFields(person,{...target,nepali_names:['other',person.nameNepali]})).toEqual([]);});
 it('requires review of each changed field without recording old or new values',()=>{
  const issues=validateTargetFields(person,{generation:1,gender:'MALE',living_status:'LIVING',nepali_names:['private target name'],english_names:[],birth_date:null,death_date:'2020-03-05'});
  expect(issues.map(i=>i.code)).toEqual(['TARGET_GENERATION_RECONCILIATION_REQUIRED','TARGET_GENDER_RECONCILIATION_REQUIRED','TARGET_LIVING_STATUS_RECONCILIATION_REQUIRED','TARGET_NEPALI_NAME_RECONCILIATION_REQUIRED','TARGET_ENGLISH_NAME_RECONCILIATION_REQUIRED','TARGET_BIRTH_DATE_AD_RECONCILIATION_REQUIRED','TARGET_DEATH_DATE_AD_RECONCILIATION_REQUIRED']);
  expect(issues.every(i=>i.sourceId==='source-one'&&i.entity==='PERSON')).toBe(true);expect(JSON.stringify(issues)).not.toMatch(/1950|2020|private target name|Fictional/);
 });
 it('does not treat unspecified English names or dates as a deletion',()=>{expect(validateTargetFields({...person,nameEnglish:undefined,birth:undefined,death:undefined},target)).toEqual([]);});
 it('does not convert BS, Tithi or approximate dates for target comparison',()=>{expect(validateTargetFields({...person,birth:{...person.birth,calendar:'BS'},death:{...person.death,precision:'YEAR'}},target)).toEqual([]);});
 it('requires spelling review rather than silently normalizing an accepted name',()=>{expect(validateTargetFields({...person,nameNepali:` ${person.nameNepali} `},target).map(i=>i.code)).toEqual(['TARGET_NEPALI_NAME_RECONCILIATION_REQUIRED']);});
});
