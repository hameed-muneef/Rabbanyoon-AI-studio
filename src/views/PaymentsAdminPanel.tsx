import {useEffect, useState} from 'react';
import {authClient} from '../auth';

interface Gateway {gateway_id: string; code: string; name: string; is_enabled: boolean; is_sandbox: boolean; is_default: boolean; base_url: string; create_order_path: string; callback_path: string}
interface OrderRow {order_id: string; user_id: string; status: string; amount: number; currency_code: string; created_at: string}
interface SummaryRow {currency_code: string; provider: string; status: string; order_count: number; total_amount: number}
interface Readiness {integration_status: string; database_setup: string; provider_selected: string; provider_name: string; merchant_account_approval: string; sandbox_configured: string; webhook_configured: string; signature_verification: string; sandbox_tested: string; production_credentials: string; live_payments_enabled: string; notes: string}

interface Props { user: {id: string} | null; onNotify: (text: string) => void }

function readinessLabel(value: string): string {
  const labels: Record<string, string> = {
    ready: 'جاهزة',
    not_ready: 'غير جاهزة',
    none: 'لم يُحدَّد',
    not_configured: 'لم يُهيأ أي مزود',
    configuration_incomplete: 'الإعداد غير مكتمل؛ يلزم تكامل موثق وإعداد Webhook والتحقق من التوقيع',
    sandbox_ready: 'جاهز لاختبارات Sandbox؛ لم تُنفذ بعد',
    sandbox_verified: 'تم التحقق من Sandbox؛ يلزم اعتماد الحساب والتحقق من بيانات الإنتاج',
    awaiting_provider_approval: 'تم اختبار Sandbox؛ بانتظار اعتماد حساب المزود',
    production_ready: 'اجتازت متطلبات الجاهزية؛ الدفع المباشر ما زال مقفلاً ويتطلب تفعيلاً منفصلاً',
    approved: 'معتمد',
    pending: 'بانتظار الاعتماد',
    configured: 'مهيأ',
    production_mode: 'إعداد إنتاجي غير متاح',
    implemented: 'منفذ',
    not_implemented: 'لم يُنفذ بعد؛ لا يوجد موفر موثق',
    verified: 'تم التحقق',
    not_tested: 'لم يُختبر',
    not_verified: 'لم يتم التحقق',
    disabled: 'معطل — لا يمكن تفعيل الدفع قبل تكامل موثق واختبار Sandbox'
  };
  return labels[value] ?? value;
}

export default function PaymentsAdminPanel({onNotify}: Props) {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!authClient) return;
    setLoading(true); setError(null);
    try {
      const [gRes, oRes, sRes, rRes] = await Promise.all([
        authClient.from('payment_gateways').select('id,code,name,is_enabled,is_sandbox,is_default,base_url,create_order_path,callback_path'),
        authClient.rpc('list_payment_orders_admin', {p_limit: 50, p_offset: 0}),
        authClient.rpc('payment_revenue_summary', {}),
        authClient.rpc('get_payment_integration_status', {})
      ]);
      if (gRes.error) throw new Error(gRes.error.message);
      if (oRes.error) throw new Error(oRes.error.message);
      if (sRes.error) throw new Error(sRes.error.message);
      if (rRes.error) throw new Error(rRes.error.message);
      setGateways(((gRes.data as Array<{id: string; code: string; name: string; is_enabled: boolean; is_sandbox: boolean; is_default: boolean; base_url: string; create_order_path: string; callback_path: string}>) ?? []).map(g => ({gateway_id: g.id, code: g.code, name: g.name, is_enabled: g.is_enabled, is_sandbox: g.is_sandbox, is_default: g.is_default, base_url: g.base_url, create_order_path: g.create_order_path, callback_path: g.callback_path})));
      setOrders((oRes.data as OrderRow[]) ?? []);
      setSummary((sRes.data as SummaryRow[]) ?? []);
      setReadiness((rRes.data as Readiness) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الدفع.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleGateway = async (g: Gateway) => {
    if (!authClient) return;
    try {
      const {error} = await authClient.rpc('admin_set_payment_gateway', {
        p_gateway_id: g.gateway_id,
        p_is_enabled: !g.is_enabled,
        p_is_sandbox: g.is_sandbox,
        p_base_url: g.base_url,
        p_create_order_path: g.create_order_path,
        p_callback_path: g.callback_path
      });
      if (error) throw new Error(error.message);
      onNotify('تم تحديث المزود.');
      await load();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحديث المزود.');
    }
  };

  const setDefault = async (g: Gateway) => {
    if (!authClient) return;
    try {
      const {error} = await authClient.rpc('admin_set_default_payment_gateway', {p_gateway_id: g.gateway_id});
      if (error) throw new Error(error.message);
      onNotify('تم تعيين المزود كافتراضي.');
      await load();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تعيين المزود الافتراضي.');
    }
  };

  if (loading) return <section className="panel" dir="rtl"><p>جارٍ تحميل بيانات الدفع…</p></section>;
  if (error) return <section className="panel" dir="rtl"><h2>خطأ</h2><p>{error}</p><button className="soft-btn" onClick={load}>إعادة المحاولة</button></section>;

  return (
    <section className="panel" dir="rtl">
      <h1>إدارة الدفع</h1>
      {readiness && <div className="panel" dir="rtl" style={{marginBottom: 12}}>
        <h2>حالة جاهزية الدفع</h2>
        <ul>
          <li>الحالة العامة للتكامل: {readinessLabel(readiness.integration_status)}</li>
          <li>قاعدة البيانات: {readinessLabel(readiness.database_setup)}</li>
          <li>المزود المختار: {readiness.provider_name} ({readinessLabel(readiness.provider_selected)})</li>
          <li>اعتماد الحساب التجاري: {readinessLabel(readiness.merchant_account_approval)}</li>
          <li>إعداد Sandbox: {readinessLabel(readiness.sandbox_configured)}</li>
          <li>إعداد Webhook: {readinessLabel(readiness.webhook_configured)}</li>
          <li>التحقق من التوقيع: {readinessLabel(readiness.signature_verification)}</li>
          <li>اختبار Sandbox: {readinessLabel(readiness.sandbox_tested)}</li>
          <li>بيانات الإنتاج: {readinessLabel(readiness.production_credentials)}</li>
          <li>الدفع المباشر: {readinessLabel(readiness.live_payments_enabled)}</li>
        </ul>
        <p>مؤشرات الاعتماد والإعداد تُسجل للمراجعة الإدارية فقط. الدفع المباشر مقفل خادميًا حتى توثيق موفر واختبار تكامله؛ لا تُدخل أسرار الدفع هنا.</p>
        {readiness.notes && <p>{readiness.notes}</p>}
      </div>}
      <h2>المزودات</h2>
      <ul>{gateways.map(g => (
        <li key={g.gateway_id}>{g.name} ({g.code}) — {g.is_enabled ? 'مفعّل' : 'معطّل'} — {g.is_sandbox ? 'بيئة اختبار' : 'إنتاج'} {g.is_default ? ' — افتراضي' : ''}
          <button className="soft-btn" onClick={() => toggleGateway(g)} style={{marginInlineStart: 8}}>{g.is_enabled ? 'تعطيل' : 'تفعيل'}</button>
          {!g.is_default && <button className="soft-btn" onClick={() => setDefault(g)} style={{marginInlineStart: 8}}>تعيين كافتراضي</button>}
        </li>
      ))}</ul>
      <h2>الإيرادات (حسب العملة/المزود/الحالة)</h2>
      <ul>{summary.map((s, i) => (
        <li key={i}>{s.currency_code} — {s.provider} — {s.status}: {s.order_count} طلب، {s.total_amount}</li>
      ))}</ul>
      <h2>آخر الطلبات</h2>
      <ul>{orders.map(o => (
        <li key={o.order_id}>{new Date(o.created_at).toLocaleDateString('ar-EG')} — {o.amount} {o.currency_code} — {o.status} — {o.user_id.slice(0, 8)}</li>
      ))}</ul>
    </section>
  );
}
