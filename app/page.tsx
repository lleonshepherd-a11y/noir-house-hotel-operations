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

const initialMessages = [
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

function playPing(urgent = false) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      urgent ? 0.2 : 0.1,
      context.currentTime + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
    gain.connect(context.destination);
    [urgent ? 880 : 660, urgent ? 1175 : 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.11);
      oscillator.stop(context.currentTime + 0.45);
    });
  } catch {
    /* Browsers may block sound before interaction. */
  }
}

export default function Home() {
  const [now, setNow] = useState(new Date());
  const [activeDepartment, setActiveDepartment] = useState('Front of House');
  const [weather, setWeather] = useState({
    temperature: 17,
    label: 'Partly cloudy',
    kind: 'cloud',
  });
  const [announcementAcknowledged, setAnnouncementAcknowledged] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [recipient, setRecipient] = useState('All departments');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState('');
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
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
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
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
    };
    setMessages((current) => [next, ...current]);
    if (urgent && recipient !== 'All departments')
      setPinnedNotes((current) => [
        { id: next.id, text: next.text, urgent: true, department: recipient },
        ...current,
      ]);
    playPing(urgent);
    setDraft('');
    setAttachment('');
    setMessageError('');
    setUrgent(false);
    setComposerOpen(false);
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
                      <strong>{unreadCount} new</strong>
                    </div>
                    <button onClick={() => setNotificationsOpen(false)}>
                      <X size={16} />
                    </button>
                  </div>
                  {messages
                    .filter((message) => message.unread)
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
                                },
                                ...current,
                              ]);
                              setMessages((current) =>
                                current.map((item) =>
                                  item.id === message.id
                                    ? { ...item, unread: false }
                                    : item,
                                ),
                              );
                              playPing(false);
                            }}
                          >
                            <Pin size={13} />
                          </button>
                          <button
                            aria-label="Dismiss notification"
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
                  {messages.slice(0, 4).map((message) => (
                    <article
                      className={`message-row ${message.urgent ? 'urgent' : ''}`}
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
                      </div>
                      {message.unread && <span className="unread-dot" />}
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="right-column">
              <section className="shift-card glass-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Accountability</span>
                    <h2>Response tracker</h2>
                  </div>
                  <ShieldCheck size={18} />
                </div>
                <div className="response-row">
                  <span className="response-status approved" />
                  <div>
                    <strong>Dry-cleaning approval</strong>
                    <span>General Manager replied</span>
                    <small>Approved · 2 min ago</small>
                  </div>
                </div>
                <div className="response-row">
                  <span className="response-status acknowledged" />
                  <div>
                    <strong>Dishwasher repair</strong>
                    <span>Maintenance acknowledged</span>
                    <small>Engineer attending · 6 min ago</small>
                  </div>
                </div>
                <div className="response-row">
                  <span className="response-status waiting" />
                  <div>
                    <strong>Extra room setup</strong>
                    <span>Sent to Housekeeping</span>
                    <small>Awaiting reply · 9 min ago</small>
                  </div>
                </div>
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
                onChange={(event) => {
                  setDraft(event.target.value);
                  setMessageError('');
                }}
                placeholder="Write your message…"
                autoFocus
              />
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
                    onClick={() => setAttachment('')}
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
                    className={`urgent-toggle ${urgent ? 'active' : ''}`}
                    onClick={() => setUrgent((value) => !value)}
                  >
                    <Zap size={15} /> Urgent
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
                        setAttachment(event.target.files?.[0]?.name ?? '')
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
                  Send message <Send size={15} />
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
