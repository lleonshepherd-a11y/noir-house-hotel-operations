'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronDown,
  Clock,
  Coffee,
  Compass,
  Navigation,
  Phone,
  Send,
  ShieldCheck,
  Shirt,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Wine,
} from 'lucide-react';

const RECEPTION_PHONE = '+442071234567';
const STORAGE_KEY = 'noirHouseGuestRequest';

const faqs = [
  {
    id: 'parking',
    icon: Car,
    question: 'What time is the car park open until?',
    answer: 'The car park is accessible 24 hours a day. The barrier locks at 23:00 — Reception can issue a late-entry code at any time.',
    urgent: false,
  },
  {
    id: 'restaurant',
    icon: UtensilsCrossed,
    question: 'What time does the restaurant close?',
    answer: 'Dinner is served from 18:00 until 22:30. The kitchen can also arrange a later table on request.',
    urgent: false,
  },
  {
    id: 'bar',
    icon: Wine,
    question: 'What time is the bar open until?',
    answer: 'The hotel bar is open from 12:00 until midnight, with a late lounge menu available after 22:00.',
    urgent: false,
  },
  {
    id: 'room-extras',
    icon: Shirt,
    question: 'Is there an iron, hairdryer or extra towels in my room?',
    answer: 'Yes — an iron, hairdryer and spare towels are in the wardrobe. Message Housekeeping below for anything missing.',
    urgent: false,
  },
  {
    id: 'wifi',
    icon: Wifi,
    question: 'How do I connect to the Wi-Fi?',
    answer: 'Connect to "Noir House Guest" and enter your surname and room number.',
    urgent: false,
  },
  {
    id: 'breakfast',
    icon: Coffee,
    question: 'What time is breakfast?',
    answer: 'Breakfast is served from 06:30 until 10:30 in the ground-floor restaurant.',
    urgent: false,
  },
  {
    id: 'checkout',
    icon: Clock,
    question: 'What time is checkout?',
    answer: 'Checkout is at 11:00. Reception is always happy to discuss a later departure.',
    urgent: false,
  },
  {
    id: 'housekeeping',
    icon: Sparkles,
    question: 'How do I request housekeeping?',
    answer: 'Message us below with your room number and what you need — extra pillows, a fresh service, anything at all.',
    urgent: false,
  },
  {
    id: 'taxis',
    icon: Navigation,
    question: 'Can you book me a taxi?',
    answer: 'Yes — the concierge can arrange a licensed taxi at any hour. Send us your pickup time below.',
    urgent: false,
  },
  {
    id: 'local',
    icon: Compass,
    question: 'Where can you recommend nearby?',
    answer: 'Ask below for walking routes, restaurants or the nearest late-night chemist — we know the area well.',
    urgent: false,
  },
  {
    id: 'emergency',
    icon: AlertTriangle,
    question: 'I need urgent help',
    answer: 'If anyone is in immediate danger, call emergency services now, then alert Reception. For anything urgent but not dangerous, message us below and mark it urgent.',
    urgent: true,
  },
] as const;

type SavedRequest = { id: string; accessToken: string };
type RequestState = 'idle' | 'sending' | 'sent' | 'error';
type ReplyState = { status: string; reply: string | null; repliedAt: string | null } | null;

export default function GuestHelpPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [message, setMessage] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [reply, setReply] = useState<ReplyState>(null);
  const savedRequest = useRef<SavedRequest | null>(null);

  // A QR code in the room can point straight at /guest-help?room=214 so the
  // guest never has to type their own room number.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) setRoom(roomParam);
  }, []);

  // There's no guest account to sign into, so the access token from the
  // POST response is what lets this browser read back its own reply later -
  // kept in localStorage so refreshing the page doesn't lose it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) savedRequest.current = JSON.parse(raw) as SavedRequest;
    } catch {
      savedRequest.current = null;
    }
    if (!savedRequest.current) return;
    setRequestState('sent');
    let cancelled = false;
    async function poll() {
      const current = savedRequest.current;
      if (!current) return;
      try {
        const response = await fetch(`/api/guest-requests?id=${encodeURIComponent(current.id)}&token=${encodeURIComponent(current.accessToken)}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data = (await response.json()) as ReplyState;
        if (!cancelled) setReply(data);
      } catch {
        // A missed poll just tries again next interval - nothing to show the guest for it.
      }
    }
    poll();
    const interval = window.setInterval(poll, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || requestState === 'sending') return;
    setRequestState('sending');
    try {
      const response = await fetch('/api/guest-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: room.trim() || undefined,
          message: message.trim(),
          urgency: urgent ? 'urgent' : 'normal',
        }),
      });
      if (!response.ok) throw new Error('Request failed');
      const data = (await response.json()) as { id: string; accessToken: string };
      savedRequest.current = { id: data.id, accessToken: data.accessToken };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRequest.current));
      setReply(null);
      setMessage('');
      setUrgent(false);
      setRequestState('sent');
    } catch {
      setRequestState('error');
    }
  };

  return (
    <main className="guest-help-page">
      <div className="guest-help-shell">
        <header className="guest-help-top">
          <span className="guest-help-mark" aria-hidden="true">
            <span>N</span>
          </span>
          <p className="guest-help-eyebrow">Noir House · Room Assistance</p>
          <h1>How can we help?</h1>
          <p className="guest-help-lede">
            Tap a question for an instant answer, or send a message straight to Reception.
          </p>
        </header>

        <a className="guest-help-call" href={`tel:${RECEPTION_PHONE}`}>
          <Phone size={17} /> Call Reception now
        </a>

        <section className="guest-faq-list" aria-label="Frequently asked questions">
          {faqs.map((faq) => {
            const Icon = faq.icon;
            const open = openId === faq.id;
            return (
              <div className={`guest-faq-row${open ? ' open' : ''}${faq.urgent ? ' urgent' : ''}`} key={faq.id}>
                <button
                  type="button"
                  className="guest-faq-question"
                  onClick={() => setOpenId(open ? null : faq.id)}
                  aria-expanded={open}
                >
                  <span className="guest-faq-icon">
                    <Icon size={17} />
                  </span>
                  <span className="guest-faq-label">{faq.question}</span>
                  <ChevronDown size={16} className="guest-faq-chevron" />
                </button>
                {open && (
                  <div className="guest-faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="guest-message-card">
          <h2>Still need something?</h2>
          <p>Message Reception directly — usually replies in around 5 minutes.</p>
          <form onSubmit={submit}>
            <label>
              Room number
              <input
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                placeholder="e.g. 214"
                inputMode="numeric"
              />
            </label>
            <label>
              Your message
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ask a question or request something…"
                aria-label="Message to Reception"
              />
            </label>
            <button
              type="button"
              className={`guest-urgent-toggle${urgent ? ' on' : ''}`}
              onClick={() => setUrgent((value) => !value)}
              aria-pressed={urgent}
            >
              <AlertTriangle size={15} /> This is urgent
            </button>
            <button type="submit" disabled={!message.trim() || requestState === 'sending'}>
              {requestState === 'sending' ? 'Sending…' : 'Send to Reception'} <Send size={15} />
            </button>
          </form>
          {requestState === 'error' && (
            <p className="guest-help-error">Couldn&rsquo;t send that — check your connection and try again.</p>
          )}
          {requestState === 'sent' && reply?.reply && (
            <div className="guest-help-reply">
              <strong>Reception replied</strong>
              <p>{reply.reply}</p>
            </div>
          )}
          {requestState === 'sent' && !reply?.reply && (
            <p className="guest-help-sent">
              <ShieldCheck size={15} /> Sent — Reception will reply here shortly.
            </p>
          )}
        </section>

        <footer className="guest-help-foot">
          <ShieldCheck size={13} /> Reception is staffed 24 hours a day
        </footer>
        <p className="guest-help-powered-by">
          Powered by <img src="/logo.png" alt="Freedom Services" />
        </p>
      </div>
    </main>
  );
}
