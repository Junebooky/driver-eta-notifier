'use client';
import {createContext,useContext,type ReactNode} from 'react';

/** Presentation only; never used to grant authority or derive a data query. */
export interface TenantPresentation {
 displayName:string;appName:string;iconUrl:string;
}
const Context=createContext<TenantPresentation|null>(null);
export function TenantPresentationProvider({brand,children}:{brand:TenantPresentation;children:ReactNode}){
 return <Context.Provider value={brand}>{children}</Context.Provider>;
}
export function useTenantPresentation(){return useContext(Context);}
