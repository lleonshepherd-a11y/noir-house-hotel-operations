'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, ChefHat, ChevronDown, CloudSun, ConciergeBell,
  Crown, Droplets, LayoutDashboard, Martini, MessageSquareText,
  Mic, MoreHorizontal, NotebookPen, Paperclip, Pin, Plus, Search, Send, Settings,
  ShieldCheck, Sparkles, UtensilsCrossed, Wrench, X, Zap,
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
  { id: 1, from: 'Front of House', text: 'The Carrington party has arrived — 6 guests, table 12.', time: '19:42', unread: true, urgent: false },
  { id: 2, from: 'Kitchen', text: 'Sea bass special: 4 portions remaining for this evening.', time: '19:38', unread: true, urgent: false },
  { id: 3, from: 'Restaurant', text: 'Allergy confirmation needed for table 8 before mains.', time: '19:35', unread: true, urgent: true },
  { id: 4, from: 'Bar', text: 'Champagne service is ready for the Astor Suite.', time: '19:31', unread: false, urgent: false },
];

function playPing(urgent = false) {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(urgent ? 0.2 : 0.1, context.currentTime + 0.01);
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
  } catch { /* Browsers may block sound before interaction. */ }
}

export default function Home() {
  const [now, setNow] = useState(new Date());
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
    { id: 1, text: 'VIP arrival · Astor Suite · 20:15', urgent: false },
    { id: 2, text: 'Allergy alert · Table 8 · Awaiting confirmation', urgent: true },
  ]);
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const unreadCount = useMemo(() => messages.filter((message) => message.unread).length, [messages]);
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const blockedLanguage = /\b(fuck|shit|bitch|cunt|bastard|asshole|dick|prick|wanker)\w*\b/i;
    if (blockedLanguage.test(draft)) { setMessageError('Please rewrite this message using professional language.'); return; }
    const next = { id: Date.now(), from: recipient, text: `${draft.trim()}${attachment ? ` · Attachment: ${attachment}` : ''}`, time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()), unread: false, urgent };
    setMessages((current) => [next, ...current]);
    if (urgent) setPinnedNotes((current) => [{ id: next.id, text: `${recipient} · ${next.text}`, urgent: true }, ...current]);
    playPing(urgent);
    setDraft(''); setAttachment(''); setMessageError(''); setUrgent(false); setComposerOpen(false);
  };

  const pinNote = (event: FormEvent) => {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    setPinnedNotes((current) => [{ id: Date.now(), text: noteDraft.trim(), urgent: false }, ...current]);
    setNoteDraft(''); playPing(false);
  };

  const toggleVoiceNote = async () => {
    if (recording && recorderRef.current) { recorderRef.current.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunks.current.push(event.data); };
      recorder.onstop = () => {
        const voiceNote = new Blob(recordingChunks.current, { type: recorder.mimeType });
        setAttachment(`Voice note · ${Math.max(1, Math.round(voiceNote.size / 1024))} KB`);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder; recorder.start(); setRecording(true);
    } catch { setMessageError('Microphone access is needed to record a voice note.'); }
  };

  return (
    <main className="hotel-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Noir Hotel"><span>N</span></div>
        <nav aria-label="Main navigation">
          <button className="nav-button active" aria-label="Dashboard"><LayoutDashboard size={20} /></button>
          <button className="nav-button" aria-label="Messages" onClick={() => setComposerOpen(true)}><MessageSquareText size={20} /><span className="nav-dot" /></button>
          <button className="nav-button" aria-label="Notes"><NotebookPen size={20} /></button>
          <button className="nav-button" aria-label="Security"><ShieldCheck size={20} /></button>
        </nav>
        <div className="sidebar-bottom"><button className="nav-button" aria-label="Settings"><Settings size={19} /></button><div className="profile-avatar">EM</div></div>
      </aside>

      <section className="workspace">
        <header className="topbar glass-panel">
          <div className="property-heading"><p>NOIR HOUSE · LONDON</p><h1>Good evening, Eleanor</h1></div>
          <div className="weather" aria-label="London weather: partly cloudy, 17 degrees"><div className="weather-icon"><CloudSun size={25} /></div><div><strong>17°</strong><span>Partly cloudy</span></div></div>
          <div className="date-time"><div><span>{date}</span><strong>{time}</strong></div></div>
          <div className="top-actions">
            <button className="icon-button search-action" aria-label="Search"><Search size={18} /></button>
            <div className="notification-wrap">
              <button className={`icon-button ${unreadCount ? 'has-alert' : ''}`} aria-label={`${unreadCount} unread notifications`} onClick={() => setNotificationsOpen((open) => !open)}><Bell size={18} />{unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}</button>
              {notificationsOpen && <div className="notification-popover glass-panel">
                <div className="popover-heading"><div><span>Notifications</span><strong>{unreadCount} new</strong></div><button onClick={() => setNotificationsOpen(false)}><X size={16} /></button></div>
                {messages.filter((message) => message.unread).map((message) => <article key={message.id} className={`notification-item ${message.urgent ? 'urgent' : ''}`}><span className="notification-symbol">{message.urgent ? <Zap size={15} /> : <BellRing size={15} />}</span><span className="notification-copy"><strong>{message.from}</strong><small>{message.text}</small></span><span className="notification-actions"><button aria-label="Pin notification" onClick={() => { setPinnedNotes((current) => [{ id: Date.now(), text: `${message.from} · ${message.text}`, urgent: message.urgent }, ...current]); setMessages((current) => current.map((item) => item.id === message.id ? { ...item, unread: false } : item)); playPing(false); }}><Pin size={13} /></button><button aria-label="Dismiss notification" onClick={() => setMessages((current) => current.filter((item) => item.id !== message.id))}><X size={13} /></button></span></article>)}
              </div>}
            </div>
            <button className="compose-button" onClick={() => setComposerOpen((open) => !open)}><Plus size={18} /><span>New message</span><ChevronDown size={15} /></button>
          </div>
        </header>

        <div className="content">
          <section className="pinboard glass-panel">
            <div className="section-heading"><div><span className="eyebrow"><Pin size={13} /> Live pinboard</span><h2>Important across the hotel</h2></div><span className="live-status"><i /> Live</span></div>
            <div className="pinned-strip">
              {pinnedNotes.map((note, index) => <article key={note.id} className={`pinned-note ${note.urgent ? 'urgent' : ''} ${index === 0 ? 'new-note' : ''}`}><span className="pin-icon">{note.urgent ? <Zap size={15} /> : <Pin size={15} />}</span><div><small>{note.urgent ? 'URGENT' : 'PINNED NOTE'}</small><p>{note.text}</p></div><button aria-label="Unpin note" onClick={() => setPinnedNotes((current) => current.filter((item) => item.id !== note.id))}><X size={14} /></button></article>)}
              <form className="quick-note" onSubmit={pinNote}><NotebookPen size={17} /><input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Write and pin a note…" aria-label="New pinned note" /><button type="submit" aria-label="Pin note"><Pin size={15} /></button></form>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="main-column">
              <div className="section-heading department-heading"><div><span className="eyebrow">Hotel operations</span><h2>Departments</h2></div><button>View all <ChevronDown size={14} /></button></div>
              <div className="department-grid">
                {departments.map((department, index) => { const Icon = department.icon; return <button className="department-card glass-panel" key={department.name} onClick={() => { setRecipient(department.name); setComposerOpen(true); }}><div className="department-top"><span className="department-icon" style={{ color: department.accent }}><Icon size={22} /></span>{index === 4 && <span className="mini-alert">2</span>}<MoreHorizontal size={17} /></div><div><h3>{department.name}</h3><p><i /> {department.online} staff online</p></div><span className="card-action">Open channel <MessageSquareText size={14} /></span></button>; })}
              </div>

              <section className="activity glass-panel">
                <div className="section-heading"><div><span className="eyebrow">Live conversation</span><h2>Recent messages</h2></div><button className="filter-button">All departments <ChevronDown size={14} /></button></div>
                <div className="message-list">{messages.slice(0, 4).map((message) => <article className={`message-row ${message.urgent ? 'urgent' : ''}`} key={message.id}><span className="message-avatar">{message.from.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><div className="message-copy"><div><strong>{message.from}</strong>{message.urgent && <span className="urgent-label"><Zap size={11} /> urgent</span>}<time>{message.time}</time></div><p>{message.text}</p></div>{message.unread && <span className="unread-dot" />}</article>)}</div>
              </section>
            </div>

            <aside className="right-column">
              <section className="shift-card glass-panel"><div className="section-heading"><div><span className="eyebrow">Tonight</span><h2>Evening service</h2></div><Sparkles size={18} /></div><div className="occupancy"><div className="ring"><span>92<small>%</small></span></div><div><strong>176</strong><span>Guests in house</span><small>12 arrivals remaining</small></div></div><div className="service-stats"><div><strong>38</strong><span>Dining covers</span></div><div><strong>4</strong><span>VIP guests</span></div><div><strong>26</strong><span>Staff on duty</span></div></div></section>
              <section className="attention-card glass-panel"><div className="section-heading"><div><span className="eyebrow">Needs attention</span><h2>Open requests</h2></div><span className="request-count">3</span></div><div className="request"><span className="priority high" /><div><strong>Allergy confirmation</strong><p>Restaurant · 3 min ago</p></div><ChevronDown size={15} /></div><div className="request"><span className="priority medium" /><div><strong>Late room service</strong><p>Kitchen · 8 min ago</p></div><ChevronDown size={15} /></div><div className="request"><span className="priority low" /><div><strong>Guest transport</strong><p>Front of House · 12 min ago</p></div><ChevronDown size={15} /></div></section>
            </aside>
          </section>
        </div>

        {composerOpen && <div className="composer glass-panel" role="dialog" aria-label="New message"><div className="composer-heading"><div><span>New message</span><small>Send across the hotel</small></div><button onClick={() => setComposerOpen(false)} aria-label="Close message composer"><X size={18} /></button></div><form onSubmit={sendMessage}><div className="recipient-heading"><span>Send to</span><small>{recipient}</small></div><div className="recipient-picker"><button type="button" className={recipient === 'All departments' ? 'active' : ''} onClick={() => setRecipient('All departments')}><Sparkles size={13} /> All departments</button>{departments.map((department) => { const Icon = department.icon; return <button type="button" className={recipient === department.name ? 'active' : ''} onClick={() => setRecipient(department.name)} key={department.name}><Icon size={13} /> {department.name}</button>; })}</div><textarea value={draft} onChange={(event) => { setDraft(event.target.value); setMessageError(''); }} placeholder="Write your message…" autoFocus />{messageError && <p className="message-error"><ShieldCheck size={13} /> {messageError}</p>}{attachment && <div className="attachment-chip"><Paperclip size={13} /><span>{attachment}</span><button type="button" onClick={() => setAttachment('')} aria-label="Remove attachment"><X size={12} /></button></div>}<div className="composer-footer"><div className="composer-tools"><button type="button" className={`urgent-toggle ${urgent ? 'active' : ''}`} onClick={() => setUrgent((value) => !value)}><Zap size={15} /> Urgent</button><label className="attach-button"><Paperclip size={15} /><span>Attach</span><input type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => setAttachment(event.target.files?.[0]?.name ?? '')} /></label><button type="button" className={`voice-button ${recording ? 'recording' : ''}`} onClick={toggleVoiceNote}><Mic size={15} />{recording ? 'Stop' : 'Voice'}</button></div><button type="submit" className="send-button">Send message <Send size={15} /></button></div></form></div>}
      </section>
    </main>
  );
}
