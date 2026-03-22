import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Plus, Trash2, Edit2, BookOpen, Clock, Save, ListTodo, CheckSquare, Square } from 'lucide-react';
import { cn } from '../utils/cn';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';

export interface ListItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content?: string;
  type?: 'text' | 'list';
  listItems?: ListItem[];
  createdAt: string;
  updatedAt: string;
}

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState<{title: string, content: string, type: 'text' | 'list', listItems: ListItem[]}>({ title: '', content: '', type: 'text', listItems: [] });
  const [newItemText, setNewItemText] = useState('');
  const [editItemText, setEditItemText] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      setNotes(notesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notes');
    });

    return () => unsubscribe();
  }, []);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.title.trim() || !auth.currentUser) return;

    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'notes'), {
        userId: auth.currentUser.uid,
        title: newNote.title.trim(),
        content: newNote.type === 'text' ? newNote.content.trim() : '',
        type: newNote.type,
        listItems: newNote.type === 'list' ? newNote.listItems : [],
        createdAt: now,
        updatedAt: now,
      });

      setNewNote({ title: '', content: '', type: 'text', listItems: [] });
      setNewItemText('');
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    }
  };

  const handleUpdateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editingNote.title.trim()) return;

    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'notes', editingNote.id), {
        title: editingNote.title.trim(),
        content: editingNote.type === 'text' ? (editingNote.content || '').trim() : '',
        type: editingNote.type || 'text',
        listItems: editingNote.type === 'list' ? (editingNote.listItems || []) : [],
        updatedAt: now,
      });
      setEditingNote(null);
      setEditItemText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notes/${editingNote.id}`);
    }
  };

  const toggleNoteItem = async (note: Note, itemId: string) => {
    if (note.type !== 'list' || !note.listItems) return;
    const updatedItems = note.listItems.map(item => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    try {
      await updateDoc(doc(db, 'notes', note.id), {
        listItems: updatedItems,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to toggle item', error);
    }
  };

  const handleAddListItem = () => {
    if (!newItemText.trim()) return;
    setNewNote(prev => ({
      ...prev,
      listItems: [...prev.listItems, { id: Date.now().toString(), text: newItemText.trim(), completed: false }]
    }));
    setNewItemText('');
  };

  const handleEditListItem = () => {
    if (!editItemText.trim() || !editingNote) return;
    setEditingNote(prev => prev ? {
      ...prev,
      listItems: [...(prev.listItems || []), { id: Date.now().toString(), text: editItemText.trim(), completed: false }]
    } : null);
    setEditItemText('');
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await deleteDoc(doc(db, 'notes', noteToDelete));
      setNoteToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${noteToDelete}`);
    }
  };

  const confirmBatchDelete = async () => {
    if (selectedNotes.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedNotes.forEach(id => {
        batch.delete(doc(db, 'notes', id));
      });
      await batch.commit();
      setSelectedNotes([]);
      setIsBatchDeleteModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'notes (batch)');
    }
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNotes(prev => 
      prev.includes(noteId) 
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <ConfirmModal
        isOpen={!!noteToDelete}
        title="刪除筆記"
        message="確定要刪除這則筆記嗎？此動作無法復原。"
        onConfirm={confirmDelete}
        onCancel={() => setNoteToDelete(null)}
      />
      <ConfirmModal
        isOpen={isBatchDeleteModalOpen}
        title="批次刪除筆記"
        message={`確定要刪除選取的 ${selectedNotes.length} 則筆記嗎？此動作無法復原。`}
        onConfirm={confirmBatchDelete}
        onCancel={() => setIsBatchDeleteModalOpen(false)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">學習筆記</h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1">隨手記錄重要資訊與靈感。</p>
        </div>
        {!isAdding && !editingNote && (
          <div className="flex items-center gap-2">
            {selectedNotes.length > 0 ? (
              <>
                <button
                  onClick={() => setSelectedNotes([])}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 p-2.5 md:px-4 md:py-2 rounded-xl font-medium transition-colors shadow-sm"
                >
                  取消選取
                </button>
                <button
                  onClick={() => setIsBatchDeleteModalOpen(true)}
                  className="bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600 p-2.5 md:px-4 md:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
                >
                  <Trash2 className="w-6 h-6 md:w-5 md:h-5" />
                  <span className="hidden md:inline">刪除 ({selectedNotes.length})</span>
                </button>
              </>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setNewNote({ title: '', content: '', type: 'text', listItems: [] }); setIsAdding(true); }}
                  className="bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 p-2.5 md:px-4 md:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
                >
                  <Plus className="w-6 h-6 md:w-5 md:h-5" />
                  <span className="hidden md:inline">新增筆記</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setNewNote({ title: '', content: '', type: 'list', listItems: [] }); setIsAdding(true); }}
                  className="bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30 hover:bg-primary-50 dark:hover:bg-primary-500/10 p-2.5 md:px-4 md:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
                >
                  <ListTodo className="w-6 h-6 md:w-5 md:h-5" />
                  <span className="hidden md:inline">新增列表</span>
                </motion.button>
              </>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isAdding && (
          <motion.form
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleAddNote}
            className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <input
              type="text"
              required
              placeholder={newNote.type === 'list' ? "列表標題 (例如：待辦事項、購物清單)" : "筆記標題"}
              value={newNote.title}
              onChange={e => setNewNote({ ...newNote, title: e.target.value })}
              className="w-full px-4 py-3 text-lg font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
            {newNote.type === 'text' ? (
              <textarea
                placeholder="在這裡寫下您的筆記內容..."
                value={newNote.content}
                onChange={e => setNewNote({ ...newNote, content: e.target.value })}
                rows={8}
                className="w-full px-4 py-3 text-base bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
              />
            ) : (
              <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                {newNote.listItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <button type="button" onClick={() => setNewNote(prev => ({ ...prev, listItems: prev.listItems.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i) }))} className="text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400">
                      {item.completed ? <CheckSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" /> : <Square className="w-5 h-5" />}
                    </button>
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => setNewNote(prev => ({ ...prev, listItems: prev.listItems.map(i => i.id === item.id ? { ...i, text: e.target.value } : i) }))}
                      className={cn("flex-1 bg-transparent border-b border-transparent focus:border-primary-300 dark:focus:border-primary-500/50 focus:outline-none px-1 py-0.5 transition-colors text-slate-900 dark:text-white", item.completed && "line-through text-slate-400 dark:text-slate-500")}
                    />
                    <button type="button" onClick={() => setNewNote(prev => ({ ...prev, listItems: prev.listItems.filter(i => i.id !== item.id) }))} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="新增項目 (按 Enter 加入)..."
                    value={newItemText}
                    onChange={e => setNewItemText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddListItem(); } }}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <button type="button" onClick={handleAddListItem} className="p-2 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-5 py-2.5 md:px-4 md:py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 md:px-4 md:py-2 bg-slate-900 dark:bg-primary-600 text-white hover:bg-slate-800 dark:hover:bg-primary-700 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                儲存筆記
              </button>
            </div>
          </motion.form>
        )}

        {editingNote && (
          <motion.form
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleUpdateNote}
            className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <input
              type="text"
              required
              placeholder={editingNote.type === 'list' ? "列表標題" : "筆記標題"}
              value={editingNote.title}
              onChange={e => setEditingNote({ ...editingNote, title: e.target.value })}
              className="w-full px-4 py-3 text-lg font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
            {(!editingNote.type || editingNote.type === 'text') ? (
              <textarea
                placeholder="在這裡寫下您的筆記內容..."
                value={editingNote.content || ''}
                onChange={e => setEditingNote({ ...editingNote, content: e.target.value })}
                rows={8}
                className="w-full px-4 py-3 text-base bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
              />
            ) : (
              <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                {(editingNote.listItems || []).map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <button type="button" onClick={() => setEditingNote(prev => prev ? { ...prev, listItems: (prev.listItems || []).map(i => i.id === item.id ? { ...i, completed: !i.completed } : i) } : null)} className="text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400">
                      {item.completed ? <CheckSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" /> : <Square className="w-5 h-5" />}
                    </button>
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => setEditingNote(prev => prev ? { ...prev, listItems: (prev.listItems || []).map(i => i.id === item.id ? { ...i, text: e.target.value } : i) } : null)}
                      className={cn("flex-1 bg-transparent border-b border-transparent focus:border-primary-300 dark:focus:border-primary-500/50 focus:outline-none px-1 py-0.5 transition-colors text-slate-900 dark:text-white", item.completed && "line-through text-slate-400 dark:text-slate-500")}
                    />
                    <button type="button" onClick={() => setEditingNote(prev => prev ? { ...prev, listItems: (prev.listItems || []).filter(i => i.id !== item.id) } : null)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="新增項目 (按 Enter 加入)..."
                    value={editItemText}
                    onChange={e => setEditItemText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditListItem(); } }}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <button type="button" onClick={handleEditListItem} className="p-2 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="px-5 py-2.5 md:px-4 md:py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 md:px-4 md:py-2 bg-slate-900 dark:bg-primary-600 text-white hover:bg-slate-800 dark:hover:bg-primary-700 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                更新筆記
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {!isAdding && !editingNote && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {notes.length > 0 ? (
              notes.map(note => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                  key={note.id}
                  className="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all flex flex-col"
                >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3 overflow-hidden">
                    <input
                      type="checkbox"
                      checked={selectedNotes.includes(note.id)}
                      onChange={() => toggleNoteSelection(note.id)}
                      className="mt-1.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-primary-500 focus:ring-primary-500/30 cursor-pointer flex-shrink-0 transition-all opacity-40 hover:opacity-100 checked:opacity-100"
                    />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
                      {note.type === 'list' ? <ListTodo className="w-5 h-5 text-primary-500 dark:text-primary-400 flex-shrink-0" /> : <BookOpen className="w-5 h-5 text-primary-500 dark:text-primary-400 flex-shrink-0" />}
                      <span className="truncate">{note.title}</span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => setEditingNote(note)}
                      className="p-2 md:p-1.5 text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                    <button
                      onClick={() => setNoteToDelete(note.id)}
                      className="p-2 md:p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                  </div>
                </div>
                {(!note.type || note.type === 'text') ? (
                  <p className="text-slate-600 dark:text-slate-400 text-base md:text-sm whitespace-pre-wrap line-clamp-4 flex-1 mb-4">
                    {note.content}
                  </p>
                ) : (
                  <div className="flex-1 mb-4 space-y-2">
                    {(note.listItems || []).slice(0, 4).map(item => (
                      <div key={item.id} className="flex items-start gap-2">
                        <button 
                          onClick={() => toggleNoteItem(note, item.id)}
                          className="mt-0.5 text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0"
                        >
                          {item.completed ? <CheckSquare className="w-4 h-4 text-primary-600 dark:text-primary-400" /> : <Square className="w-4 h-4" />}
                        </button>
                        <span className={cn("text-sm line-clamp-1", item.completed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300")}>
                          {item.text}
                        </span>
                      </div>
                    ))}
                    {(note.listItems || []).length > 4 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 pl-6">
                        還有 {(note.listItems || []).length - 4} 個項目...
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Clock className="w-3.5 h-3.5" />
                  <span>最後更新：{format(new Date(note.updatedAt), 'PPP', { locale: zhTW })}</span>
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="col-span-full text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed"
            >
              <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">尚無筆記</h3>
              <p className="text-slate-500 dark:text-slate-400">建立您的第一則筆記，開始整理思緒吧。</p>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
