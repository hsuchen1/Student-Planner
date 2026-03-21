import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Plus, Trash2, CheckCircle2, Circle, Clock, Calendar as CalendarIcon, FileEdit, BookOpen, Mic, FolderOpen, Edit2, GripVertical } from 'lucide-react';

registerLocale('zh-TW', zhTW);
import { cn } from '../utils/cn';
import { motion, AnimatePresence, Reorder, useMotionValue, useTransform } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';
import { CalendarImportModal } from './CalendarImportModal';

interface Task {
  id: string;
  userId: string;
  title: string;
  type: 'assignment' | 'exam' | 'report' | 'project' | 'other';
  dueDate: string;
  completed: boolean;
  createdAt: string;
  order?: number;
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    type: 'assignment' as Task['type'],
    dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  
  const [sortMode, setSortMode] = useState<'date' | 'custom'>('date');
  const [localPending, setLocalPending] = useState<Task[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    // 抓取所有任務，不使用 orderBy，改由前端排序
    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(tasksData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tasks');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sorted = [...tasks].sort((a, b) => {
      if (sortMode === 'date') {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      } else {
        return (a.order || 0) - (b.order || 0);
      }
    });
    setLocalPending(sorted.filter(t => !t.completed));
  }, [tasks, sortMode]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim() || !auth.currentUser) return;

    try {
      const now = new Date().toISOString();
      const dueDateIso = new Date(newTask.dueDate).toISOString();
      const maxOrder = tasks.reduce((max, t) => Math.max(max, t.order || 0), -1);
      
      await addDoc(collection(db, 'tasks'), {
        userId: auth.currentUser.uid,
        title: newTask.title.trim(),
        type: newTask.type,
        dueDate: dueDateIso,
        completed: false,
        createdAt: now,
        order: maxOrder + 1,
      });

      setNewTask({
        title: '',
        type: 'assignment',
        dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.title.trim()) return;

    try {
      const dueDateIso = new Date(editingTask.dueDate).toISOString();
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        title: editingTask.title.trim(),
        type: editingTask.type,
        dueDate: dueDateIso,
      });
      setEditingTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${editingTask.id}`);
    }
  };

  const toggleComplete = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskToDelete));
      setTaskToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskToDelete}`);
    }
  };

  const saveOrder = async (newOrder: Task[]) => {
    const batch = writeBatch(db);
    let hasChanges = false;
    newOrder.forEach((task, index) => {
      if (task.order !== index) {
        const taskRef = doc(db, 'tasks', task.id);
        batch.update(taskRef, { order: index });
        hasChanges = true;
      }
    });
    if (hasChanges) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'tasks');
      }
    }
  };

  const getTypeIcon = (type: Task['type']) => {
    switch (type) {
      case 'assignment': return <FileEdit className="w-4 h-4 text-blue-500" />;
      case 'exam': return <BookOpen className="w-4 h-4 text-rose-500" />;
      case 'report': return <Mic className="w-4 h-4 text-purple-500" />;
      case 'project': return <FolderOpen className="w-4 h-4 text-emerald-500" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTypeLabel = (type: Task['type']) => {
    switch (type) {
      case 'assignment': return '作業';
      case 'exam': return '考試';
      case 'report': return '報告';
      case 'project': return '專案';
      default: return '其他';
    }
  };

  const getTypeColor = (type: Task['type']) => {
    switch (type) {
      case 'assignment': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'exam': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
      case 'report': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'project': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return `今天 ${format(date, 'HH:mm')}`;
    if (isTomorrow(date)) return `明天 ${format(date, 'HH:mm')}`;
    return format(date, 'PPP p', { locale: zhTW });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const completedTasks = tasks.filter(t => t.completed).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  return (
    <div className="space-y-6 md:space-y-8">
      <ConfirmModal
        isOpen={!!taskToDelete}
        title="刪除任務"
        message="確定要刪除這個任務嗎？此動作無法復原。"
        onConfirm={confirmDelete}
        onCancel={() => setTaskToDelete(null)}
      />
      <CalendarImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">任務與考試</h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1">管理您的課業與考試安排。</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSortMode('date')}
              className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors", sortMode === 'date' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}
            >
              依日期
            </button>
            <button
              onClick={() => setSortMode('custom')}
              className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors", sortMode === 'custom' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}
            >
              自訂排序
            </button>
          </div>
          {!isAdding && !editingTask && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 p-2.5 md:px-4 md:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <CalendarIcon className="w-6 h-6 md:w-5 md:h-5" />
                <span className="hidden md:inline">匯入日曆</span>
              </button>
              <button
                onClick={() => { setIsAdding(true); setEditingTask(null); }}
                className="bg-indigo-600 text-white hover:bg-indigo-700 p-2.5 md:px-4 md:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <Plus className="w-6 h-6 md:w-5 md:h-5" />
                <span className="hidden md:inline">新增任務</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAdding && (
          <motion.form
            key="add-form"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleAddTask}
            className="bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">新增任務</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">標題</label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="例如：微積分第五章作業"
                  className="w-full px-4 py-3 md:py-2 text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">類型</label>
                <select
                  value={newTask.type}
                  onChange={e => setNewTask({ ...newTask, type: e.target.value as Task['type'] })}
                  className="w-full px-4 py-3 md:py-2 text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="assignment">作業 (Assignment)</option>
                  <option value="exam">考試 (Exam)</option>
                  <option value="report">報告 (Report)</option>
                  <option value="project">專案 (Project)</option>
                  <option value="other">其他 (Other)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">截止日期與時間</label>
                <DatePicker
                  selected={newTask.dueDate ? new Date(newTask.dueDate) : null}
                  onChange={(date: Date | null) => setNewTask({ ...newTask, dueDate: date ? date.toISOString() : '' })}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  timeCaption="時間"
                  dateFormat="yyyy/MM/dd aa h:mm"
                  locale="zh-TW"
                  placeholderText="選擇到期時間"
                  className="w-full px-4 py-3 md:py-2 text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  wrapperClassName="w-full"
                />
              </div>
            </div>
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
                className="px-5 py-2.5 md:px-4 md:py-2 bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-700 rounded-xl font-medium transition-colors"
              >
                儲存任務
              </button>
            </div>
          </motion.form>
        )}

        {editingTask && (
          <motion.form
            key="edit-form"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleUpdateTask}
            className="bg-indigo-50/50 dark:bg-indigo-900/20 p-5 md:p-6 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/30 space-y-4"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100">編輯任務</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium text-indigo-900/70 dark:text-indigo-200/70">標題</label>
                <input
                  type="text"
                  required
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full px-4 py-3 md:py-2 text-base bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-indigo-900/70 dark:text-indigo-200/70">類型</label>
                <select
                  value={editingTask.type}
                  onChange={e => setEditingTask({ ...editingTask, type: e.target.value as Task['type'] })}
                  className="w-full px-4 py-3 md:py-2 text-base bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="assignment">作業 (Assignment)</option>
                  <option value="exam">考試 (Exam)</option>
                  <option value="report">報告 (Report)</option>
                  <option value="project">專案 (Project)</option>
                  <option value="other">其他 (Other)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-indigo-900/70 dark:text-indigo-200/70">截止日期與時間</label>
                <DatePicker
                  selected={editingTask.dueDate ? new Date(editingTask.dueDate) : null}
                  onChange={(date: Date | null) => setEditingTask({ ...editingTask, dueDate: date ? date.toISOString() : '' })}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  timeCaption="時間"
                  dateFormat="yyyy/MM/dd aa h:mm"
                  locale="zh-TW"
                  placeholderText="選擇到期時間"
                  className="w-full px-4 py-3 md:py-2 text-base bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  wrapperClassName="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-5 py-2.5 md:px-4 md:py-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 md:px-4 md:py-2 bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 rounded-xl font-medium transition-colors"
              >
                更新任務
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {localPending.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              待辦事項 ({localPending.length})
            </h2>
            
            {sortMode === 'custom' ? (
              <Reorder.Group axis="y" values={localPending} onReorder={setLocalPending} className="space-y-3 md:space-y-2">
                {localPending.map(task => (
                  <Reorder.Item key={task.id} value={task} onDragEnd={() => saveOrder(localPending)}>
                    <TaskItem 
                      task={task} 
                      onToggle={toggleComplete} 
                      onEdit={() => { setEditingTask(task); setIsAdding(false); }}
                      onDelete={() => setTaskToDelete(task.id)} 
                      getTypeIcon={getTypeIcon} 
                      getTypeLabel={getTypeLabel} 
                      getTypeColor={getTypeColor}
                      formatDueDate={formatDueDate} 
                      isDraggable={true}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : (
              <div className="space-y-3 md:space-y-2">
                {localPending.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={toggleComplete} 
                    onEdit={() => { setEditingTask(task); setIsAdding(false); }}
                    onDelete={() => setTaskToDelete(task.id)} 
                    getTypeIcon={getTypeIcon} 
                    getTypeLabel={getTypeLabel} 
                    getTypeColor={getTypeColor}
                    formatDueDate={formatDueDate} 
                    isDraggable={false}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
            <CheckCircle2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">太棒了！全部完成！</h3>
            <p className="text-slate-500 dark:text-slate-400">您目前沒有任何待辦任務或考試。</p>
          </div>
        )}

        {completedTasks.length > 0 && (
          <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              已完成 ({completedTasks.length})
            </h2>
            <div className="space-y-3 md:space-y-2 opacity-60">
              {completedTasks.map(task => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  onToggle={toggleComplete} 
                  onEdit={() => { setEditingTask(task); setIsAdding(false); }}
                  onDelete={() => setTaskToDelete(task.id)} 
                  getTypeIcon={getTypeIcon} 
                  getTypeLabel={getTypeLabel} 
                  getTypeColor={getTypeColor}
                  formatDueDate={formatDueDate} 
                  isDraggable={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task, onToggle, onEdit, onDelete, getTypeIcon, getTypeLabel, getTypeColor, formatDueDate, isDraggable }: any) {
  const isOverdue = !task.completed && isPast(new Date(task.dueDate));
  const x = useMotionValue(0);
  const background = useTransform(
    x,
    [-100, 0, 100],
    ["var(--swipe-delete-bg)", "transparent", "var(--swipe-complete-bg)"] // Red for delete (left swipe), Green for complete (right swipe)
  );
  const iconOpacityLeft = useTransform(x, [0, 50], [0, 1]);
  const iconOpacityRight = useTransform(x, [-50, 0], [1, 0]);

  return (
    <div className="relative overflow-hidden rounded-2xl mb-3 md:mb-2 group">
      {/* Swipe Background Actions */}
      {!isDraggable && (
        <motion.div 
          className="absolute inset-0 flex items-center justify-between px-6 rounded-2xl"
          style={{ background }}
        >
          <motion.div style={{ opacity: iconOpacityLeft }} className="flex items-center gap-2 text-emerald-700 font-medium">
            <CheckCircle2 className="w-6 h-6" />
            <span>完成</span>
          </motion.div>
          <motion.div style={{ opacity: iconOpacityRight }} className="flex items-center gap-2 text-red-700 font-medium">
            <span>刪除</span>
            <Trash2 className="w-6 h-6" />
          </motion.div>
        </motion.div>
      )}

      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ x }}
        drag={!isDraggable ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={(e, info) => {
          if (info.offset.x > 80) {
            onToggle(task);
          } else if (info.offset.x < -80) {
            onDelete(task.id);
          }
        }}
        className={cn(
          "relative z-10 flex items-start gap-3 md:gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border transition-all hover:shadow-md",
          task.completed ? "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50" : "border-slate-200 dark:border-slate-700",
          isOverdue && !task.completed ? "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10" : "",
          isDraggable ? "cursor-grab active:cursor-grabbing" : ""
        )}
      >
        {isDraggable && (
          <div className="mt-1 text-slate-300 dark:text-slate-600 flex-shrink-0" onPointerDown={(e) => e.preventDefault()}>
            <GripVertical className="w-5 h-5" />
          </div>
        )}

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onToggle(task)}
          className="mt-0.5 flex-shrink-0 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors focus:outline-none p-1 -ml-1"
        >
          {task.completed ? (
            <CheckCircle2 className="w-7 h-7 md:w-6 md:h-6 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <Circle className="w-7 h-7 md:w-6 md:h-6" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium", getTypeColor(task.type))}>
              {getTypeIcon(task.type)}
              {getTypeLabel(task.type)}
            </span>
            {isOverdue && !task.completed && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-xs font-medium text-red-700 dark:text-red-400">
                已逾期
              </span>
            )}
          </div>
          <h3 className={cn(
            "text-base md:text-lg font-medium text-slate-900 dark:text-white truncate",
            task.completed && "line-through text-slate-500 dark:text-slate-400"
          )}>
            {task.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            <CalendarIcon className="w-4 h-4" />
            <span className={cn(isOverdue && !task.completed && "text-red-600 dark:text-red-400 font-medium")}>
              {formatDueDate(task.dueDate)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(task)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors focus:outline-none"
          >
            <Edit2 className="w-5 h-5 md:w-4 md:h-4" />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(task.id)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors focus:outline-none"
          >
            <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
