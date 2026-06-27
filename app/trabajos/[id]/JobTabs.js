'use client';
import { useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
);

const SUPABASE_URL = 'https://zisidorwdhrttmdppnbj.supabase.co';

const statusOptions = [
  { value: 'estimate', label: 'Estimado' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function JobTabs({ job, items, technicians, notes, checklist, templates, clientType, totals, fmt }) {
  const router = useRouter();
  const [tab, setTab] = useState('info');
  const [status, setStatus] = useState(job.status);
  const [techId, setTechId] = useState(job.technician_id ?? '');
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Notes state
  const [notesList, setNotesList] = useState(notes);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef();
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState(null);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState(checklist);
  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  async function updateStatus(val) {
    setStatus(val);
    await supabase.from('jobs').update({ status: val }).eq('id', job.id);
    router.refresh();
  }

  async function assignTech(val) {
    setTechId(val);
    await supabase.from('jobs').update({ technician_id: val || null }).eq('id', job.id);
  }

  async function deleteJob() {
    setDeleting(true);
    await supabase.from('job_line_items').delete().eq('job_id', job.id);
    await supabase.from('job_notes').delete().eq('job_id', job.id);
    await supabase.from('job_checklist_items').delete().eq('job_id', job.id);
    await supabase.from('jobs').delete().eq('id', job.id);
    router.push('/trabajos');
  }

  // ─── Notas y Fotos Corregidas ───
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(file);
    setPendingPhotoPreview(URL.createObjectURL(file));
  }

  async function saveNote(e) {
    e.preventDefault();
    if (!noteText.trim() && !pendingPhoto) return;
    setSavingNote(true);

    try {
      let photoUrl = null;

      if (pendingPhoto) {
        setUploadingPhoto(true);
        const ext = pendingPhoto.name.split('.').pop();
        const path = `${job.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('job-photos').upload(path, pendingPhoto);
        
        if (uploadError) throw uploadError;
        
        photoUrl = `${SUPABASE_URL}/storage/v1/object/public/job-photos/${path}`;
      }

      const { data: newNote, error: dbError } = await supabase.from('job_notes').insert([{
        job_id: job.id,
        note: noteText.trim() || null,
        photo_url: photoUrl,
      }]).select().single();

      if (dbError) throw dbError;

      // Actualización exitosa: solo aquí limpiamos el estado
      if (newNote) {
        setNotesList(prev => [newNote, ...prev]);
        setNoteText('');
        setPendingPhoto(null);
        setPendingPhotoPreview(null);
      }
    } catch (err) {
      console.error("Error al guardar:", err);
      alert("Error al guardar: " + err.message);
    } finally {
      setSavingNote(false);
      setUploadingPhoto(false);
    }
  }

  async function deleteNote(noteId) {
    await supabase.from('job_notes').delete().eq('id', noteId);
    setNotesList(prev => prev.filter(n => n.id !== noteId));
  }

  // ... (El resto de tus funciones de checklist y renderizado siguen igual)
  async function addItem(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAddingItem(true);
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: job.id,
      description: newItem.trim(),
      sort_order: checklistItems.length,
    }]).select().single();
    if (data) setChecklistItems(prev => [...prev, data]);
    setNewItem('');
    setAddingItem(false);
  }

  async function toggleItem(itemId, completed) {
    await supabase.from('job_checklist_items').update({
      completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    }).eq('id', itemId);
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: !completed } : i));
  }

  async function deleteItem(itemId) {
    await supabase.from('job_checklist_items').delete().eq('id', itemId);
    setChecklistItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function applyTemplate(template) {
    const items = template.checklist_template_items?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
    const toInsert = items.map((it, idx) => ({
      job_id: job.id,
      description: it.description,
      sort_order: checklistItems.length + idx,
    }));
    const { data } = await supabase.from('job_checklist_items').insert(toInsert).select();
    if (data) setChecklistItems(prev => [...prev, ...data]);
    setShowTemplates(false);
  }

