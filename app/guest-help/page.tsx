'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronDown,
  Clock,
  Coffee,
  Compass,
  Navigation,
  Send,
  ShieldCheck,
  Shirt,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Wine,
} from 'lucide-react';

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

export default function GuestHelpPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('room');
    if (fromQuery) setRoom(fromQuery);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setSent(true);
    setMessage('');
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
          <p>Message Reception directly and a member of the team will reply.</p>
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
                onChange={(event) => {
                  setMessage(event.target.value);
                  setSent(false);
                }}
                placeholder="Ask a question or request something…"
                aria-label="Message to Reception"
              />
            </label>
            <button type="submit" disabled={!message.trim()}>
              Send to Reception <Send size={15} />
            </button>
          </form>
          {sent && (
            <p className="guest-help-sent">
              <ShieldCheck size={15} /> Sent — Reception will reply shortly.
            </p>
          )}
        </section>

        <footer className="guest-help-foot">
          <ShieldCheck size={13} /> Reception is staffed 24 hours a day
        </footer>
      </div>
    </main>
  );
}
