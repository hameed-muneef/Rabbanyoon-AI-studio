import {useEffect, useState} from 'react';
import {authClient} from '../auth';

interface OrderRow {order_id: string; status: string; amount: number; currency_code: string; created_at: string; provider_order_id: string | null}
interface InvoiceRow {invoice_id: string; invoice_number: string; amount: number; currency_code: string; status: string; issue_at: string; paid_at: string | null}
interface SubInfo {status: string; paid_until?: string | null; cancelled_at?: string | null}

interface Props { user: {id: string} | null; onBack: () => void; onNotify: (text: string) => void }

export default function PaymentHistory({user, onBack, onNotify}: Props) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [subscription, setSubscription] = useState<SubInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    if (!user || !authClient) return;
    setLoading(true); setError(null);
    try {
      const [oRes, iRes, sRes] = await Promise.all([
        authClient.rpc('list_payment_orders', {p_user_id: user.id, p_limit: 50, p_offset: 0}),
        authClient.rpc('list_invoices', {p_user_id: user.id, p_limit: 50, p_offset: 0}),
        authClient.rpc('get_user_subscription', {p_user_id: user.id})
      ]);
      if (oRes.error) throw new Error(oRes.error.message);
      if (iRes.error) throw new Error(iRes.error.message);
      if (sRes.error) throw new Error(sRes.error.message);
      setOrders((oRes.data as OrderRow[]) ?? []);
      setInvoices((iRes.data as InvoiceRow[]) ?? []);
      setSubscription((sRes.data as SubInfo) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل سجل الدفع.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [user]);

  const cancelSubscription = async () => {
    if (!user || !authClient) return;
    setCancelling(true);
    try {
      const {error} = await authClient.rpc('cancel_subscription', {p_user_id: user.id});
      if (error) throw new Error(error.message);
      onNotify('تم إلغاء الاشتراك. لن تُفرض رسوم مستقبلية.');
      await load();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إلغاء الاشتراك.');
    } finally {
      setCancelling(false);
    }
  };

  if (!user) return <section className="panel" dir="rtl"><h2>تسجيل الدخول مطلوب</h2><button className="soft-btn" onClick={onBack}>العودة</button></section>;
  if (loading) return <section className="panel" dir="rtl"><p>جارٍ تحميل سجل الدفع…</p></section>;
  if (error) return <section className="panel" dir="rtl"><h2>خطأ</h2><p>{error}</p><button className="soft-btn" onClick={load}>إعادة المحاولة</button></section>;

  return (
    <section className="panel" dir="rtl">
      <h1>سجل الدفع والاشتراكات</h1>
      <h2>الاشتراك</h2>
      <p>الحالة: {subscription?.status ?? 'none'}</p>
      {subscription?.paid_until && <p>مدفوع حتى: {new Date(subscription.paid_until).toLocaleDateString('ar-EG')}</p>}
      {subscription?.status === 'active' && (
        <button className="soft-btn" onClick={cancelSubscription} disabled={cancelling}>{cancelling ? 'جارٍ الإلغاء…' : 'إلغاء الاشتراك'}</button>
      )}
      <h2>الطلبات</h2>
      {orders.length === 0 ? <p>لا توجد طلبات.</p> : (
        <ul>{orders.map(o => (
          <li key={o.order_id}>{new Date(o.created_at).toLocaleDateString('ar-EG')} — {o.amount} {o.currency_code} — {o.status}</li>
        ))}</ul>
      )}
      <h2>الفواتير</h2>
      {invoices.length === 0 ? <p>لا توجد فواتير.</p> : (
        <ul>{invoices.map(i => (
          <li key={i.invoice_id}>{i.invoice_number} — {i.amount} {i.currency_code} — {i.status}</li>
        ))}</ul>
      )}
      <button className="soft-btn" onClick={onBack}>العودة</button>
    </section>
  );
}
