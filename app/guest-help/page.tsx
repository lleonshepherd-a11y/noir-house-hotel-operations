'use client';

import { FormEvent, useState } from 'react';
import { QrCode, Send, ShieldCheck } from 'lucide-react';

const topics = [
  ['Restaurant hours', 'Dinner is served from 18:00 until 22:30.'],
  ['Bar hours', 'The hotel bar is open from 12:00 until midnight.'],
  ['Chemist nearby', 'Reception can direct you to the nearest open chemist.'],
  ['Wi-Fi', 'Connect to Noir House Guest and enter your surname and room number.'],
  ['Breakfast', 'Breakfast is served from 06:30 until 10:30.'],
  ['Checkout', 'Checkout is at 11:00. Reception can discuss a later departure.'],
  ['Reception', 'Reception is staffed 24 hours a day.'],
  ['Housekeeping', 'Extra towels and room items can be requested here.'],
  ["Warm baby's milk", 'Please contact Reception so the hotel team can assist safely.'],
  ['Taxis', 'The concierge can arrange a licensed taxi for you.'],
  ['Local directions', 'Ask the concierge for walking routes and local recommendations.'],
  ['Emergency help', 'For immediate danger call emergency services, then alert Reception.'],
] as const;

export default function GuestHelpPage() {
  const [selected, setSelected] = useState<(typeof topics)[number] | null>(null);
  const [room, setRoom] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setSent(true);
    setMessage('');
  };

  return (
    <main className="guest-help-page">
      <section className="guest-help-card">
        <header className="guest-preview-heading">
          <span className="guest-qr-mark"><QrCode size={24} /></span>
          <div><small>NOIR HOUSE · IN-ROOM GUEST HELP</small><strong>How can we help?</strong></div>
        </header>
        <p className="guest-welcome">Choose a common question for an instant answer, or send a private request to the hotel team.</p>
        <div className="guest-topic-grid">
          {topics.map((topic) => (
            <button type="button" key={topic[0]} onClick={() => setSelected(topic)}>{topic[0]}</button>
          ))}
        </div>
        {selected && <div className="guest-help-answer"><strong>{selected[0]}</strong><p>{selected[1]}</p></div>}
        <form className="guest-message-form" onSubmit={submit}>
          <label>Room number<input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="e.g. 214" /></label>
          <textarea value={message} onChange={(event) => { setMessage(event.target.value); setSent(false); }} placeholder="Ask another question or request help…" aria-label="Guest request" />
          <div><button type="submit" disabled={!message.trim()}>Send request <Send size={13} /></button></div>
        </form>
        {sent && <p className="guest-help-sent"><ShieldCheck size={14} /> Your request has been sent to the hotel team.</p>}
      </section>
    </main>
  );
}
