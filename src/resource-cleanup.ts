import {authClient} from './auth';

export async function cleanupRemovedBooks():Promise<number>{
  if(!authClient)throw new Error('خدمة التخزين غير مفعّلة.');
  const client=authClient;
  const {data:pending,error}=await client.from('resource_cleanup').select('storage_path').order('created_at').limit(100);
  if(error)throw new Error('تعذر قراءة قائمة تنظيف الملفات. تأكد من تطبيق ترحيل إدارة المصادر ثم أعد المحاولة.');
  for(const entry of pending??[]){
    const path=entry.storage_path as string;
    if(!/^[0-9a-f-]{36}\.pdf$/i.test(path))throw new Error('مسار ملف غير صالح في قائمة التنظيف.');
    const {data:allowed,error:checkError}=await client.rpc('can_delete_journey_book',{object_path:path});
    if(checkError)throw new Error('تعذر التحقق من ارتباطات الملف؛ لم يُحذف.');
    if(allowed===true){
      const {error:removeError}=await client.storage.from('journey-books').remove([path]);
      if(removeError)throw new Error('حُفظ المنهج، لكن تعذر حذف الملف من التخزين. أعد محاولة تنظيف الملفات.');
      // remove may return success with no affected rows if policy blocked it.
      const {data:remaining,error:listError}=await client.storage.from('journey-books').list('',{search:path,limit:100});
      if(listError||remaining?.some(item=>item.name===path))throw new Error('لم نتأكد من حذف الملف؛ أعد محاولة تنظيف الملفات.');
    }else if(allowed!==false){throw new Error('تعذر التحقق من صلاحية حذف الملف.')}
    // Reattached/shared files are deliberately retained; removal later requeues.
    const {error:ackError}=await client.from('resource_cleanup').delete().eq('storage_path',path);
    if(ackError)throw new Error('تعذر تحديث قائمة التنظيف؛ يمكن إعادة المحاولة بأمان.');
  }
  const {count,error:countError}=await client.from('resource_cleanup').select('storage_path',{count:'exact',head:true});
  if(countError)throw new Error('تعذر التحقق من اكتمال تنظيف الملفات.');
  return count??0;
}
