import { NextResponse } from 'next/server';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';

export async function POST(req) {
  const currentRole = await getCurrentRole();
  if (!['admin', 'secretaria'].includes(currentRole)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json();
  const { request_id, technician_id, scheduled_at, duration_minutes } = body;

  if (!request_id || !technician_id || !scheduled_at) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const { data: visit, error } = await supabase
    .from('visits')
    .insert({
      request_id,
      technician_id,
      scheduled_at,
      duration_minutes: duration_minutes ?? 60,
      status: 'agendada',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('requests').update({ status: 'agendado' }).eq('id', request_id);

  return NextResponse.json({ visit });
}
