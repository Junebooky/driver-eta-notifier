import type { CustomerContact } from '@/types/customerHq';

export type ContactChannelDraft = {
  name: string;
  role: string;
  department: string;
  phones: string[];
  emails: string[];
};

// Legacy customer contacts use a single phone/email; arrays are optional.
// When arrays are present, the first value is the preferred contact method.
export function contactPhones(contact: Pick<CustomerContact,'phone'|'phones'>): string[] {
  return Array.isArray(contact.phones)
    ? contact.phones.filter((value):value is string=>typeof value==='string'&&Boolean(value.trim()))
    : contact.phone?.trim()?[contact.phone.trim()]:[];
}
export function contactEmails(contact: Pick<CustomerContact,'email'|'emails'>): string[] {
  return Array.isArray(contact.emails)
    ? contact.emails.filter((value):value is string=>typeof value==='string'&&Boolean(value.trim()))
    : contact.email?.trim()?[contact.email.trim()]:[];
}
export function draftFromContact(contact:CustomerContact):ContactChannelDraft {
  return {name:contact.name,role:contact.role||'',department:contact.department||'',
    phones:contactPhones(contact).length?contactPhones(contact):[''],
    emails:contactEmails(contact).length?contactEmails(contact):['']};
}
export type ContactChannelValidation =
  |{ok:true;value:ContactChannelDraft}
  |{ok:false;error:string};

export function normalizeContactChannels(value:unknown):ContactChannelValidation {
  if(!value||typeof value!=='object')return {ok:false,error:'담당자 정보를 입력해 주세요.'};
  const input=value as Record<string,unknown>;
  if(typeof input.name!=='string'||typeof input.role!=='string'||typeof input.department!=='string')
    return {ok:false,error:'담당자 이름·직책·부서를 확인해 주세요.'};
  const name=input.name.trim(),role=input.role.trim(),department=input.department.trim();
  if(!name||name.length>120||role.length>120||department.length>120)
    return {ok:false,error:'담당자 이름은 필수이고, 이름·직책·부서는 각각 120자 이하여야 합니다.'};
  const parse=(key:'phones'|'emails')=>{
    const raw=input[key];
    if(!Array.isArray(raw)||raw.length>10||raw.some(v=>typeof v!=='string'))
      return null;
    const values=raw.map(v=>(v as string).trim()).filter(Boolean);
    if(values.some(v=>v.length>(key==='phones'?40:254)))return null;
    const normalized=key==='emails'?values.map(v=>v.toLowerCase()):values;
    return Array.from(new Set(normalized));
  };
  const phones=parse('phones'),emails=parse('emails');
  if(!phones||!emails)return {ok:false,error:'연락처와 이메일은 각각 최대 10개까지 입력할 수 있습니다.'};
  if(phones.some(v=>!^[+\d()\s.\-]+$/.test(v)||!/\d/.test(v)))
    return {ok:false,error:'전화번호는 숫자와 +, -, 괄호 등만 입력해 주세요.'};
  if(emails.some(v=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))
    return {ok:false,error:'이메일 주소를 확인해 주세요.'};
  return {ok:true,value:{name,role,department,phones,emails}};
}

export function updateContactDetails(
  contacts:CustomerContact[],contactId:string,value:ContactChannelDraft,
):{found:boolean;contacts:CustomerContact[];updated?:CustomerContact} {
  const previous=contacts.find(contact=>contact.id===contactId);
  if(!previous)return {found:false,contacts};
  const updated:CustomerContact={...previous,name:value.name,role:value.role,
    department:value.department,phones:value.phones,emails:value.emails,
    phone:value.phones[0]||'',email:value.emails[0]||''};
  return {found:true,updated,contacts:contacts.map(contact=>contact.id===contactId?updated:contact)};
}
