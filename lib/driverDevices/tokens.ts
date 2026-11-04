import {randomBytes,createHash} from 'node:crypto';
export const devicePrefix='cockpit_d1.';
export const newDeviceSecret=()=>randomBytes(32).toString('base64url');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const validSecret=(token:unknown):token is string=>typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
