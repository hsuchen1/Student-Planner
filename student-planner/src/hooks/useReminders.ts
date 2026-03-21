import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { isPast, differenceInMinutes, parseISO } from 'date-fns';

interface Task {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  userId: string;
  notificationsEnabled?: boolean;
}

export function useReminders() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const notifiedTasks = useRef<Set<string>>(new Set());

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

      setTasks(tasksData);
      checkReminders(tasksData);
    });

    return () => unsubscribe();
  }, []);

  // Time-based check every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (tasks.length > 0) {
        checkReminders(tasks);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [tasks]);

  const checkReminders = (tasksToCheck: Task[]) => {
    const remindersEnabled = localStorage.getItem('reminders-enabled') === 'true';
    if (!remindersEnabled || Notification.permission !== 'granted') return;

    const reminderMinutes = parseInt(localStorage.getItem('reminder-time') || '60');
    const now = new Date();

    tasksToCheck.forEach(task => {
      // Check if notifications are enabled for this specific task
      if (task.notificationsEnabled === false) return;

      try {
        const dueDate = parseISO(task.dueDate);
        if (isPast(dueDate)) return;

        const diff = differenceInMinutes(dueDate, now);
        
        // If task is due within the reminder window (e.g. 60 mins) and we haven't notified yet
        // Also check if the task is not already notified for THIS SPECIFIC due date
        const notificationKey = `${task.id}-${task.dueDate}`;
        if (diff <= reminderMinutes && diff > 0 && !notifiedTasks.current.has(notificationKey)) {
          showNotification(task, diff);
          notifiedTasks.current.add(notificationKey);
        }
      } catch (e) {
        console.error('Error parsing date for task:', task.id, e);
      }
    });
  };

  const showNotification = (task: Task, minutesLeft: number) => {
    const timeStr = minutesLeft < 60 ? `${minutesLeft} 分鐘` : `${Math.round(minutesLeft / 60)} 小時`;
    new Notification('任務提醒', {
      body: `任務「${task.title}」將在 ${timeStr} 後到期！`,
      icon: '/favicon.ico',
      tag: task.id // Prevent duplicate notifications for the same task
    });
  };
}
