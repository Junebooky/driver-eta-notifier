import type {CustomerContact} from '@/types/customerHq';

export function updateContactMemoById(
  contacts:CustomerContact[],contactId:string,memo:string,
):{found:boolean;contacts:CustomerContact[]}{
  const found=contacts.some(contact=>contact.id===contactId);
  return {found,contacts:found?contacts.map(contact=>
    contact.id===contactId?{...contact,memo}:contact):contacts};
}

export function readPersistedCustomerContacts(row:{
  id:string;contact_person?:string|null;phone?:string|null;email?:string|null;
  pricing_preset?:Record<string,unknown>|null;
}):CustomerContact[]{
  const saved=row.pricing_preset?.contacts;
  if(Array.isArray(saved)&&saved.length)return saved as CustomerContact[];
  if(!row.contact_person)return [];
  return [{
    id:'c-'+row.id+'-1', name:row.contact_person,
    role:'예약 담당자', phone:row.phone||'',email:row.email||'',isPrimary:true,
  }];
}
