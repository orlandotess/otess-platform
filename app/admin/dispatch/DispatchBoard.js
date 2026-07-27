'use client';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { supabase } from '../../../lib/supabase';
import GanttGrid from './GanttGrid';
import JobsPanel from './JobsPanel';
import JobCard from './JobCard';
import { slotToIso, todayPR } from './dispatchUtils';

export default function DispatchBoard({ technicians, scheduledJobs, unassignedJobs, day }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(() => [...scheduledJobs, ...unassignedJobs]);
  const [activeJob, setActiveJob] = useState(null);
  const isDraggingRef = useRef(false);
  const pendingRefreshRef = useRef(false);

  // El día pudo haber cambiado (navegación) y el server component ya trajo los jobs correctos.
  useEffect(() => {
    setJobs([...scheduledJobs, ...unassignedJobs]);
  }, [scheduledJobs, unassignedJobs]);

  // Refresca el board cuando otro usuario (o la Crew App) cambia un job — sin esto,
  // hay que recargar la página a mano para ver asignaciones o estados nuevos.
  // Se posterga si hay un drag en curso para no arrancarle el board de las manos al usuario.
  useEffect(() => {
    let refreshTimer = null;
    const scheduleRefresh = () => {
      if (isDraggingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel('dispatch-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_schedule_days' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_technicians' }, scheduleRefresh)
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const unassigned = useMemo(() => jobs.filter(j => !j.technician_id), [jobs]);

  const jobsByTech = useMemo(() => {
    const map = {};
    for (const t of technicians) map[t.id] = [];
    for (const j of jobs) {
      if (j.technician_id && map[j.technician_id]) map[j.technician_id].push(j);
    }
    return map;
  }, [jobs, technicians]);

  function goToDay(newDay) {
    router.push(`/admin/dispatch?day=${newDay}`);
  }

  function shiftDay(delta) {
    const d = new Date(`${day}T12:00:00-04:00`);
    d.setUTCDate(d.getUTCDate() + delta);
    goToDay(d.toISOString().slice(0, 10));
  }

  const handleDragStart = useCallback((event) => {
    isDraggingRef.current = true;
    const job = jobs.find(j => j.id === event.active.id);
    setActiveJob(job ?? null);
  }, [jobs]);

  const finishDrag = useCallback(async (event) => {
    const { active, over } = event;
    setActiveJob(null);
    if (!over) return;
    const overId = String(over.id);

    const job = jobs.find(j => j.id === active.id);
    if (!job) return;
    const isExtraDay = job.schedule_day_id != null;

    if (overId === 'panel_unassigned') {
      if (isExtraDay) {
        // Un día extra no tiene "cola de sin asignar" propia — soltar acá solo le
        // quita el técnico a ese día puntual, y el bloque desaparece del board.
        setJobs(prev => prev.filter(j => j.id !== active.id));
        await supabase.from('job_schedule_days')
          .update({ technician_id: null })
          .eq('id', job.schedule_day_id);
        return;
      }
      setJobs(prev => prev.map(j => j.id === active.id
        ? { ...j, technician_id: null, scheduled_start: null, scheduled_end: null }
        : j));
      await supabase.from('jobs')
        .update({ technician_id: null, scheduled_start: null, scheduled_end: null })
        .eq('id', active.id);
      return;
    }

    if (overId.startsWith('slot_')) {
      const [, technicianId, hourStr, minuteStr] = overId.split('_');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      const durationMs = (job.scheduled_start && job.scheduled_end)
        ? new Date(job.scheduled_end).getTime() - new Date(job.scheduled_start).getTime()
        : 60 * 60 * 1000;

      const newStart = slotToIso(day, hour, minute);
      const newEnd = new Date(new Date(newStart).getTime() + durationMs).toISOString();

      if (isExtraDay) {
        setJobs(prev => prev.map(j => j.id === active.id
          ? { ...j, technician_id: technicianId, scheduled_start: newStart, scheduled_end: newEnd }
          : j));
        await supabase.from('job_schedule_days')
          .update({ technician_id: technicianId, scheduled_start: newStart, scheduled_end: newEnd })
          .eq('id', job.schedule_day_id);
        return;
      }

      const newStatus = job.status === 'estimate' ? 'scheduled' : job.status;

      setJobs(prev => prev.map(j => j.id === active.id
        ? { ...j, technician_id: technicianId, scheduled_start: newStart, scheduled_end: newEnd, status: newStatus }
        : j));

      await supabase.from('jobs')
        .update({ technician_id: technicianId, scheduled_start: newStart, scheduled_end: newEnd, status: newStatus })
        .eq('id', active.id);
    }
  }, [jobs, day]);

  const handleDragEnd = useCallback(async (event) => {
    try {
      await finishDrag(event);
    } finally {
      isDraggingRef.current = false;
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        router.refresh();
      }
    }
  }, [finishDrag, router]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="dispatch-header">
        <div className="page-title">Dispatch Board</div>
        <div className="dispatch-daynav">
          <button className="btn btn-ghost btn-sm" onClick={() => shiftDay(-1)}>←</button>
          <input
            type="date"
            value={day}
            onChange={e => e.target.value && goToDay(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)' }}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => goToDay(todayPR())}>Hoy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftDay(1)}>→</button>
        </div>
      </div>
      <div className="dispatch-body">
        <div className="dispatch-gantt">
          <GanttGrid technicians={technicians} jobsByTech={jobsByTech} />
        </div>
        <JobsPanel jobs={unassigned} />
      </div>
      <DragOverlay>
        {activeJob ? <JobCard job={activeJob} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
