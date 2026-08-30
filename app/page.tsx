'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  ChefHat,
  ChevronDown,
  CloudRain,
  CloudSun,
  ConciergeBell,
  Crown,
  Droplets,
  LayoutDashboard,
  ListChecks,
  Martini,
  MessageSquareText,
  Mic,
  NotebookPen,
  Paperclip,
  Pin,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  SpellCheck,
  Sun,
  UtensilsCrossed,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

const departments = [
  { name: 'General Manager', icon: Crown, online: 1, accent: '#cdbb8c' },
  { name: 'Front of House', icon: ConciergeBell, online: 6, accent: '#d5c195' },
  { name: 'Concierge', icon: BellRing, online: 3, accent: '#a9c8bc' },
  { name: 'Restaurant', icon: UtensilsCrossed, online: 9, accent: '#c7af91' },
  { name: 'Kitchen', icon: ChefHat, online: 7, accent: '#d2aa86' },
  { name: 'Bar', icon: Martini, online: 4, accent: '#b9acd5' },
  { name: 'Housekeeping', icon: Droplets, online: 11, accent: '#9eb9c5' },
  { name: 'Maintenance', icon: Wrench, online: 2, accent: '#a7b59b' },
];

type HotelMessage = {
  id: number;
  from: string;
  text: string;
  time: string;
  unread: boolean;
  urgent: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
};

const initialMessages: HotelMessage[] = [
  {
    id: 101,
    from: 'General Manager',
    text: "Prepare tomorrow's menu and send it back for approval.",
    time: '19:44',
    unread: false,
    urgent: false,
  },
  {
    id: 1,
    from: 'Front of House',
    text: 'The Carrington party has arrived — 6 guests, table 12.',
    time: '19:42',
    unread: true,
    urgent: false,
  },
  {
    id: 2,
    from: 'Kitchen',
    text: 'Sea bass special: 4 portions remaining for this evening.',
    time: '19:38',
    unread: true,
    urgent: false,
  },
  {
    id: 3,
    from: 'Restaurant',
    text: 'Allergy confirmation needed for table 8 before mains.',
    time: '19:35',
    unread: true,
    urgent: true,
  },
  {
    id: 4,
    from: 'Bar',
    text: 'Champagne service is ready for the Astor Suite.',
    time: '19:31',
    unread: false,
    urgent: false,
  },
];

type TaskStatus = 'Sent' | 'Acknowledged' | 'In progress' | 'Complete';

type AssignedTask = {
  id: number;
  title: string;
  from: string;
  to: string;
  status: TaskStatus;
  updated: string;
  attachmentUrl?: string;
  attachmentName?: string;
  note?: string;
};

const taskStatusOrder: TaskStatus[] = [
  'Sent',
  'Acknowledged',
  'In progress',
  'Complete',
];

const initialAssignedTasks: AssignedTask[] = [
  {
    id: 101,
    title: "Prepare tomorrow's menu",
    from: 'General Manager',
    to: 'Kitchen',
    status: 'Acknowledged' as TaskStatus,
    updated: '19:44',
    note: 'Please include the updated seasonal dishes and allergen notes.',
  },
  {
    id: 102,
    title: 'Repair the dishwasher',
    from: 'Kitchen',
    to: 'Maintenance',
    status: 'In progress' as TaskStatus,
    updated: '19:39',
  },
  {
    id: 103,
    title: 'Prepare the Astor Suite arrival',
    from: 'Front of House',
    to: 'Housekeeping',
    status: 'Complete' as TaskStatus,
    updated: '19:31',
  },
];

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function playPing(urgent = false) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const context = new AudioContextClass();
    const offsets = urgent ? [0, 0.24, 0.48] : [0];
    offsets.forEach((offset) => {
      const gain = context.createGain();
      const start = context.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.075 : 0.055, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      gain.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = urgent ? 940 : 760;
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    });
  } catch {
    /* Browsers may block sound before interaction. */
  }
}

export default function Home() {
  const [now, setNow] = useState<Date | null>(null);
  const [activeDepartment, setActiveDepartment] = useState('Front of House');
  const [weather, setWeather] = useState({
    temperature: 17,
    label: 'Partly cloudy',
    kind: 'cloud',
  });
  const [announcementAcknowledged, setAnnouncementAcknowledged] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported' | 'configuration-required'
  >('default');
  const [urgent, setUrgent] = useState(false);
  const [assignAsTask, setAssignAsTask] = useState(false);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [taskNote, setTaskNote] = useState('');
  const [taskNoteEdits, setTaskNoteEdits] = useState<Record<number, string>>({});
  const [recipient, setRecipient] = useState('All departments');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [messageError, setMessageError] = useState('');
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [pinnedNotes, setPinnedNotes] = useState([
    {
      id: 1,
      text: 'VIP arrival · Astor Suite · 20:15',
      urgent: false,
      department: 'Front of House',
    },
    {
      id: 2,
      text: 'Allergy alert · Table 8 · Awaiting confirmation',
      urgent: true,
      department: 'Restaurant',
    },
    {
      id: 3,
      text: 'Get the orange juice out of the fridge before breakfast',
      urgent: false,
      department: 'Restaurant',
    },
  ]);
  const [messages, setMessages] = useState(initialMessages);
  const [assignedTasks, setAssignedTasks] = useState(initialAssignedTasks);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      setPushPermission('unsupported');
      return;
    }
    setPushPermission(Notification.permission);
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,weather_code&timezone=Europe%2FLondon',
    )
      .then((response) => response.json())
      .then((data) => {
        const code = Number(data.current?.weather_code ?? 2);
        const kind = code <= 1 ? 'sun' : code >= 51 ? 'rain' : 'cloud';
        const label =
          kind === 'sun'
            ? 'Clear outside'
            : kind === 'rain'
              ? 'Rain outside'
              : 'Partly cloudy';
        setWeather({
          temperature: Math.round(data.current?.temperature_2m ?? 17),
          label,
          kind,
        });
      })
      .catch(() => undefined);
  }, []);

  const unreadCount = useMemo(
    () => messages.filter((message) => message.unread).length,
    [messages],
  );
  const activeNotification = useMemo(
    () => messages.find((message) => message.unread),
    [messages],
  );
  const seenNotifications = useMemo(
    () => messages.filter((message) => !message.unread),
    [messages],
  );

  const markNotificationSeen = (messageId: number) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, unread: false } : message,
      ),
    );
  };
  const date = now
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(now)
    : 'Loading date';
  const time = now
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now)
    : '--:--:--';

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    if (assignAsTask && recipient === 'All departments') {
      setMessageError('Choose one department so the task has a clear owner.');
      return;
    }
    const blockedLanguage =
      /\b(fuck|shit|bitch|cunt|bastard|asshole|dick|prick|wanker)\w*\b/i;
    if (blockedLanguage.test(draft)) {
      setMessageError(
        'Please rewrite this message using professional language.',
      );
      return;
    }
    const next = {
      id: Date.now(),
      from: recipient,
      text: `${draft.trim()}${attachment ? ` · Attachment: ${attachment}` : ''}`,
      time: new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date()),
      unread: false,
      urgent,
      attachmentUrl: attachmentPreview || undefined,
      attachmentName: attachment || undefined,
    };
    setMessages((current) => [next, ...current]);
    if (assignAsTask && recipient !== 'All departments') {
      setAssignedTasks((current) => [
        {
          id: next.id,
          title: draft.trim(),
          from: activeDepartment,
          to: recipient,
          status: 'Sent',
          updated: next.time,
          attachmentUrl: attachmentPreview || undefined,
          attachmentName: attachment || undefined,
          note: taskNote.trim() || undefined,
        },
        ...current,
      ]);
    }
    if (urgent && recipient !== 'All departments')
      setPinnedNotes((current) => [
        { id: next.id, text: next.text, urgent: true, department: recipient },
        ...current,
      ]);
    playPing(urgent);
    setDraft('');
    setAttachment('');
    setAttachmentPreview('');
    setMessageError('');
    setUrgent(false);
    setAssignAsTask(false);
    setTaskNote('');
    setComposerOpen(false);
  };

  const advanceTask = (taskId: number) => {
    setAssignedTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId || task.to !== activeDepartment) return task;
        const currentIndex = taskStatusOrder.indexOf(task.status);
        const status = taskStatusOrder[Math.min(currentIndex + 1, taskStatusOrder.length - 1)];
        return {
          ...task,
          status,
          updated: new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date()),
        };
      }),
    );
  };

  const saveTaskNote = (taskId: number) => {
    setAssignedTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              note: (taskNoteEdits[taskId] ?? task.note ?? '').trim() || undefined,
              updated: new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date()),
            }
          : task,
      ),
    );
  };

  const enableComputerAlerts = async () => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      setPushPermission('unsupported');
      return;
    }

    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as
      | string
      | undefined;
    const subscribeUrl = import.meta.env.VITE_WEB_PUSH_SUBSCRIBE_URL as
      | string
      | undefined;

    if (!publicKey || !subscribeUrl) {
      setPushPermission('configuration-required');
      await registration.showNotification('Computer alerts permitted', {
        body: 'This device is ready. Secure background delivery still needs the hotel push service to be connected.',
        icon: '/favicon.svg',
        tag: 'noir-house-permission-check',
      });
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const response = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, department: activeDepartment }),
    });
    if (!response.ok) setPushPermission('configuration-required');
  };

  const pinNote = (event: FormEvent) => {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    setPinnedNotes((current) => [
      {
        id: Date.now(),
        text: noteDraft.trim(),
        urgent: false,
        department: activeDepartment,
      },
      ...current,
    ]);
    setNoteDraft('');
    playPing(false);
  };

  const toggleVoiceNote = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const voiceNote = new Blob(recordingChunks.current, {
          type: recorder.mimeType,
        });
        setAttachment(
          `Voice note · ${Math.max(1, Math.round(voiceNote.size / 1024))} KB`,
        );
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMessageError('Microphone access is needed to record a voice note.');
    }
  };

  return (
    <main className="hotel-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {activeNotification && (
        <section
          className={`live-notification ${activeNotification.urgent ? 'urgent' : ''}`}
          aria-live={activeNotification.urgent ? 'assertive' : 'polite'}
          aria-label="New notification"
        >
          <span className="live-notification-symbol">
            {activeNotification.urgent ? (
              <Zap size={18} />
            ) : (
              <BellRing size={18} />
            )}
          </span>
          <div className="live-notification-copy">
            <span>
              {activeNotification.urgent ? 'Urgent notification' : 'New notification'}
              <time>{activeNotification.time}</time>
            </span>
            <strong>{activeNotification.from}</strong>
            <p>{activeNotification.text}</p>
          </div>
          <div className="live-notification-actions">
            <button
              aria-label="Pin notification"
              onClick={() => {
                setPinnedNotes((current) => [
                  {
                    id: Date.now(),
                    text: `${activeNotification.from} · ${activeNotification.text}`,
                    urgent: activeNotification.urgent,
                    department: activeDepartment,
                  },
                  ...current,
                ]);
                markNotificationSeen(activeNotification.id);
                playPing(false);
              }}
            >
              <Pin size={15} />
            </button>
            <button
              aria-label="Mark notification as seen"
              onClick={() => markNotificationSeen(activeNotification.id)}
            >
              <X size={15} />
            </button>
          </div>
          {unreadCount > 1 && (
            <small className="notification-queue-count">
              {unreadCount - 1} waiting
            </small>
          )}
        </section>
      )}
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Noir Hotel">
          <span>N</span>
        </div>
        <nav aria-label="Main navigation">
          <button className="nav-button active" aria-label="Dashboard">
            <LayoutDashboard size={20} />
          </button>
          <button
            className="nav-button"
            aria-label="Messages"
            onClick={() => setComposerOpen(true)}
          >
            <MessageSquareText size={20} />
            <span className="nav-dot" />
          </button>
          <button className="nav-button" aria-label="Notes">
            <NotebookPen size={20} />
          </button>
          <button className="nav-button" aria-label="Security">
            <ShieldCheck size={20} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-button" aria-label="Settings">
            <Settings size={19} />
          </button>
          <div className="profile-avatar">EM</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar glass-panel">
          <div className="property-heading">
            <p>NOIR HOUSE · LONDON</p>
            <div className="department-greeting">
              <span>Good evening,</span>
              <select
                aria-label="Active department"
                value={activeDepartment}
                onChange={(event) => setActiveDepartment(event.target.value)}
              >
                {departments.map((department) => (
                  <option key={department.name}>{department.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div
            className="weather"
            aria-label={`London weather: ${weather.label}, ${weather.temperature} degrees`}
          >
            <div className={`weather-icon ${weather.kind}`}>
              {weather.kind === 'sun' ? (
                <Sun size={27} />
              ) : weather.kind === 'rain' ? (
                <>
                  <CloudRain size={27} />
                  <span className="rain-drops" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </>
              ) : (
                <CloudSun size={27} />
              )}
            </div>
            <div>
              <strong>{weather.temperature}°</strong>
              <span>{weather.label}</span>
            </div>
          </div>
          <div className="date-time">
            <div>
              <span>{date}</span>
              <strong>{time}</strong>
            </div>
          </div>
          <div className="top-actions">
            <button className="icon-button search-action" aria-label="Search">
              <Search size={18} />
            </button>
            <div className="notification-wrap">
              <button
                className={`icon-button ${unreadCount ? 'has-alert' : ''}`}
                aria-label={`${unreadCount} unread notifications`}
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="count-badge">{unreadCount}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className="notification-popover glass-panel">
                  <div className="popover-heading">
                    <div>
                      <span>Notifications</span>
                      <strong>{seenNotifications.length} seen</strong>
                    </div>
                    <button onClick={() => setNotificationsOpen(false)}>
                      <X size={16} />
                    </button>
                  </div>
                  <button
                    className={`push-permission status-${pushPermission}`}
                    onClick={enableComputerAlerts}
                    disabled={pushPermission === 'denied' || pushPermission === 'unsupported'}
                  >
                    <BellRing size={14} />
                    <span>
                      {pushPermission === 'granted'
                        ? 'Computer alerts enabled'
                        : pushPermission === 'configuration-required'
                          ? 'Device ready · delivery setup required'
                          : pushPermission === 'denied'
                            ? 'Computer alerts blocked in browser settings'
                            : pushPermission === 'unsupported'
                              ? 'Computer alerts unavailable'
                              : 'Enable computer alerts'}
                    </span>
                  </button>
                  {seenNotifications.length === 0 && (
                    <p className="notification-empty">No seen notifications yet.</p>
                  )}
                  {seenNotifications
                    .map((message) => (
                      <article
                        key={message.id}
                        className={`notification-item ${message.urgent ? 'urgent' : ''}`}
                      >
                        <span className="notification-symbol">
                          {message.urgent ? (
                            <Zap size={15} />
                          ) : (
                            <BellRing size={15} />
                          )}
                        </span>
                        <span className="notification-copy">
                          <strong>{message.from}</strong>
                          <small>{message.text}</small>
                        </span>
                        <span className="notification-actions">
                          <button
                            aria-label="Pin notification"
                            onClick={() => {
                              setPinnedNotes((current) => [
                                {
                                  id: Date.now(),
                                  text: `${message.from} · ${message.text}`,
                                  urgent: message.urgent,
                                  department: activeDepartment,
                                },
                                ...current,
                              ]);
                              playPing(false);
                            }}
                          >
                            <Pin size={13} />
                          </button>
                          <button
                            aria-label="Remove notification from history"
                            onClick={() =>
                              setMessages((current) =>
                                current.filter(
                                  (item) => item.id !== message.id,
                                ),
                              )
                            }
                          >
                            <X size={13} />
                          </button>
                        </span>
                      </article>
                    ))}
                </div>
              )}
            </div>
            <button
              className="compose-button"
              onClick={() => setComposerOpen((open) => !open)}
            >
              <Plus size={18} />
              <span>New message</span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        <div className="content">
          <section className="management-announcement glass-panel">
            <BellRing size={18} />
            <div>
              <span>GENERAL MANAGER ANNOUNCEMENT</span>
              <strong>Fire drill · Staff car park · Tomorrow at 07:00</strong>
              <small>Posted by Alex Morgan · 20:04</small>
            </div>
            <button
              className={announcementAcknowledged ? 'acknowledged' : ''}
              onClick={() => setAnnouncementAcknowledged(true)}
            >
              {announcementAcknowledged ? 'Acknowledged' : 'Acknowledge'}
            </button>
          </section>
          <section className="pinboard glass-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  <Pin size={13} /> Department pinboard
                </span>
                <h2>Important for {activeDepartment}</h2>
              </div>
            </div>
            <div className="pinned-strip">
              {pinnedNotes
                .filter((note) => note.department === activeDepartment)
                .map((note, index) => (
                  <article
                    key={note.id}
                    className={`pinned-note ${note.urgent ? 'urgent' : ''} ${index === 0 ? 'new-note' : ''}`}
                  >
                    <span className="pin-icon">
                      {note.urgent ? <Zap size={15} /> : <Pin size={15} />}
                    </span>
                    <div>
                      <small>{note.urgent ? 'URGENT' : 'PINNED NOTE'}</small>
                      <p>{note.text}</p>
                    </div>
                    <button
                      aria-label="Unpin note"
                      onClick={() =>
                        setPinnedNotes((current) =>
                          current.filter((item) => item.id !== note.id),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </article>
                ))}
              <form className="quick-note" onSubmit={pinNote}>
                <NotebookPen size={17} />
                <input
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={`Pin a note for ${activeDepartment}…`}
                  aria-label="New pinned note"
                />
                <button type="submit" aria-label="Pin note">
                  <Pin size={15} />
                </button>
              </form>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="main-column">
              <section className="activity glass-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Live conversation</span>
                    <h2>Recent messages</h2>
                  </div>
                  <button className="filter-button">
                    All departments <ChevronDown size={14} />
                  </button>
                </div>
                <div className="message-list">
                  {messages.slice(0, 4).map((message) => {
                    const task = assignedTasks.find((item) => item.id === message.id);
                    const taskIndex = task ? taskStatusOrder.indexOf(task.status) : -1;
                    const canAdvanceTask = Boolean(
                      task && task.to === activeDepartment && task.status !== 'Complete',
                    );
                    const nextTaskStatus = task
                      ? taskStatusOrder[Math.min(taskIndex + 1, taskStatusOrder.length - 1)]
                      : 'Acknowledged';
                    return (
                      <article
                        id={`message-${message.id}`}
                        className={`message-row ${message.urgent ? 'urgent' : ''} ${task ? 'task-message' : ''}`}
                        key={message.id}
                      >
                        <span className="message-avatar">
                          {message.from
                            .split(' ')
                            .map((word) => word[0])
                            .join('')
                            .slice(0, 2)}
                        </span>
                        <div className="message-copy">
                          <div>
                            <strong>{message.from}</strong>
                            {message.urgent && (
                              <span className="urgent-label">
                                <Zap size={11} /> urgent
                              </span>
                            )}
                            <time>{message.time}</time>
                          </div>
                          <p>{message.text}</p>
                          {message.attachmentUrl && (
                            <figure className="message-attachment">
                              <img
                                src={message.attachmentUrl}
                                alt={message.attachmentName || 'Task attachment'}
                              />
                              <figcaption>
                                <Paperclip size={11} /> {message.attachmentName}
                              </figcaption>
                            </figure>
                          )}
                          {task && (
                            <div className="message-task-state">
                              <div>
                                <span>Assigned to {task.to}</span>
                                <strong>{task.status}</strong>
                              </div>
                              <div className="message-task-progress">
                                {taskStatusOrder.slice(1).map((stage, index) => (
                                  <i
                                    className={taskIndex >= index + 1 ? 'reached' : ''}
                                    key={stage}
                                    title={stage}
                                  />
                                ))}
                              </div>
                              {task.note && <p className="task-note">{task.note}</p>}
                              {canAdvanceTask && (
                                <button onClick={() => advanceTask(task.id)}>
                                  Mark {nextTaskStatus}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {message.unread && <span className="unread-dot" />}
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="right-column">
              <section className="shift-card glass-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Accountability</span>
                    <h2>Tasks</h2>
                  </div>
                  <ListChecks size={18} aria-label="Tasks" />
                </div>
                {assignedTasks.slice(0, 3).map((task) => {
                  const currentIndex = taskStatusOrder.indexOf(task.status);
                  const canAdvance =
                    task.to === activeDepartment && task.status !== 'Complete';
                  const nextStatus =
                    taskStatusOrder[Math.min(currentIndex + 1, taskStatusOrder.length - 1)];
                  return (
                    <article className="tracked-task" key={task.id}>
                      <div className="tracked-task-heading">
                        <div>
                          <strong>{task.title}</strong>
                          <span>{task.from} → {task.to}</span>
                        </div>
                        <span className={`task-status status-${task.status.toLowerCase().replace(' ', '-')}`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="task-progress" aria-label={`Task status: ${task.status}`}>
                        {taskStatusOrder.slice(1).map((stage, index) => (
                          <span
                            className={currentIndex >= index + 1 ? 'reached' : ''}
                            key={stage}
                          >
                            {stage}
                          </span>
                        ))}
                      </div>
                      {task.attachmentUrl && (
                        <figure className="task-attachment">
                          <img
                            src={task.attachmentUrl}
                            alt={task.attachmentName || 'Task attachment'}
                          />
                          <figcaption>{task.attachmentName}</figcaption>
                        </figure>
                      )}
                      {task.note && <p className="task-note">{task.note}</p>}
                      {task.to === activeDepartment && (
                        <div className="task-note-editor">
                          <input
                            value={taskNoteEdits[task.id] ?? task.note ?? ''}
                            onChange={(event) =>
                              setTaskNoteEdits((current) => ({
                                ...current,
                                [task.id]: event.target.value,
                              }))
                            }
                            placeholder="Add a short task note…"
                            aria-label={`Note for ${task.title}`}
                          />
                          <button onClick={() => saveTaskNote(task.id)}>Save note</button>
                        </div>
                      )}
                      <div className="tracked-task-footer">
                        <small>Updated {task.updated} · visible to sender</small>
                        <div>
                          <button
                            className="view-message-button"
                            onClick={() =>
                              document
                                .getElementById(`message-${task.id}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            }
                          >
                            View message
                          </button>
                          {canAdvance && (
                            <button onClick={() => advanceTask(task.id)}>
                              Mark {nextStatus}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
              <section className="attention-card glass-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Owned actions</span>
                    <h2>Action log</h2>
                  </div>
                  <span className="request-count">3</span>
                </div>
                <div className="request">
                  <span className="priority high" />
                  <div>
                    <strong>Allergy confirmation</strong>
                    <p>Owned by Restaurant · Due now</p>
                  </div>
                  <ChevronDown size={15} />
                </div>
                <div className="request">
                  <span className="priority medium" />
                  <div>
                    <strong>Late room service</strong>
                    <p>Owned by Kitchen · Due 20:10</p>
                  </div>
                  <ChevronDown size={15} />
                </div>
                <div className="request">
                  <span className="priority low" />
                  <div>
                    <strong>Guest transport</strong>
                    <p>Owned by Front of House · Due 20:30</p>
                  </div>
                  <ChevronDown size={15} />
                </div>
                <div className="handover-signoff">
                  <ShieldCheck size={14} />
                  <div>
                    <strong>Shift handover accepted</strong>
                    <span>Jordan M. · Front of House · 19:00</span>
                  </div>
                </div>
              </section>
            </aside>
          </section>
        </div>

        {composerOpen && (
          <div
            className="composer glass-panel"
            role="dialog"
            aria-label="New message"
          >
            <div className="composer-heading">
              <div>
                <span>New message</span>
                <small>Send across the hotel</small>
              </div>
              <button
                onClick={() => setComposerOpen(false)}
                aria-label="Close message composer"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={sendMessage}>
              <div className="recipient-heading">
                <span>Send to</span>
                <small>{recipient}</small>
              </div>
              <div className="recipient-picker">
                <button
                  type="button"
                  className={recipient === 'All departments' ? 'active' : ''}
                  onClick={() => setRecipient('All departments')}
                >
                  <Sparkles size={13} /> All departments
                </button>
                {departments.map((department) => {
                  const Icon = department.icon;
                  return (
                    <button
                      type="button"
                      className={recipient === department.name ? 'active' : ''}
                      onClick={() => setRecipient(department.name)}
                      key={department.name}
                    >
                      <Icon size={13} /> {department.name}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={draft}
                spellCheck={spellCheckEnabled}
                lang="en-GB"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setMessageError('');
                }}
                placeholder="Write your message…"
                autoFocus
              />
              {assignAsTask && (
                <input
                  className="task-note-input"
                  value={taskNote}
                  onChange={(event) => setTaskNote(event.target.value)}
                  placeholder="Add a short note for the person receiving this task…"
                  aria-label="Task note"
                />
              )}
              {messageError && (
                <p className="message-error">
                  <ShieldCheck size={13} /> {messageError}
                </p>
              )}
              {attachment && (
                <div className="attachment-chip">
                  <Paperclip size={13} />
                  <span>{attachment}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachment('');
                      setAttachmentPreview('');
                    }}
                    aria-label="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="composer-footer">
                <div className="composer-tools">
                  <button
                    type="button"
                    className={`spellcheck-toggle ${spellCheckEnabled ? 'active' : ''}`}
                    onClick={() => setSpellCheckEnabled((value) => !value)}
                    aria-label={spellCheckEnabled ? 'Turn spell-check off' : 'Turn spell-check on'}
                    title={spellCheckEnabled ? 'Spell-check on' : 'Spell-check off'}
                  >
                    <SpellCheck size={18} />
                  </button>
                  <button
                    type="button"
                    className={`task-icon-toggle ${assignAsTask ? 'active' : ''}`}
                    onClick={() => setAssignAsTask((value) => !value)}
                    aria-label={assignAsTask ? 'Send as a normal message' : 'Create a task from this message'}
                    title={assignAsTask ? 'Task selected' : 'Create task'}
                  >
                    <ListChecks size={18} />
                  </button>
                  <button
                    type="button"
                    className={`urgent-toggle ${urgent ? 'active' : ''}`}
                    onClick={() => setUrgent((value) => !value)}
                    aria-label={urgent ? 'Remove urgent priority' : 'Mark message urgent'}
                    title={urgent ? 'Urgent priority selected' : 'Mark as urgent'}
                  >
                    <Zap size={17} />
                  </button>
                  <label
                    className="attach-button"
                    aria-label="Attach a photo or PDF"
                  >
                    <Paperclip size={17} />
                    <input
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      onChange={(event) =>
                        {
                          const file = event.target.files?.[0];
                          setAttachment(file?.name ?? '');
                          setAttachmentPreview(
                            file?.type.startsWith('image/')
                              ? URL.createObjectURL(file)
                              : '',
                          );
                        }
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={
                      recording ? 'Stop voice recording' : 'Record a voice note'
                    }
                    className={`voice-button ${recording ? 'recording' : ''}`}
                    onClick={toggleVoiceNote}
                  >
                    <Mic size={17} />
                  </button>
                </div>
                <button type="submit" className="send-button">
                  {assignAsTask ? 'Assign task' : 'Send message'} <Send size={15} />
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
