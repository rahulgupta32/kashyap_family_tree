import { BadRequestException } from '@nestjs/common';
import { BS_YEAR_MONTHS, isValidBsDate } from '@kashyap/localization';

export function calendarPeriod(source:unknown,view:unknown,date:unknown){
 if(!['AD','BS'].includes(source as string)||!['DAY','MONTH','AGENDA'].includes(view as string)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new BadRequestException('Choose a source, view and valid YYYY-MM-DD date');
 const [year,month,day]=date.split('-').map(Number);
 const ad=new Date(Date.UTC(year,month-1,day));
 const valid=source==='BS'?isValidBsDate(year,month,day):year>=1900&&year<=2100&&ad.toISOString().slice(0,10)===date;
 if(!valid)throw new BadRequestException('Date is outside the supported source calendar');
 const daysInMonth=source==='BS'?BS_YEAR_MONTHS[year][month-1]:new Date(Date.UTC(year,month,0)).getUTCDate();
 const start=view==='DAY'?date:`${date.slice(0,7)}-01`;
 const end=source==='AD'?new Date(view==='DAY'?Date.UTC(year,month-1,day+1):Date.UTC(year,month,1)).toISOString().slice(0,10):null;
 const min=source==='BS'?2000:1900,max=source==='BS'?2090:2100;
 const format=(y:number,m:number,d:number)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const shift=(delta:number,last=false)=>{const absolute=year*12+month-1+delta,y=Math.floor(absolute/12),m=absolute%12+1;
  if(y<min||y>max)return null;const length=source==='BS'?BS_YEAR_MONTHS[y][m-1]:new Date(Date.UTC(y,m,0)).getUTCDate();return format(y,m,last?length:1);};
 const previousDate=view==='DAY'?(day>1?format(year,month,day-1):shift(-1,true)):shift(-1);
 const nextDate=view==='DAY'?(day<daysInMonth?format(year,month,day+1):shift(1)):shift(1);
 return {previousDate,nextDate,source:source as 'AD'|'BS',view:view as 'DAY'|'MONTH'|'AGENDA',date,year,month,day,daysInMonth,start,end,prefix:date.slice(0,7),timeZone:'Asia/Kathmandu'};
}
export function periodCursor(before:unknown,period:ReturnType<typeof calendarPeriod>){
 if(before===undefined)return {date:null,sequence:null};
 if(typeof before!=='string')throw new BadRequestException('Invalid period cursor');
 const parts=before.split('|');
 if(parts.length!==2||!/^[1-9][0-9]{0,18}$/.test(parts[1])||BigInt(parts[1])>9223372036854775807n)throw new BadRequestException('Invalid period cursor');
 if(parts[0]==='UNDATED'){
  if(period.source!=='BS'||period.view==='DAY')throw new BadRequestException('Invalid period cursor');
 }else{
  calendarPeriod(period.source,'DAY',parts[0]);
  if(period.view==='DAY'?parts[0]!==period.date:parts[0].slice(0,7)!==period.prefix)throw new BadRequestException('Cursor belongs to another period');
 }
 return {date:parts[0],sequence:parts[1]};
}
