import type {State} from './app-state';
import {loadFromRaw} from './app-state';
import {authClient} from './auth';

export function toCloudPayload(state:State):State{
  return state;
}

export async function fetchCloudState(userId:string):Promise<State|null>{
  if(!authClient)throw new Error('خدمة الحسابات غير مفعّلة.');
  const {data,error}=await authClient.rpc('load_my_user_state');
  if(!error){
    if(!data)return null;
    return loadFromRaw(JSON.stringify(data));
  }
  const {data:legacyData,error:legacyError}=await authClient.from('user_data').select('payload').eq('user_id',userId).maybeSingle();
  if(legacyError)throw legacyError;
  if(!legacyData)return null;
  return loadFromRaw(JSON.stringify(legacyData.payload));
}

export async function saveCloudState(userId:string,state:State):Promise<void>{
  if(!authClient)throw new Error('خدمة الحسابات غير مفعّلة.');
  const {error}=await authClient.from('user_data').upsert({user_id:userId,payload:toCloudPayload(state),updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw error;
}
