import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Bell, Palette, User, Save, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

const THEMES = [
  { id: 'default', name: '經典藍', color: 'bg-indigo-500' },
  { id: 'emerald', name: '翡翠綠', color: 'bg-emerald-500' },
  { id: 'orange', name: '活力橘', color: 'bg-orange-500' },
];

export function Settings() {
  const [displayName, setDisplayName] = useState(auth.currentUser?.displayName || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('app-theme') || 'default';
  });

  const [tasks, setTasks] = useState<any[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationOffset, setNotificationOffset] = useState(() => {
    return parseInt(localStorage.getItem('notification-offset') || '60', 10);
  });

  const handleOffsetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value, 10);
    setNotificationOffset(value);
    localStorage.setItem('notification-offset', value.toString());
  };

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }

    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      // Only show upcoming tasks
      const upcoming = tasksData.filter(t => !t.completed && new Date(t.dueDate) > new Date());
      setTasks(upcoming.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setIsUpdatingProfile(true);
    setProfileMessage({ type: '', text: '' });
    
    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName
      });
      setProfileMessage({ type: 'success', text: '用戶名更新成功！' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileMessage({ type: 'error', text: '更新失敗，請稍後再試。' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    localStorage.setItem('app-theme', themeId);
    
    if (themeId === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themeId);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('您的瀏覽器不支援通知功能');
      return;
    }
    
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  };

  const toggleTaskNotification = async (taskId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        reminderEnabled: !currentStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
          <User className="w-6 h-6 text-primary-500" />
          個人資料設定
        </h2>
        
        <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              用戶名
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-slate-900 dark:text-white"
              placeholder="輸入新的用戶名"
            />
          </div>
          
          {profileMessage.text && (
            <p className={cn("text-sm", profileMessage.type === 'success' ? "text-emerald-500" : "text-red-500")}>
              {profileMessage.text}
            </p>
          )}
          
          <button
            type="submit"
            disabled={isUpdatingProfile || !displayName.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存變更
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
          <Palette className="w-6 h-6 text-primary-500" />
          主題顏色
        </h2>
        
        <div className="flex flex-wrap gap-4">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all",
                currentTheme === theme.id 
                  ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10" 
                  : "border-slate-200 dark:border-slate-700 hover:border-primary-300"
              )}
            >
              <div className={cn("w-6 h-6 rounded-full shadow-sm", theme.color)} />
              <span className="font-medium text-slate-900 dark:text-white">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary-500" />
            通知與提醒
          </h2>
          
          {!notificationsEnabled ? (
            <button
              onClick={requestNotificationPermission}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              開啟瀏覽器通知
            </button>
          ) : (
            <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-medium">
              通知已開啟
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">預設提醒時間</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">設定任務到期前多久發送通知</p>
            </div>
            <select
              value={notificationOffset}
              onChange={handleOffsetChange}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value={5}>5 分鐘前</option>
              <option value={15}>15 分鐘前</option>
              <option value={30}>30 分鐘前</option>
              <option value={60}>1 小時前</option>
              <option value={120}>2 小時前</option>
              <option value={1440}>1 天前</option>
            </select>
          </div>

          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-6">即將到來的任務</h3>
          
          {tasks.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm">目前沒有即將到來的任務</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{task.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(task.dueDate).toLocaleString('zh-TW')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={!!task.reminderEnabled}
                      onChange={() => toggleTaskNotification(task.id, !!task.reminderEnabled)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
