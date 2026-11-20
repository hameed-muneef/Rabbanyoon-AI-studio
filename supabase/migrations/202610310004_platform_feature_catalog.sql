alter table public.platform_features alter column requires_premium set default false;

insert into public.platform_features(key,title,description,enabled,requires_premium)
values
  ('daily_planning','التخطيط اليومي','خطة اليوم والمهام الشخصية',true,false),
  ('weekly_planning','التخطيط الأسبوعي','تنظيم ومتابعة المهام الأسبوعية',true,false),
  ('monthly_planning','التخطيط الشهري','تنظيم ومتابعة الأهداف الشهرية',true,false),
  ('goal_tracking','الأهداف','الأهداف والخطوات العملية الشخصية',true,false),
  ('learning_journey','السير إلى الله','المسار التعليمي وموارده',true,false),
  ('self_reflection','محاسبة النفس','المراجعات الشخصية',true,false),
  ('adhkar','الأوراد','الأوراد والمتابعة الشخصية',true,false),
  ('private_circles','مجالس التواصي','المجالس الخاصة وعضويتها',true,false),
  ('teacher_portal','بوابة الشيخ والمعلم','أدوات المعلم وطلب الاعتماد',true,false),
  ('courses','مجالس العلم','استكشاف الدورات والدروس',true,false),
  ('study_circles','المدارسة','مدارسات الأعضاء وموادها وخططها',true,false),
  ('circle_live','جلسات التواصي المباشرة','فتح رابط اللقاء لأعضاء المجلس',true,false)
on conflict(key) do nothing;

update public.platform_features
   set requires_premium=false,price_amount=null,currency_code=null,billing_interval=null,
       updated_at=now()
 where key in ('daily_planning','weekly_planning','monthly_planning','goal_tracking','learning_journey',
   'self_reflection','adhkar','private_circles','teacher_portal','courses','study_circles','circle_live');

create or replace function public.save_platform_feature_pricing(
  p_key text,p_title text,p_description text,p_enabled boolean,p_requires_premium boolean,
  p_price_amount numeric,p_currency_code text,p_billing_interval text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb; v_currency text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  v_currency:=upper(btrim(coalesce(p_currency_code,'')));
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{2,63}$'
    or p_title is null or char_length(btrim(p_title)) not between 2 and 120
    or char_length(coalesce(p_description,''))>500
    or p_enabled is null or p_requires_premium is null then
    raise exception 'بيانات الميزة غير صالحة' using errcode='22023';
  end if;
  if not exists(select 1 from public.platform_features where key=p_key) then
    raise exception 'اختر ميزة موجودة في المنصة' using errcode='22023';
  end if;
  if p_requires_premium then
    if (p_price_amount is null)<>(v_currency='') or (p_price_amount is null)<>(p_billing_interval is null)
       or (p_price_amount is not null and (p_price_amount<=0 or p_price_amount>999999999.999
         or v_currency !~ '^[A-Z]{3}$' or p_billing_interval not in ('monthly','yearly'))) then
      raise exception 'أدخل سعرًا موجبًا وعملة من ثلاثة أحرف وفترة شهرية أو سنوية، أو اتركها جميعًا فارغة' using errcode='22023';
    end if;
  elsif p_price_amount is not null or v_currency<>'' or p_billing_interval is not null then
    raise exception 'الميزة المجانية لا تحمل إعداد سعر' using errcode='22023';
  end if;

  select jsonb_build_object('title',f.title,'description',f.description,'enabled',f.enabled,
    'requires_premium',f.requires_premium,'price_amount',f.price_amount,'currency_code',f.currency_code,
    'billing_interval',f.billing_interval)
    into v_before from public.platform_features f where f.key=p_key;
  update public.platform_features set title=btrim(p_title),description=coalesce(p_description,''),
    enabled=p_enabled,requires_premium=p_requires_premium,price_amount=p_price_amount,
    currency_code=nullif(v_currency,''),billing_interval=p_billing_interval,updated_at=now(),updated_by=auth.uid()
   where key=p_key;
  select jsonb_build_object('title',f.title,'description',f.description,'enabled',f.enabled,
    'requires_premium',f.requires_premium,'price_amount',f.price_amount,'currency_code',f.currency_code,
    'billing_interval',f.billing_interval)
    into v_after from public.platform_features f where f.key=p_key;
  insert into public.platform_feature_events(feature_key,before_state,after_state,changed_by)
  values(p_key,v_before,v_after,auth.uid());
end $$;

comment on table public.platform_features is
  'Selectable platform feature catalog; items are free by default and require an admin decision to become premium.';