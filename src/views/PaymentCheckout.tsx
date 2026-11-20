import {useEffect, useState} from 'react';
import {authClient} from '../auth';

interface PlanInfo {
  planId: string;
  title: string;
  featureKey: string;
  amount: number;
  currencyCode: string;
  billingInterval: string;
}

interface Props {
  user: {id: string} | null;
  featureKey: string | null;
  onBack: () => void;
}

export default function PaymentCheckout({user, featureKey, onBack}: Props) {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !featureKey || !authClient) { setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const featureRes = await authClient.from('platform_features').select('key,title,enabled,price_amount,currency_code,billing_interval').eq('key', featureKey).maybeSingle();
        if (!active) return;
        if (featureRes.error || !featureRes.data) { setLoadError('تعذر تحميل تفاصيل الميزة.'); setLoading(false); return; }
        const feature = featureRes.data as {key: string; title: string; enabled: boolean; price_amount: number | null; currency_code: string | null; billing_interval: string | null};
        if (!feature.enabled) { setLoadError('هذه الميزة غير متاحة حاليًا.'); setLoading(false); return; }
        if (!feature.price_amount || !feature.currency_code) { setLoadError('لا يوجد سعر محدد لهذه الميزة.'); setLoading(false); return; }
        const planRes = await authClient.from('subscription_plans').select('id,feature_key,price_amount,currency_code,billing_interval,is_active').eq('feature_key', featureKey).eq('is_active', true).maybeSingle();
        if (!active) return;
        if (planRes.error || !planRes.data) { setLoadError('لا توجد خطة اشتراك نشطة لهذه الميزة.'); setLoading(false); return; }
        const planRow = planRes.data as {id: string; feature_key: string; price_amount: number; currency_code: string; billing_interval: string; is_active: boolean};
        setPlan({
          planId: planRow.id,
          title: feature.title,
          featureKey: feature.key,
          amount: Number(planRow.price_amount),
          currencyCode: planRow.currency_code,
          billingInterval: planRow.billing_interval
        });
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الدفع.');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user, featureKey]);

  if (!user) return <section className="panel" dir="rtl"><h2>تسجيل الدخول مطلوب</h2><p>سجّل الدخول للوصول إلى الدفع.</p><button className="soft-btn" onClick={onBack}>العودة</button></section>;
  if (loading) return <section className="panel" dir="rtl"><p>جارٍ تحميل تفاصيل الدفع…</p></section>;
  if (loadError) return <section className="panel" dir="rtl"><h2>تعذر تحميل الدفع</h2><p>{loadError}</p><button className="soft-btn" onClick={onBack}>العودة</button></section>;
  if (!plan) return <section className="panel" dir="rtl"><p>لا توجد خطة دفع متاحة.</p><button className="soft-btn" onClick={onBack}>العودة</button></section>;

  return (
    <section className="panel" dir="rtl">
      <h1>تفاصيل الاشتراك</h1>
      <p>الميزة: {plan.title}</p>
      <p>المبلغ: {new Intl.NumberFormat('ar-EG', {style: 'currency', currency: plan.currencyCode, maximumFractionDigits: 3}).format(plan.amount)} {plan.billingInterval === 'monthly' ? 'شهريًا' : plan.billingInterval === 'yearly' ? 'سنويًا' : ''}</p>
      <p>نوع الشراء: {plan.billingInterval === 'none' ? 'دفعة واحدة' : 'اشتراك متكرر'}</p>
      <p role="status">الدفع الإلكتروني غير متاح حاليًا؛ لم يكتمل اعتماد مزود الدفع والتحقق من Sandbox. لن يتم إنشاء طلب أو خصم مبلغ.</p>
      <div style={{display: 'flex', gap: 8, marginTop: 12}}>
        <button className="soft-btn" onClick={onBack}>العودة</button>
      </div>
    </section>
  );
}
