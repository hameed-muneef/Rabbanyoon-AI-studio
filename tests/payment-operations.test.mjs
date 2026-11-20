import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  admin: '33333333-3333-4333-8333-333333333333'
};

async function setup() {
  const db = new PGlite({extensions: {pgcrypto}});
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key, bucket_id text, name text);
    alter table storage.objects enable row level security; create extension if not exists pgcrypto;`);
  for (const id of Object.values(ids)) await db.query('insert into auth.users(id) values($1)', [id]);
  await db.exec('begin');
  await applyMigrations(client, await readMigrations());
  await db.exec('commit');
  await db.query('insert into public.admin_accounts(user_id) values($1)', [ids.admin]);

  const gatewayId = (await db.query(`insert into public.payment_gateways(code,name,is_enabled,is_sandbox,base_url,create_order_path,callback_path,supported_currencies,supported_methods,fee_percent)
    values('xpay','XPay',true,true,'https://sandbox.xpay.example.com','/v1/payments','/v1/payments/callback','{EGP,USD}','{card,wallet}',0) returning id`)).rows[0].id;
  const planId = (await db.query(`insert into public.subscription_plans(feature_key,name,billing_interval,price_amount,currency_code,trial_days,is_active)
    values('circle_live','Premium Monthly','monthly',10.00,'EGP',0,true) returning id`)).rows[0].id;
  await db.query(`update public.platform_features set requires_premium=true where key='circle_live'`);

  const asUser = async (id, fn) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const q = (sql, params) => db.query(sql, params);
  const fails = async (promise, code) => {
    await assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });
  };
  return {db, q, asUser, fails, gatewayId, planId};
}

test('payment operations: orders, activation, failure, refund, cancel and authorization', async () => {
  const {db, q, asUser, fails, gatewayId, planId} = await setup();
  try {
    for (const table of ['payment_gateways', 'subscription_plans', 'invoices']) {
      const privileges = (await q(`select
        has_table_privilege('authenticated', $1, 'SELECT') as can_select,
        has_table_privilege('authenticated', $1, 'INSERT') as can_insert,
        has_table_privilege('authenticated', $1, 'UPDATE') as can_update,
        has_table_privilege('authenticated', $1, 'DELETE') as can_delete`, [`public.${table}`])).rows[0];
      assert.equal(privileges.can_select, true, `${table} should remain readable where RLS permits`);
      assert.equal(privileges.can_insert, false, `${table} should not allow direct inserts`);
      assert.equal(privileges.can_update, false, `${table} should not allow direct updates`);
      assert.equal(privileges.can_delete, false, `${table} should not allow direct deletes`);
    }

    const readiness = await asUser(ids.admin, async () =>
      (await q('select public.get_payment_integration_status() as status')).rows[0].status);
    assert.equal(readiness.integration_status, 'configuration_incomplete');
    assert.equal(readiness.signature_verification, 'not_implemented');
    assert.equal(readiness.live_payments_enabled, 'disabled');
    assert.equal((await q(`select has_function_privilege('service_role',
      'public.mark_payment_order_succeeded(uuid,text,text,numeric,text,text,text)', 'EXECUTE') as allowed`)).rows[0].allowed, true);
    await asUser(ids.admin, async () =>
      fails(q(`select public.admin_update_payment_integration_status(true,true,true,true,true,'test')`), '55000'));

    // Authenticated users cannot create orders or invoices for another account.
    await asUser(ids.bob, async () =>
      fails(q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'other-user-order', 'Premium monthly']), '42501'));

    // Create order (idempotent).
    const key = 'idemp-001';
    const first = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', key, 'Premium monthly'])).rows[0].r);
    assert.equal(first.created, true);
    assert.equal(first.status, 'pending');
    const second = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', key, 'Premium monthly'])).rows[0].r);
    assert.equal(second.created, false);
    assert.equal(second.order_id, first.order_id);
    const concurrentCheckout = await asUser(ids.alice, () => Promise.all([
      q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'idemp-concurrent-checkout', 'Premium monthly']),
      q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'idemp-concurrent-checkout', 'Premium monthly'])
    ]));
    assert.equal(concurrentCheckout[0].rows[0].r.order_id, concurrentCheckout[1].rows[0].r.order_id);
    assert.deepEqual(concurrentCheckout.map(result => result.rows[0].r.created).sort(), [false, true]);
    // Amount/currency must match the plan (server-trusted).
    await asUser(ids.alice, async () =>
      fails(q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 999, 'EGP', 'idemp-mismatch', 'x']), '22023'));
    const orderId = first.order_id;

    // Get order.
    const got = await asUser(ids.alice, async () =>
      (await q('select public.get_payment_order($1,$2) as r', [orderId, ids.alice])).rows[0].r);
    assert.equal(got.order_id, orderId);
    assert.equal(got.status, 'pending');

    // Bob cannot read Alice's order.
    await asUser(ids.bob, async () =>
      fails(q('select public.get_payment_order($1,$2) as r', [orderId, ids.alice]), '42501'));

    // Alice cannot activate her own order.
    await asUser(ids.alice, async () =>
      fails(q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [orderId, 'prov-1', 'approved', 10, 'EGP', 'pay-1', 'evt-1']), '42501'));
    await asUser(ids.bob, async () =>
      fails(q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [orderId, 'prov-1', 'approved', 10, 'EGP', 'pay-1', 'evt-bob']), '42501'));
    await asUser(ids.admin, async () => {
      await fails(q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7)', [orderId, 'prov-1', 'approved', 9, 'EGP', 'pay-wrong-amount', 'evt-wrong-amount']), '22023');
      await fails(q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7)', [orderId, 'prov-1', 'approved', 10, 'USD', 'pay-wrong-currency', 'evt-wrong-currency']), '22023');
    });

    // Admin activates → subscription active, invoice paid.
    const succeeded = await asUser(ids.admin, async () =>
      (await q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [orderId, 'prov-1', 'approved', 10, 'EGP', 'pay-1', 'evt-1'])).rows[0].r);
    assert.equal(succeeded.status, 'succeeded');
    assert.equal(succeeded.invoice_status, 'paid');
    const sub = await asUser(ids.alice, async () =>
      (await q('select public.get_user_subscription($1) as r', [ids.alice])).rows[0].r);
    assert.equal(sub.status, 'active');
    const subRow = (await db.query('select feature_key from public.subscriptions where user_id=$1', [ids.alice])).rows[0];
    assert.equal(subRow.feature_key, 'circle_live');
    await asUser(ids.alice, async () =>
      fails(q('select public.cancel_payment_order($1,$2,$3)', [orderId, 'do not revoke paid access', ids.alice]), '55000'));
    await asUser(ids.admin, async () =>
      fails(q('select public.mark_payment_order_failed($1,$2,$3)', [orderId, 'declined', 'late failure']), '55000'));

    const expiredOrder = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'idemp-expired', 'Expired checkout'])).rows[0].r);
    await q(`update public.payment_orders set expires_at=now()-interval '1 second' where id=$1`, [expiredOrder.order_id]);
    await asUser(ids.admin, async () =>
      fails(q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7)', [expiredOrder.order_id, 'prov-expired', 'approved', 10, 'EGP', 'pay-expired', 'evt-expired']), 'P0001'));

    // Buying another feature must not reactivate an unrelated cancelled subscription.
    const otherPlanId = (await q(`insert into public.subscription_plans(feature_key,name,billing_interval,price_amount,currency_code,trial_days,is_active)
      values('other_feature','Other Feature Monthly','monthly',15.00,'EGP',0,true) returning id`)).rows[0].id;
    const nextPlanId = (await q(`insert into public.subscription_plans(feature_key,name,billing_interval,price_amount,currency_code,trial_days,is_active)
      values('study_tracks','Study Tracks Monthly','monthly',20.00,'EGP',0,true) returning id`)).rows[0].id;
    await q(`insert into public.platform_features(key,title,enabled,requires_premium)
      values('other_feature','Other Feature',true,true),('study_tracks','Study Tracks',true,true)`);
    await q(`insert into public.subscriptions(user_id,plan_id,feature_key,status,provider,provider_subscription_id,paid_until)
      values($1,$2,'other_feature','cancelled','xpay','cancelled-other-feature',now()+interval '20 days')`, [ids.alice, otherPlanId]);
    const nextOrder = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, nextPlanId, gatewayId, 20, 'EGP', 'idemp-other-feature', 'Study tracks monthly'])).rows[0].r);
    await asUser(ids.admin, async () =>
      q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [nextOrder.order_id, 'prov-study', 'approved', 20, 'EGP', 'pay-study', 'evt-study']));
    const unrelatedSubscription = (await q(`select status from public.subscriptions
      where user_id=$1 and plan_id=$2`, [ids.alice, otherPlanId])).rows[0];
    assert.equal(unrelatedSubscription.status, 'cancelled');
    const unrelatedAccess = await asUser(ids.alice, async () =>
      (await q('select public.has_feature_access($1) as allowed', ['other_feature'])).rows[0].allowed);
    assert.equal(unrelatedAccess, false);
    const purchasedAccess = await asUser(ids.alice, async () =>
      (await q('select public.has_feature_access($1) as allowed', ['study_tracks'])).rows[0].allowed);
    assert.equal(purchasedAccess, true);

    // Reusing an event ID for another order must not activate that order.
    const replayOrder = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'idemp-replay-other-order', 'Premium monthly'])).rows[0].r);
    const crossOrderReplay = await asUser(ids.admin, async () =>
      (await q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [replayOrder.order_id, 'prov-replay', 'approved', 10, 'EGP', 'pay-replay', 'evt-1'])).rows[0].r);
    assert.equal(crossOrderReplay.duplicate, true);
    assert.equal((await q('select status from public.payment_orders where id=$1', [replayOrder.order_id])).rows[0].status, 'pending');

    // Renewals extend from the current paid-through date.
    const beforeRenewal = (await q(`select paid_until from public.subscriptions where user_id=$1 and plan_id=$2`, [ids.alice, planId])).rows[0].paid_until;
    const renewalOrder = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'idemp-renewal', 'Premium monthly renewal'])).rows[0].r);
    await asUser(ids.admin, async () =>
      q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7)', [renewalOrder.order_id, 'prov-renewal', 'approved', 10, 'EGP', 'pay-renewal', 'evt-renewal']));
    const afterRenewal = (await q(`select paid_until from public.subscriptions where user_id=$1 and plan_id=$2`, [ids.alice, planId])).rows[0].paid_until;
    assert.ok(new Date(afterRenewal).getTime() > new Date(beforeRenewal).getTime());

    // One-time purchases grant access without an artificial 30-day expiry.
    const oneTimePlanId = (await q(`insert into public.subscription_plans(feature_key,name,billing_interval,price_amount,currency_code,trial_days,is_active)
      values('one_time_feature','Lifetime Purchase','none',25.00,'EGP',0,true) returning id`)).rows[0].id;
    await q(`insert into public.platform_features(key,title,enabled,requires_premium)
      values('one_time_feature','One-time feature',true,true)`);
    const oneTimeOrder = await asUser(ids.bob, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.bob, oneTimePlanId, gatewayId, 25, 'EGP', 'idemp-one-time', 'Lifetime purchase'])).rows[0].r);
    await asUser(ids.admin, async () =>
      q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7)', [oneTimeOrder.order_id, 'prov-one-time', 'approved', 25, 'EGP', 'pay-one-time', 'evt-one-time']));
    assert.equal((await q('select paid_until from public.subscriptions where user_id=$1 and plan_id=$2', [ids.bob, oneTimePlanId])).rows[0].paid_until, null);
    assert.equal(await asUser(ids.bob, async () =>
      (await q('select public.has_feature_access($1) as allowed', ['one_time_feature'])).rows[0].allowed), true);

    // Idempotent replay does not double-activate.
    const replay = await asUser(ids.admin, async () =>
      (await q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [orderId, 'prov-1', 'approved', 10, 'EGP', 'pay-1', 'evt-1'])).rows[0].r);
    assert.equal(replay.status, 'succeeded');

    // Parallel delivery of the same provider event must persist only one transaction.
    const concurrentOrder = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', 'idemp-concurrent-webhook', 'Premium monthly'])).rows[0].r);
    const parallelEvents = await asUser(ids.admin, () => Promise.all([
      q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [concurrentOrder.order_id, 'prov-concurrent', 'approved', 10, 'EGP', 'pay-concurrent', 'evt-concurrent']),
      q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7) as r', [concurrentOrder.order_id, 'prov-concurrent', 'approved', 10, 'EGP', 'pay-concurrent', 'evt-concurrent'])
    ]));
    assert.ok(parallelEvents.every(result => result.rows[0].r.status === 'succeeded'));
    assert.equal((await q('select count(*)::int as count from public.payment_transactions where order_id=$1', [concurrentOrder.order_id])).rows[0].count, 1);
    assert.equal((await q('select count(*)::int as count from public.payment_webhooks where gateway_id=$1 and event_id=$2', [gatewayId, 'evt-concurrent'])).rows[0].count, 1);

    // Audit log exists.
    const auditCount = (await db.query(`select count(*)::int as n from public.payment_audit_logs where entity_id=$1 and action='payment.succeeded'`, [orderId])).rows[0].n;
    assert.ok(auditCount >= 1);

    // Second order → mark failed.
    const key2 = 'idemp-002';
    const order2 = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', key2, 'Premium monthly'])).rows[0].r);
    const failed = await asUser(ids.admin, async () =>
      (await q('select public.mark_payment_order_failed($1,$2,$3) as r', [order2.order_id, 'declined', 'card declined'])).rows[0].r);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.invoice_status, 'failed');

    // Third order → cancel by owner (pending).
    const key3 = 'idemp-003';
    const order3 = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', key3, 'Premium monthly'])).rows[0].r);
    const cancelled = await asUser(ids.alice, async () =>
      (await q('select public.cancel_payment_order($1,$2,$3) as r', [order3.order_id, 'changed mind', ids.alice])).rows[0].r);
    assert.equal(cancelled.status, 'cancelled');
    await asUser(ids.admin, async () =>
      fails(q('select public.mark_payment_order_succeeded($1,$2,$3,$4,$5,$6,$7)', [order3.order_id, 'prov-cancelled', 'approved', 10, 'EGP', 'pay-cancelled', 'evt-cancelled']), 'P0001'));
    assert.equal((await q(`select status from public.subscriptions where user_id=$1 and plan_id=$2`, [ids.alice, planId])).rows[0].status, 'active');
    assert.equal(await asUser(ids.alice, async () =>
      (await q('select public.has_feature_access($1) as allowed', ['circle_live'])).rows[0].allowed), true);

    // Cancelling renewal preserves existing paid access until the paid-through date.
    await asUser(ids.alice, async () =>
      q('select public.cancel_subscription($1)', [ids.alice]));
    assert.equal((await q(`select status from public.subscriptions where user_id=$1 and plan_id=$2`, [ids.alice, planId])).rows[0].status, 'cancelled');
    assert.equal(await asUser(ids.alice, async () =>
      (await q('select public.has_feature_access($1) as allowed', ['circle_live'])).rows[0].allowed), true);
    await q(`update public.subscriptions set paid_until=now()-interval '1 second', cancel_at=now()-interval '1 second'
      where user_id=$1 and plan_id=$2`, [ids.alice, planId]);
    const expiredAccess = await asUser(ids.alice, async () =>
      (await q('select public.has_feature_access($1) as allowed', ['circle_live'])).rows[0].allowed);
    assert.equal(expiredAccess, false);
    // Non-owner cannot cancel.
    const key4 = 'idemp-004';
    const order4 = await asUser(ids.alice, async () =>
      (await q('select public.create_payment_order($1,$2,$3,$4,$5,$6,$7) as r', [ids.alice, planId, gatewayId, 10, 'EGP', key4, 'Premium monthly'])).rows[0].r);
    await asUser(ids.bob, async () =>
      fails(q('select public.cancel_payment_order($1,$2,$3) as r', [order4.order_id, 'nope', ids.bob]), '42501'));

    // Refund (admin) on succeeded order.
    const refunded = await asUser(ids.admin, async () =>
      (await q('select public.refund_payment_order($1,$2,$3,$4,$5,$6) as r', [orderId, 'r-1', 10, 'EGP', 'customer request', ids.admin])).rows[0].r);
    assert.equal(refunded.status, 'succeeded');
    const subAfterRefund = await asUser(ids.alice, async () =>
      (await q('select public.get_user_subscription($1) as r', [ids.alice])).rows[0].r);
    assert.equal(subAfterRefund.status, 'cancelled');

    // List orders (owner).
    const list = await asUser(ids.alice, async () =>
      (await q('select public.list_payment_orders($1,$2,$3) as r', [ids.alice, 10, 0])).rows[0].r);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 4);

    // List invoices.
    const invs = await asUser(ids.alice, async () =>
      (await q('select public.list_invoices($1,$2,$3) as r', [ids.alice, 10, 0])).rows[0].r);
    assert.ok(Array.isArray(invs));
    assert.ok(invs.length >= 1);

    // Record audit.
    const audit = await asUser(ids.admin, async () =>
      (await q('select public.record_payment_audit($1,$2,$3,$4,$5) as r', [ids.admin, 'admin.check', 'payment_order', orderId, '{"k":"v"}'])).rows[0].r);
    assert.equal(audit.ok, true);

    // Payment audit list refunds.
    const refunds = await asUser(ids.alice, async () =>
      (await q('select public.list_payment_refunds($1,$2,$3) as r', [ids.alice, 10, 0])).rows[0].r);
    assert.ok(Array.isArray(refunds));
  } finally {
    await db.close();
  }
});
