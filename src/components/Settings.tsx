import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Palette, Shield, Clock, Check, AlertCircle, ListChecks } from 'lucide-react';
import { useTheme, themeColors } from '../ThemeContext';
import { cn } from '../utils/cn';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Task } from './Tasks';

export function Settings() {
  const { currentColor, setThemeColor } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [reminderTime, setReminderTime] = useState(() => {
    return parseInt(localStorage.getItem('reminder-time') || '60');
  });
  const [remindersEnabled, setRemindersEnabled] = useState(() => {
    return localStorage.getItem('reminders-enabled') === 'true';
  });

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

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
      
      // Sort by dueDate on client side
      tasksData.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      
      setTasks(tasksData);
    });

    return () => unsubscribe();
  }, []);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        new Notification('通知已開啟', {
          body: '您現在將收到任務提醒。',
          icon: '/favicon.ico'
        });
      }
    }
  };

  const handleReminderTimeChange = (minutes: number) => {
    setReminderTime(minutes);
    localStorage.setItem('reminder-time', minutes.toString());
  };

  const toggleReminders = () => {
    const newValue = !remindersEnabled;
    setRemindersEnabled(newValue);
    localStorage.setItem('reminders-enabled', newValue.toString());
  };

  const toggleTaskNotification = async (taskId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        notificationsEnabled: !currentStatus
      });
    } catch (error) {
      console.error('Failed to update task notification status', error);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">通知與設定</h1>
        <p className="text-slate-500 dark:text-slate-400">自定義您的使用體驗與提醒偏好</p>
      </header>

      {/* Theme Selection */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-theme-secondary text-theme-primary rounded-lg">
            <Palette className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">主題配色</h2>
        </div>

        <div className="flex flex-wrap gap-4">
          {themeColors.map((color) => (
            <button
              key={color.name}
              onClick={() => setThemeColor(color)}
              title={color.name}
              className={cn(
                "group relative w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center",
                currentColor.name === color.name
                  ? "border-theme-primary ring-2 ring-theme-primary/20 ring-offset-2 dark:ring-offset-slate-900"
                  : "border-transparent hover:scale-110"
              )}
              style={{ backgroundColor: color.primary }}
            >
              {currentColor.name === color.name && (
                <Check className="w-6 h-6 text-white drop-shadow-md" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-theme-secondary text-theme-primary rounded-lg">
            <Bell className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">通知管理</h2>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">瀏覽器通知權限</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {notificationPermission === 'granted' ? '已允許通知' : 
                 notificationPermission === 'denied' ? '已封鎖通知，請在瀏覽器設定中開啟' : 
                 '尚未設定權限'}
              </p>
            </div>
            {notificationPermission !== 'granted' && (
              <button
                onClick={requestPermission}
                disabled={notificationPermission === 'denied'}
                className="px-4 py-2 bg-theme-primary text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                開啟通知
              </button>
            )}
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">任務提醒總開關</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">決定是否接收各別任務的提醒通知</p>
            </div>
            <button
              onClick={toggleReminders}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                remindersEnabled ? "bg-theme-primary" : "bg-slate-200 dark:bg-slate-700"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  remindersEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {remindersEnabled && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 pt-2"
            >
              <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Clock className="w-4 h-4 text-theme-primary" />
                <span className="text-sm font-medium">預設提醒時間</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 60, 120, 1440].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => handleReminderTimeChange(mins)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      reminderTime === mins
                        ? "bg-theme-primary text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    {mins < 60 ? `${mins} 分鐘前` : mins === 1440 ? '1 天前' : `${mins / 60} 小時前`}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Individual Task Notifications */}
      {remindersEnabled && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-theme-secondary text-theme-primary rounded-lg">
              <ListChecks className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">個別任務通知設定</h2>
          </div>

          <div className="space-y-1">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <div 
                  key={task.id} 
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{task.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      到期日: {new Date(task.dueDate).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleTaskNotification(task.id, task.notificationsEnabled === true)}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                      task.notificationsEnabled === true ? "bg-theme-primary" : "bg-slate-200 dark:bg-slate-700"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                        task.notificationsEnabled === true ? "translate-x-5" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-slate-400 text-sm">目前沒有進行中的任務。</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Security & Offline */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-theme-secondary text-theme-primary rounded-lg">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">系統狀態</h2>
        </div>

        <div className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-xl">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-900 dark:text-emerald-300">離線編輯已啟用</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-400/80">
              您的資料會自動儲存在本地快取中。即使在沒有網路的情況下也能繼續編輯，系統會在恢復連線後自動同步。
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-300">通知限制</p>
            <p className="text-sm text-amber-700 dark:text-amber-400/80">
              由於瀏覽器限制，提醒通知僅在分頁開啟時有效。若要確保收到通知，請保持應用程式在背景運行。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
