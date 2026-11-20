import {BadRequestException,NotFoundException} from '@nestjs/common';
import {ApplicationSettingKey} from '@kashyap/contracts';
export const settingCatalog = {
 'calendar.max_invitees': {type:'INTEGER',labelEnglish:'Invitation account limit',labelNepali:'आमन्त्रित खाताको सीमा',descriptionEnglish:'Maximum accounts in a new or replaced invitation list.',descriptionNepali:'नयाँ वा प्रतिस्थापित आमन्त्रण सूचीमा खाताको अधिकतम संख्या।',minimum:1,maximum:100},
 'calendar.max_audience_persons': {type:'INTEGER',labelEnglish:'Audience Person limit',labelNepali:'समूहमा व्यक्तिको सीमा',descriptionEnglish:'Maximum visible Persons in a genealogy audience basis, including its ancestor.',descriptionNepali:'पूर्वजसहित वंशावली समूहको आधारमा देखिने व्यक्तिहरूको अधिकतम संख्या।',minimum:1,maximum:1000},
 'calendar.max_audience_edges': {type:'INTEGER',labelEnglish:'Audience link limit',labelNepali:'समूहमा सम्बन्धको सीमा',descriptionEnglish:'Maximum verified parent links retained in an audience basis.',descriptionNepali:'समूहको आधारमा सुरक्षित प्रमाणित अभिभावक सम्बन्धको अधिकतम संख्या।',minimum:1,maximum:10000},
 'calendar.preview_ttl_minutes': {type:'INTEGER',labelEnglish:'Audience preview lifetime',labelNepali:'समूह पूर्वावलोकनको अवधि',descriptionEnglish:'Lifetime in minutes for newly created genealogy previews.',descriptionNepali:'नयाँ वंशावली पूर्वावलोकनको अवधि, मिनेटमा।',minimum:1,maximum:10},
} as const;
export function settingDefinition(key:string){
 if(!Object.prototype.hasOwnProperty.call(settingCatalog,key))throw new NotFoundException('Setting unavailable');
 return settingCatalog[key as ApplicationSettingKey];
}
export function settingValue(key:string,value:unknown):number{
 const d=settingDefinition(key);
 if(typeof value!=='number'||!Number.isInteger(value)||value<d.minimum||value>d.maximum)throw new BadRequestException(`Value must be an integer from ${d.minimum} to ${d.maximum}`);
 return value;
}
