'use client';
import { useState, useRef } from 'react';
import { supabase } from './supabase';

// Shared checklist logic for job_checklist_items, used by both the admin
// job page (JobTabs.js) and the Crew App (app/crew/page.js) so the two
// don't drift out of sync. Callers own the JSX; this hook owns the state,
// grouping/nesting, and all reads/writes to job_checklist_items.
//
// Sub-items (parent_item_id) are a single level deep: a row with
// parent_item_id set never itself becomes a parent in the UI.
export function useJobChecklist(jobId, initialItems) {
  const [checklistItems, setChecklistItems] = useState(initialItems);

  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(null);
  const [newItemText, setNewItemText] = useState({});
  const [addingItemGroup, setAddingItemGroup] = useState(null);
  const [itemMenuOpen, setItemMenuOpen] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState('');
  const [dragItem, setDragItem] = useState(null);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [dragGroup, setDragGroup] = useState(null);
  const itemPhotoInputRef = useRef();
  const [pendingPhotoItemId, setPendingPhotoItemId] = useState(null);
  const [uploadingItemPhotoId, setUploadingItemPhotoId] = useState(null);

  const [expandedItems, setExpandedItems] = useState({});
  const [addingSubItemFor, setAddingSubItemFor] = useState(null);
  const [newSubItemText, setNewSubItemText] = useState({});
  const [dragSubItem, setDragSubItem] = useState(null);

  const placeholders = checklistItems.filter(i => i.__placeholder);
  const realItems = checklistItems.filter(i => !i.__placeholder);
  const topLevelItems = realItems.filter(i => !i.parent_item_id);

  const childrenByParent = {};
  realItems.forEach(i => {
    if (!i.parent_item_id) return;
    if (!childrenByParent[i.parent_item_id]) childrenByParent[i.parent_item_id] = [];
    childrenByParent[i.parent_item_id].push(i);
  });
  Object.values(childrenByParent).forEach(arr => arr.sort((a, b) => a.sort_order - b.sort_order));

  const groupedMap = {};
  [...topLevelItems, ...placeholders].forEach(i => {
    const g = i.group_name || '__none__';
    if (!groupedMap[g]) groupedMap[g] = [];
    groupedMap[g].push(i);
  });

  const completedCount = realItems.filter(i => i.completed).length;
  const realCount = realItems.length;
  const progress = realCount > 0 ? Math.round((completedCount / realCount) * 100) : 0;

  function toggleExpand(itemId) {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function addGroup() {
    if (!newGroupName.trim()) return;
    setAddingGroup(false);
    setChecklistItems(prev => [...prev, {
      id: '__placeholder__' + Date.now(),
      job_id: jobId,
      description: '',
      group_name: newGroupName.trim(),
      completed: false,
      sort_order: prev.length,
      __placeholder: true,
    }]);
    setNewGroupName('');
  }

  async function addItemToGroup(groupName) {
    const key = groupName ?? '__none__';
    const text = newItemText[key] ?? '';
    if (!text.trim()) return;
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: jobId,
      description: text.trim(),
      sort_order: realItems.length,
      group_name: groupName || null,
    }]).select().single();
    if (data) setChecklistItems(prev => [
      ...prev.filter(i => !(i.__placeholder && i.group_name === groupName)),
      data,
    ]);
    setNewItemText(prev => ({ ...prev, [key]: '' }));
    setAddingItemGroup(null);
  }

  async function addSubItem(parentItem) {
    const text = newSubItemText[parentItem.id] ?? '';
    if (!text.trim()) return;
    const siblingCount = (childrenByParent[parentItem.id] ?? []).length;
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: jobId,
      description: text.trim(),
      group_name: parentItem.group_name,
      parent_item_id: parentItem.id,
      sort_order: siblingCount,
    }]).select().single();
    if (data) setChecklistItems(prev => [...prev, data]);
    setNewSubItemText(prev => ({ ...prev, [parentItem.id]: '' }));
    setAddingSubItemFor(null);
    setExpandedItems(prev => ({ ...prev, [parentItem.id]: true }));
  }

  async function renameGroup(oldName) {
    const newName = prompt(`Renombrar grupo "${oldName}":`, oldName);
    if (!newName || newName === oldName) return;
    await supabase.from('job_checklist_items').update({ group_name: newName })
      .eq('job_id', jobId).eq('group_name', oldName);
    setChecklistItems(prev => prev.map(i => i.group_name === oldName ? { ...i, group_name: newName } : i));
    setGroupMenuOpen(null);
  }

  async function deleteGroup(groupName) {
    if (!confirm(`¿Eliminar el grupo "${groupName}" y todos sus ítems?`)) return;
    await supabase.from('job_checklist_items').delete().eq('job_id', jobId).eq('group_name', groupName);
    setChecklistItems(prev => prev.filter(i => i.group_name !== groupName));
    setGroupMenuOpen(null);
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
    // The FK is ON DELETE CASCADE server-side; mirror that locally so a
    // deleted parent's sub-items disappear without a refetch.
    setChecklistItems(prev => prev.filter(i => i.id !== itemId && i.parent_item_id !== itemId));
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setEditingItemText(item.description);
    setItemMenuOpen(null);
  }

  async function saveEditItem(itemId) {
    const text = editingItemText.trim();
    setEditingItemId(null);
    if (!text) return;
    await supabase.from('job_checklist_items').update({ description: text }).eq('id', itemId);
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, description: text } : i));
  }

  async function duplicateItem(item) {
    setItemMenuOpen(null);
    const siblingCount = item.parent_item_id
      ? (childrenByParent[item.parent_item_id] ?? []).length
      : realItems.length;
    const { data } = await supabase.from('job_checklist_items').insert([{
      job_id: jobId,
      description: item.description,
      group_name: item.group_name,
      parent_item_id: item.parent_item_id ?? null,
      photo_url: item.photo_url ?? null,
      sort_order: siblingCount,
      completed: false,
    }]).select().single();
    if (data) setChecklistItems(prev => [...prev, { ...data, photo_signed_url: item.photo_signed_url ?? null }]);
  }

  function triggerItemPhotoUpload(itemId) {
    setPendingPhotoItemId(itemId);
    setItemMenuOpen(null);
    itemPhotoInputRef.current?.click();
  }

  async function handleItemPhotoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingPhotoItemId) return;
    const itemId = pendingPhotoItemId;
    setPendingPhotoItemId(null);
    setUploadingItemPhotoId(itemId);
    const ext = file.name.split('.').pop();
    const path = `${jobId}/checklist-${itemId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('Job-photos').upload(path, file, { upsert: true });
    if (!error) {
      const { data: signed } = await supabase.storage.from('Job-photos').createSignedUrl(path, 3600);
      await supabase.from('job_checklist_items').update({ photo_url: path }).eq('id', itemId);
      setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, photo_url: path, photo_signed_url: signed?.signedUrl ?? null } : i));
    }
    setUploadingItemPhotoId(null);
  }

  async function removeItemPhoto(itemId) {
    setItemMenuOpen(null);
    await supabase.from('job_checklist_items').update({ photo_url: null }).eq('id', itemId);
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, photo_url: null, photo_signed_url: null } : i));
  }

  // Top-level items only — sub-items are reordered separately (within
  // their parent) via reorderSubItems so dragging a top-level item can
  // never accidentally reparent or swallow a sub-item.
  async function reorderItems(targetGroupKey, draggedId, targetItemId) {
    if (draggedId === targetItemId) return;
    const allTop = topLevelItems.filter(i => i.id !== draggedId);
    const dragged = topLevelItems.find(i => i.id === draggedId);
    if (!dragged) return;
    const targetGroupName = targetGroupKey === '__none__' ? null : targetGroupKey;
    const groupOrder = [];
    const groupsMap = {};
    allTop.forEach(i => {
      const g = i.group_name || '__none__';
      if (!groupsMap[g]) { groupsMap[g] = []; groupOrder.push(g); }
      groupsMap[g].push(i);
    });
    if (!groupsMap[targetGroupKey]) { groupsMap[targetGroupKey] = []; groupOrder.push(targetGroupKey); }
    const targetArr = groupsMap[targetGroupKey];
    const insertAt = targetItemId ? targetArr.findIndex(i => i.id === targetItemId) : targetArr.length;
    const movedItem = { ...dragged, group_name: targetGroupName };
    if (insertAt === -1) targetArr.push(movedItem);
    else targetArr.splice(insertAt, 0, movedItem);
    const reordered = groupOrder.flatMap(g => groupsMap[g]).map((it, idx) => ({ ...it, sort_order: idx }));
    const reorderedIds = new Set(reordered.map(r => r.id));
    setChecklistItems(prev => prev.map(i => {
      if (!reorderedIds.has(i.id)) return i;
      const match = reordered.find(r => r.id === i.id);
      return { ...i, sort_order: match.sort_order, group_name: match.group_name };
    }));
    await Promise.all(reordered.map(u => supabase.from('job_checklist_items').update({ sort_order: u.sort_order, group_name: u.group_name }).eq('id', u.id)));
  }

  async function reorderGroups(draggedGroupKey, targetGroupKey) {
    if (draggedGroupKey === targetGroupKey) return;
    const order = Object.keys(groupedMap);
    const fromIdx = order.indexOf(draggedGroupKey);
    const toIdx = order.indexOf(targetGroupKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...order];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const reordered = newOrder.flatMap(g => groupedMap[g].filter(i => !i.__placeholder)).map((it, idx) => ({ ...it, sort_order: idx }));
    const reorderedIds = new Set(reordered.map(r => r.id));
    setChecklistItems(prev => prev.map(i => {
      if (!reorderedIds.has(i.id)) return i;
      const match = reordered.find(r => r.id === i.id);
      return { ...i, sort_order: match.sort_order };
    }));
    await Promise.all(reordered.map(u => supabase.from('job_checklist_items').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }

  // Sub-items reorder only among their own siblings (same parent_item_id).
  async function reorderSubItems(parentId, draggedId, targetItemId) {
    if (draggedId === targetItemId) return;
    const siblings = (childrenByParent[parentId] ?? []).slice();
    const fromIdx = siblings.findIndex(i => i.id === draggedId);
    if (fromIdx === -1) return;
    const [moved] = siblings.splice(fromIdx, 1);
    const insertAt = targetItemId ? siblings.findIndex(i => i.id === targetItemId) : siblings.length;
    if (insertAt === -1) siblings.push(moved);
    else siblings.splice(insertAt, 0, moved);
    const reordered = siblings.map((it, idx) => ({ ...it, sort_order: idx }));
    setChecklistItems(prev => prev.map(i => {
      const match = reordered.find(r => r.id === i.id);
      return match ? { ...i, sort_order: match.sort_order } : i;
    }));
    await Promise.all(reordered.map(u => supabase.from('job_checklist_items').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }

  return {
    checklistItems, setChecklistItems,
    groupedMap, childrenByParent,
    completedCount, realCount, progress,

    newGroupName, setNewGroupName, addingGroup, setAddingGroup, addGroup,
    groupMenuOpen, setGroupMenuOpen, renameGroup, deleteGroup,
    dragGroup, setDragGroup, dragOverGroup, setDragOverGroup, reorderGroups,

    newItemText, setNewItemText, addingItemGroup, setAddingItemGroup, addItemToGroup,
    itemMenuOpen, setItemMenuOpen,
    editingItemId, setEditingItemId, editingItemText, setEditingItemText, startEditItem, saveEditItem,
    toggleItem, deleteItem, duplicateItem,
    dragItem, setDragItem, reorderItems,

    itemPhotoInputRef, pendingPhotoItemId, uploadingItemPhotoId,
    triggerItemPhotoUpload, handleItemPhotoFile, removeItemPhoto,

    expandedItems, setExpandedItems, toggleExpand,
    addingSubItemFor, setAddingSubItemFor, newSubItemText, setNewSubItemText, addSubItem,
    dragSubItem, setDragSubItem, reorderSubItems,
  };
}
