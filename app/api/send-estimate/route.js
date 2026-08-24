import { getResend } from '../../../lib/resend';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';
import { getClientEmailTranslator } from '../../../lib/i18n-server';


export async function POST(request) {
  try {
    const role = await getCurrentRole();
    if (!['admin', 'secretaria', 'vendedor'].includes(role)) {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { estimateId, toEmail, cc } = await request.json();
    const t = await getClientEmailTranslator('emails.estimate');
    const ccList = Array.isArray(cc) ? cc.filter(Boolean) : [];
    const [{ data: est }, { data: items }] = await Promise.all([
      supabase.from('estimates').select('*, clients(name, email, company, client_type)').eq('id', estimateId).single(),
      supabase.from('estimate_line_items').select('*').eq('estimate_id', estimateId).order('sort_order'),
    ]);
    if (!est) return Response.json({ error: 'No encontrada' }, { status: 404 });
    const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const publicUrl = `https://app.otesspr.com/estimado/${estimateId}`;
    const displayItems = await Promise.all((items ?? []).map(async i => {
      if (!i.photo_url) return i;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(i.photo_url, 2592000);
      return { ...i, photo_signed_url: data?.signedUrl ?? null };
    }));
    // Bundled accessories ("Combinar precios" on, the default) stay off this
    // email — their real cost is already folded into the parent row's total,
    // but the itemized breakdown is kept internal until the client approves
    // the estimate (see the same logic in app/estimado/[id]/page.js).
    const childrenByParentId = new Map();
    for (const i of displayItems) {
      if (!i.parent_item_id) continue;
      if (!childrenByParentId.has(i.parent_item_id)) childrenByParentId.set(i.parent_item_id, []);
      childrenByParentId.get(i.parent_item_id).push(i);
    }
    const displayRows = displayItems.filter(i => !i.parent_item_id).flatMap(i => {
      const children = childrenByParentId.get(i.id) ?? [];
      const bundled = i.combine_price !== false;
      const bundledTotal = bundled ? children.reduce((s, c) => s + Number(c.line_total) + Number(c.tax_amount), 0) : 0;
      return [
        { ...i, description: i.group_description?.trim() || i.description, displayTotal: Number(i.line_total) + Number(i.tax_amount) + bundledTotal, accessoryCount: bundled ? children.length : 0 },
        ...(bundled ? [] : children.map(c => ({ ...c, displayTotal: Number(c.line_total) + Number(c.tax_amount), accessoryCount: 0 }))),
      ];
    });
    const rows = displayRows.map(i => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${i.photo_signed_url ? `<td style="padding-right:10px;vertical-align:top"><img src="${i.photo_signed_url}" alt="" width="40" height="40" style="width:40px;height:40px;object-fit:contain;border-radius:6px;background:#f4f4f4;display:block" /></td>` : ''}
            <td style="vertical-align:top">
              ${i.title ? `<div style="font-weight:700;margin-bottom:2px">${i.title}</div>` : ''}
              <div>${i.description}</div>
              ${i.accessoryCount > 0 ? `<div style="font-size:11px;color:#999;margin-top:2px">${t('accessoryIncluded', { count: i.accessoryCount })}</div>` : ''}
            </td>
          </tr></table>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px">${i.type === 'labor' ? t('typeLabor') : t('typeProduct')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px">${i.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px">${fmt(i.unit_price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:14px">${fmt(i.displayTotal)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 16px">

  <div style="background:#16223d;border-radius:16px 16px 0 0;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="background-color:#16223d !important;display:inline-block;padding:6px 10px;border-radius:6px"><img src="https://app.otesspr.com/otess-logo-blanco.png" alt="OTESS" style="width:130px;height:auto;display:block" /></div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:4px">OT Electrical & Security Solutions</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">(787) 513-8352 · info@otesspr.com</div>
    </div>
    <div style="text-align:right">
      <div style="color:#fff;font-size:18px;font-weight:900">${t('documentLabel')}</div>
      <div style="color:#e0972c;font-size:20px;font-weight:700;font-family:monospace">${est.estimate_number}</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:6px">${t('dateLabel')} <strong style="color:#fff">${est.issued_at}</strong></div>
      ${est.valid_until ? `<div style="color:rgba(255,255,255,0.65);font-size:12px">${t('validUntilLabel')} <strong style="color:#fff">${est.valid_until}</strong></div>` : ''}
    </div>
  </div>

  <div style="background:#fff;padding:28px 32px">
    <p style="color:#555;font-size:15px;margin-top:0">${t('greeting', { name: est.clients?.name ?? '' })}</p>
    <p style="color:#666;font-size:14px">${t('intro', { number: est.estimate_number })}</p>

    <div style="text-align:center;margin:24px 0">
      <a href="${publicUrl}" style="background:#e0972c;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">
        ${t('viewButton')}
      </a>
    </div>

    <div style="background:#f8f9fb;border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.1em">${t('preparedFor')}</div>
      <div style="font-weight:700;font-size:15px">${est.clients?.name}</div>
      ${est.clients?.company ? `<div style="color:#888;font-size:13px">${est.clients.company}</div>` : ''}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:#16223d">
          <th style="color:#fff;padding:10px 12px;text-align:left;font-size:11px">${t('tableDescription')}</th>
          <th style="color:#fff;padding:10px 12px;text-align:center;font-size:11px">${t('tableType')}</th>
          <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">${t('tableQty')}</th>
          <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">${t('tablePrice')}</th>
          <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">${t('tableTotal')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end">
      <div style="width:280px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">${t('subtotalProducts')}</span><span>${fmt(est.subtotal_products)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">${t('taxProducts')}</span><span>${fmt(est.tax_products)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">${t('subtotalLabor')}</span><span>${fmt(est.subtotal_labor)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">${t('taxLabor', { rate: est.clients?.client_type === 'b2b' ? '4%' : '11.5%' })}</span><span>${fmt(est.tax_labor)}</span></div>
        ${est.discount_value > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">${t('discount')}${est.discount_type === 'percent' ? ` (${Number(est.discount_value)}%)` : ''}</span><span>-${fmt(Number(est.subtotal_products) + Number(est.tax_products) + Number(est.subtotal_labor) + Number(est.tax_labor) - Number(est.total))}</span></div>` : ''}
        ${est.discount_value > 0 && est.discount_note ? `<p style="font-size:12px;color:#888;font-style:italic;text-align:right;margin:0 0 4px">${est.discount_note}</p>` : ''}
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:20px;font-weight:900;color:#16223d"><span>${t('total')}</span><span>${fmt(est.total)}</span></div>
      </div>
    </div>

    ${est.notes ? `<div style="background:#f8f9fb;border-radius:10px;padding:14px 18px;font-size:13px;color:#888;margin-top:16px"><strong style="color:#16223d">${t('notes')}</strong> ${est.notes}</div>` : ''}
  </div>

  <div style="background:#f0f2f5;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <p style="color:#888;font-size:12px;margin:0">${t('footerQuestions', { email: '<a href="mailto:info@otesspr.com" style="color:#e0972c">info@otesspr.com</a>', phone: '(787) 513-8352' })}</p>
    <p style="color:#aaa;font-size:11px;margin:8px 0 0">${t('footerAddress')}</p>
  </div>

</div>
</body>
</html>`;

    const { error } = await getResend().emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: toEmail,
      ...(ccList.length ? { cc: ccList } : {}),
      subject: t('subject', { number: est.estimate_number }),
      html,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from('estimates').update({ status: 'sent' }).eq('id', estimateId);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
