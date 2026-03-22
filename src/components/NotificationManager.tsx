import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';

export function NotificationManager() {
  const notifiedTasks = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', auth.currentUser.uid),
      where('completed', '==', false),
      where('reminderEnabled', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      const checkTasks = () => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const offsetMinutes = parseInt(localStorage.getItem('notification-offset') || '60', 10);
        const offsetMs = offsetMinutes * 60 * 1000;

        const now = new Date();
        tasks.forEach(task => {
          if (!task.dueDate) return;
          
          const dueDate = new Date(task.dueDate);
          const timeDiff = dueDate.getTime() - now.getTime();
          
          if (timeDiff > 0 && timeDiff <= offsetMs && !notifiedTasks.current.has(task.id)) {
            let timeText = '';
            if (offsetMinutes >= 1440 && offsetMinutes % 1440 === 0) {
              timeText = `${offsetMinutes / 1440} 天`;
            } else if (offsetMinutes >= 60) {
              timeText = offsetMinutes % 60 === 0 ? `${offsetMinutes / 60} 小時` : `${Math.floor(offsetMinutes / 60)} 小時 ${offsetMinutes % 60} 分鐘`;
            } else {
              timeText = `${offsetMinutes} 分鐘`;
            }

            new Notification('任務提醒', {
              body: `您的任務「${task.title}」將在 ${timeText}內到期！`,
              icon: '/icon.svg'
            });
            notifiedTasks.current.add(task.id);
          }
        });
      };

      // Check immediately and then every minute
      checkTasks();
      const interval = setInterval(checkTasks, 60000);

      return () => clearInterval(interval);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    return () => unsubscribe();
  }, []);

  return null;
}
