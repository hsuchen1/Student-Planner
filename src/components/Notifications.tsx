import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bell, BellOff, Clock, Settings, Palette, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { cn } from '../utils/cn';

interface Task {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  notifyEnabled?: boolean;
}

export function Notifications() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [themeColor, setThemeColor] = useState(() => {
    return localStorage.getItem('theme-color') || '#4f46e5';
  });

  const colors = [
    { name: 'Indigo', value: '#4f46e5' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Violet', value: '#8b5cf6' },
  ];

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', auth.currentUser.uid),
      where('completed', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(tasksData.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
    });

    return () => unsubscribe();
  }, []);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const toggleTaskNotify = async (taskId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        notifyEnabled: !currentStatus
      });
    } catch (error) {
      console.error('Error updating notification status:', error);
    }
  };

  const changeThemeColor = (color: string) => {
    setThemeColor(color);
    localStorage.setItem('theme-color', color);
    document.documentElement.style.setProperty('--primary-color', color);
    // Approximate hover and light colors
    document.documentElement.style.setProperty('--primary-color-hover', color + 'dd');
    document.documentElement.style.setProperty('--primary-color-light', color + '22');
  };

  useEffect(() => {
    // Apply theme color on mount
    document.documentElement.style.setProperty('--primary-color', themeColor);
    document.documentElement.style.setProperty('--primary-color-hover', themeColor + 'dd');
    document.documentElement.style.setProperty('--primary-color-light', themeColor + '22');
  }, [themeColor]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-7 h-7 text-[var(--primary-color)]" />
          個人化與通知設定
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          自定義您的學習空間與提醒偏好
        </p>
      </header>

      {/* Theme Selection */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-slate-400" />
          自定義主題色
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {colors.map((color) => (
            <button
              key={color.value}
              onClick={() => changeThemeColor(color.value)}
              className={cn(
                "group relative flex flex-col items-center gap-2 p-2 rounded-xl transition-all",
                themeColor === color.value ? "bg-slate-50 dark:bg-slate-800 ring-2 ring-[var(--primary-color)]" : "hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <div 
                className="w-10 h-10 rounded-full shadow-inner transition-transform group-hover:scale-110"
                style={{ backgroundColor: color.value }}
              />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{color.name}</span>
              {themeColor === color.value && (
                <CheckCircle2 className="absolute -top-1 -right-1 w-5 h-5 text-[var(--primary-color)] bg-white dark:bg-slate-900 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Notification Permission */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-3 rounded-xl",
              permission === 'granted' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            )}>
              {permission === 'granted' ? <Bell className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">瀏覽器通知權限</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {permission === 'granted' ? '已開啟通知權限，您可以接收提醒。' : '目前尚未開啟通知權限，請點擊按鈕開啟。'}
              </p>
            </div>
          </div>
          {permission !== 'granted' && (
            <button
              onClick={requestPermission}
              className="px-6 py-2.5 bg-[var(--primary-color)] hover:bg-[var(--primary-color-hover)] text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
            >
              開啟通知
            </button>
          )}
        </div>
      </section>

      {/* Task Notifications */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-slate-400" />
          任務提醒管理
        </h3>
        
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">目前沒有待辦任務</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div 
                key={task.id}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <h4 className="font-medium text-slate-900 dark:text-white truncate">{task.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    截止日: {new Date(task.dueDate).toLocaleString('zh-TW')}
                  </p>
                </div>
                <button
                  onClick={() => toggleTaskNotify(task.id, !!task.notifyEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                    task.notifyEnabled ? "bg-[var(--primary-color)]" : "bg-slate-200 dark:bg-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      task.notifyEnabled ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
        <p className="text-sm text-indigo-700 dark:text-indigo-300 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>
            提示：通知功能依賴瀏覽器權限。請確保您的瀏覽器允許此網站發送通知。
            系統會在任務截止前自動發送提醒（需保持分頁開啟）。
          </span>
        </p>
      </div>
    </div>
  );
}
