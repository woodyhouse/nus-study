// Vendored from nus-canvas-mobile/src/dates.ts by scripts/vendor-core.mjs. Do not edit here.
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function formatDay(value:string|null|undefined,options:{weekday?:boolean;year?:boolean}={}){
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '日期待公布';
  const date=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return '日期待公布';
  const day=`${months[date.getUTCMonth()]} ${date.getUTCDate()}${options.year?', '+date.getUTCFullYear():''}`;
  return day+(options.weekday?' · 周'+['日','一','二','三','四','五','六'][date.getUTCDay()]:'');
}
export function formatMonth(value:string){const [year,month]=value.split('-');return /^\d{4}$/.test(year)&&/^\d{2}$/.test(month)&&+month>=1&&+month<=12?`${months[+month-1]} ${year}`:'月份待公布';}
