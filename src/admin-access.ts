export type AdminAccess='checking'|'allowed'|'denied'|'error';

export async function checkAdminAccess(request:()=>PromiseLike<{data:unknown;error:unknown}>,timeoutMs=15000):Promise<AdminAccess>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const result=await Promise.race([
      Promise.resolve().then(request),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeoutMs)}),
    ]);
    if(result.error)return 'error';
    if(result.data===true)return 'allowed';
    if(result.data===false)return 'denied';
    return 'error';
  }catch{return 'error'}finally{clearTimeout(timer)}
}
