import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar as CalendarIcon, Loader2, Plus, CheckCircle2, FileEdit, BookOpen, Mic, FolderOpen, Clock } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { format, addDays } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { cn } from '../utils/cn';

interface CalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GoogleEvent {
  id: string;
  title: string;
  startTime: string;
  predictedType: 'assignment' | 'exam' | 'report' | 'project' | 'other';
  imported: boolean;
  importing: boolean;
}

function predictType(title: string): 'assignment' | 'exam' | 'report' | 'project' | 'other' {
  const lowerTitle = title.toLowerCase();
  if (/(考試|期中|期末|測驗|exam|test|quiz)/.test(lowerTitle)) return 'exam';
  if (/(作業|hw|assignment|練習)/.test(lowerTitle)) return 'assignment';
  if (/(報告|上台|簡報|presentation|report)/.test(lowerTitle)) return 'report';
  if (/(專案|計畫|project)/.test(lowerTitle)) return 'project';
  return 'other';
}

export function CalendarImportModal({ isOpen, onClose }: CalendarImportModalProps) {
  const [step, setStep] = useState<'date-select' | 'fetching' | 'event-select'>('date-select');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 30));
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStep('date-select');
      setEvents([]);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFetchEvents = async () => {
    try {
      setStep('fetching');
      setError(null);

      let token = localStorage.getItem('google_calendar_token');
      const tokenExpiry = localStorage.getItem('google_calendar_token_expiry');
      const now = Date.now();

      // Check if we have a valid cached token (valid for 1 hour, but let's check if it's within 55 mins)
      const isTokenValid = token && tokenExpiry && (parseInt(tokenExpiry) > now);

      if (!isTokenValid) {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
        
        // Prompt user to grant calendar access
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        token = credential?.accessToken || null;

        if (token) {
          // Store token with 55 minutes expiry (standard is 1 hour)
          localStorage.setItem('google_calendar_token', token);
          localStorage.setItem('google_calendar_token_expiry', (now + 55 * 60 * 1000).toString());
        }
      }

      if (!token) {
        throw new Error('無法取得 Google 日曆授權');
      }

      const timeMin = startDate.toISOString();
      const timeMax = endDate.toISOString();
      
      let response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      // If token expired or invalid, try one more time with fresh login
      if (response.status === 401) {
        localStorage.removeItem('google_calendar_token');
        localStorage.removeItem('google_calendar_token_expiry');
        
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        token = credential?.accessToken || null;

        if (!token) throw new Error('無法取得 Google 日曆授權');

        localStorage.setItem('google_calendar_token', token);
        localStorage.setItem('google_calendar_token_expiry', (Date.now() + 55 * 60 * 1000).toString());

        response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }

      if (!response.ok) {
        throw new Error('讀取日曆失敗，請確認是否已在 GCP 啟用 Google Calendar API');
      }

      const data = await response.json();
      
      const fetchedEvents: GoogleEvent[] = (data.items || [])
        .filter((item: any) => item.start && (item.start.dateTime || item.start.date))
        .map((item: any) => ({
          id: item.id,
          title: item.summary || '無標題行程',
          startTime: item.start.dateTime || item.start.date,
          predictedType: predictType(item.summary || ''),
          imported: false,
          importing: false
        }));

      setEvents(fetchedEvents);
      setStep('event-select');

    } catch (err: any) {
      console.error(err);
      setError(err.message || '發生未知錯誤');
      setStep('date-select');
    }
  };

  const handleImportEvent = async (event: GoogleEvent) => {
    if (!auth.currentUser) return;
    
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, importing: true } : e));

    try {
      const now = new Date().toISOString();
      
      await addDoc(collection(db, 'tasks'), {
        userId: auth.currentUser.uid,
        title: event.title,
        type: event.predictedType,
        dueDate: new Date(event.startTime).toISOString(),
        completed: false,
        createdAt: now,
        googleEventId: event.id,
        order: Date.now()
      });

      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, importing: false, imported: true } : e));
    } catch (error) {
      console.error(error);
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, importing: false } : e));
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const getTypeIcon = (type: string, imported: boolean) => {
    if (!imported) {
      switch (type) {
        case 'assignment': return <FileEdit className="w-4 h-4 text-slate-400" />;
        case 'exam': return <BookOpen className="w-4 h-4 text-slate-400" />;
        case 'report': return <Mic className="w-4 h-4 text-slate-400" />;
        case 'project': return <FolderOpen className="w-4 h-4 text-slate-400" />;
        default: return <Clock className="w-4 h-4 text-slate-400" />;
      }
    }
    
    switch (type) {
      case 'assignment': return <FileEdit className="w-4 h-4 text-blue-500" />;
      case 'exam': return <BookOpen className="w-4 h-4 text-rose-500" />;
      case 'report': return <Mic className="w-4 h-4 text-purple-500" />;
      case 'project': return <FolderOpen className="w-4 h-4 text-emerald-500" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTypeColor = (type: string, imported: boolean) => {
    if (!imported) {
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }

    switch (type) {
      case 'assignment': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50';
      case 'exam': return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50';
      case 'report': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50';
      case 'project': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
      default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">從 Google 日曆匯入</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            {step === 'date-select' && (
              <motion.div
                key="date-select"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <p className="text-slate-600 dark:text-slate-400">
                  請選擇您想要匯入的日期區間，系統會自動抓取該區間內的 Google 日曆行程。
                </p>
                
                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">開始日期</label>
                    <DatePicker
                      selected={startDate}
                      onChange={(date: Date | null) => date && setStartDate(date)}
                      dateFormat="yyyy/MM/dd"
                      locale={zhTW}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      wrapperClassName="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">結束日期</label>
                    <DatePicker
                      selected={endDate}
                      onChange={(date: Date | null) => date && setEndDate(date)}
                      dateFormat="yyyy/MM/dd"
                      locale={zhTW}
                      minDate={startDate}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      wrapperClassName="w-full"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={handleFetchEvents}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                  >
                    授權並抓取行程
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'fetching' && (
              <motion.div
                key="fetching"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">正在連線至 Google 日曆...</p>
              </motion.div>
            )}

            {step === 'event-select' && (
              <motion.div
                key="event-select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-600 dark:text-slate-400">
                    共找到 <span className="font-bold text-slate-900 dark:text-white">{events.length}</span> 個行程。您可以修改分類，並選擇要加入的任務。
                  </p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        localStorage.removeItem('google_calendar_token');
                        localStorage.removeItem('google_calendar_token_expiry');
                        setStep('date-select');
                      }}
                      className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      切換 Google 帳號
                    </button>
                    <button
                      onClick={() => setStep('date-select')}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      重新選擇日期
                    </button>
                  </div>
                </div>

                {events.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                    <CalendarIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">沒有找到行程</h3>
                    <p className="text-slate-500 dark:text-slate-400">您選擇的日期區間內沒有任何 Google 日曆行程。</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {events.map(event => (
                      <div key={event.id} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-slate-900 dark:text-white truncate" title={event.title}>
                            {event.title}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500 dark:text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(event.startTime), 'PPP p', { locale: zhTW })}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 sm:w-auto w-full justify-between sm:justify-end">
                          <div className={cn("flex items-center gap-2 border rounded-lg px-2 py-1.5 transition-colors", getTypeColor(event.predictedType, event.imported))}>
                            {getTypeIcon(event.predictedType, event.imported)}
                            <select
                              value={event.predictedType}
                              onChange={(e) => {
                                const newType = e.target.value as any;
                                setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, predictedType: newType } : ev));
                              }}
                              disabled={event.imported || event.importing}
                              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer disabled:opacity-50"
                            >
                              <option value="assignment">作業</option>
                              <option value="exam">考試</option>
                              <option value="report">報告</option>
                              <option value="project">專案</option>
                              <option value="other">其他</option>
                            </select>
                          </div>

                          <button
                            onClick={() => handleImportEvent(event)}
                            disabled={event.imported || event.importing}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                              event.imported 
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                            )}
                          >
                            {event.importing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : event.imported ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                已加入
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                加入任務
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
