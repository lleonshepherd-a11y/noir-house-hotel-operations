'use client';

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ChevronDown,
  CloudRain,
  CloudSun,
  ConciergeBell,
  Crown,
  Droplets,
  LayoutDashboard,
  KeyRound,
  ListChecks,
  Martini,
  MessageSquareText,
  Mic,
  NotebookPen,
  Paperclip,
  Pin,
  Plus,
  QrCode,
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

const staffEncouragementMessages: Record<string, { morning: string[]; afternoon: string[]; night: string[] }> = {
  'Front of House': {
    morning: ['Good morning. Wishing you a smooth and successful shift today.'],
    afternoon: [
      'Every guest deserves a warm welcome.',
      'Thank you for making the difference.',
      'Small acts of kindness create memorable guest experiences.',
      'Keep up the great work.',
      'Every interaction matters.',
      'Have a great shift, and thank you for all you do today.',
    ],
    night: [
      'Stay calm, take one guest at a time, and let the rest follow.',
      'A smile, patience, and professionalism never go unnoticed.',
      'You’re part of what makes this hotel a great place to stay.',
      'Thank you for everything you do behind the scenes and at the front desk.',
      'Your calm approach helps every guest feel welcome.',
    ],
  },
};

const defaultStaffEncouragement = {
  morning: ['Good morning. Wishing you a smooth and successful shift today.'],
  afternoon: ['Thank you for making the difference.', 'Keep up the great work.', 'Every interaction matters.'],
  night: ['Stay calm, take one task at a time, and let the rest follow.', 'Thank you for everything you do behind the scenes.'],
};

const commonSpellingCorrections: Record<string, string> = {
  accomodation: 'accommodation',
  adress: 'address',
  availible: 'available',
  brekfast: 'breakfast',
  buisness: 'business',
  calender: 'calendar',
  conciege: 'concierge',
  departmant: 'department',
  maintanance: 'maintenance',
  recieve: 'receive',
  restarant: 'restaurant',
  seperate: 'separate',
  tommorow: 'tomorrow',
  technican: 'technician',
  urgant: 'urgent',
};

type HotelMessage = {
  id: number;
  from: string;
  to: string;
  text: string;
  time: string;
  unread: boolean;
  urgent: boolean;
  seenAt?: string;
  seenBy?: string;
  attachmentUrl?: string;
  attachmentName?: string;
};

const initialMessages: HotelMessage[] = [
  {
    id: 101,
    from: 'General Manager',
    to: 'Kitchen',
    text: "Prepare tomorrow's menu and send it back for approval.",
    time: '19:44',
    unread: false,
    urgent: false,
  },
  {
    id: 1,
    from: 'Front of House',
    to: 'Restaurant',
    text: 'The Carrington party has arrived — 6 guests, table 12.',
    time: '19:42',
    unread: true,
    urgent: false,
  },
  {
    id: 2,
    from: 'Kitchen',
    to: 'Restaurant',
    text: 'Sea bass special: 4 portions remaining for this evening.',
    time: '19:38',
    unread: true,
    urgent: false,
  },
  {
    id: 3,
    from: 'Restaurant',
    to: 'Front of House',
    text: 'Allergy confirmation needed for table 8 before mains.',
    time: '19:35',
    unread: true,
    urgent: true,
  },
  {
    id: 4,
    from: 'Bar',
    to: 'Front of House',
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
  openedAt?: string;
  openedBy?: string;
};

type DepartmentAppointment = {
  id: number;
  department: string;
  title: string;
  startsAt: string;
  reminderMinutes: number;
  category: 'urgent' | 'maintenance' | 'staff' | 'routine';
};

type ShiftHandover = {
  id: number;
  department: string;
  author: string;
  text: string;
  time: string;
  important: boolean;
  complete: boolean;
};

type GuestRequest = {
  id: number;
  room: string;
  text: string;
  time: string;
  urgent: boolean;
  status: 'New' | 'Escalated' | 'Resolved';
  internalAssignment?: string;
  reply?: string;
};

const activeStaffNames: Record<string, string> = {
  'General Manager': 'Alex M.',
  'Front of House': 'Jordan M.',
  Concierge: 'Sam R.',
  Restaurant: 'Ellie T.',
  Kitchen: 'Marco L.',
  Bar: 'Nina P.',
  Housekeeping: 'Priya S.',
  Maintenance: 'Daniel K.',
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
  const [announcementEditorOpen, setAnnouncementEditorOpen] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [announcementExpiry, setAnnouncementExpiry] = useState('');
  const [announcementStatus, setAnnouncementStatus] = useState('');
  const [hotelAnnouncement, setHotelAnnouncement] = useState({
    body: 'Fire drill · Staff car park · Tomorrow at 07:00',
    author: 'Alex Morgan',
    postedAt: '20:04',
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [guestNotificationsOpen, setGuestNotificationsOpen] = useState(false);
  const [shiftNotificationsOpen, setShiftNotificationsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<'notes' | 'guest' | 'security' | 'settings' | null>(null);
  const [gentleSounds, setGentleSounds] = useState(true);
  const [calmMotion, setCalmMotion] = useState(true);
  const [appointmentTitle, setAppointmentTitle] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentReminder, setAppointmentReminder] = useState('15');
  const [appointmentCategory, setAppointmentCategory] = useState<DepartmentAppointment['category']>('routine');
  const [dismissedAppointments, setDismissedAppointments] = useState<number[]>([]);
  const [pinnedNotificationKeys, setPinnedNotificationKeys] = useState<string[]>([]);
  const [dismissedShiftNotificationKeys, setDismissedShiftNotificationKeys] = useState<string[]>([]);
  const notificationSwipeStart = useRef<Record<string, number>>({});
  const [appointments, setAppointments] = useState<DepartmentAppointment[]>(() => {
    const arrival = new Date();
    arrival.setDate(arrival.getDate() + (arrival.getHours() >= 9 ? 1 : 0));
    arrival.setHours(9, 0, 0, 0);
    const dishwasherRepair = new Date(arrival.getFullYear(), arrival.getMonth(), Math.min(12, new Date(arrival.getFullYear(), arrival.getMonth() + 1, 0).getDate()), 10, 30);
    const kitchenStarter = new Date(arrival.getFullYear(), arrival.getMonth(), Math.min(18, new Date(arrival.getFullYear(), arrival.getMonth() + 1, 0).getDate()), 9, 0);
    return [
      {
        id: 901,
        department: 'Front of House',
        title: 'Morning team briefing',
        startsAt: arrival.toISOString(),
        reminderMinutes: 15,
        category: 'staff',
      },
      {
        id: 902,
        department: 'Maintenance',
        title: 'Dishwasher repair',
        startsAt: dishwasherRepair.toISOString(),
        reminderMinutes: 30,
        category: 'maintenance',
      },
      {
        id: 903,
        department: 'Kitchen',
        title: 'New kitchen starter',
        startsAt: kitchenStarter.toISOString(),
        reminderMinutes: 60,
        category: 'staff',
      },
    ];
  });
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported' | 'configuration-required'
  >('default');
  const [urgent, setUrgent] = useState(false);
  const [assignAsTask, setAssignAsTask] = useState(false);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [spellCheckNotice, setSpellCheckNotice] = useState('Spell check on');
  const [taskNote, setTaskNote] = useState('');
  const [taskNoteEdits, setTaskNoteEdits] = useState<Record<number, string>>({});
  const [recipient, setRecipient] = useState('All departments');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [messageError, setMessageError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
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
  const [handoverDraft, setHandoverDraft] = useState('');
  const [handoverImportant, setHandoverImportant] = useState(false);
  const [shiftHandovers, setShiftHandovers] = useState<ShiftHandover[]>([
    {
      id: 801,
      department: 'Front of House',
      author: 'Jordan M.',
      text: 'Astor Suite guest is arriving at 20:15. Champagne service is ready.',
      time: '19:48',
      important: true,
      complete: false,
    },
    {
      id: 802,
      department: 'Front of House',
      author: 'Amelia C.',
      text: 'Morning shift should confirm the airport car for room 214.',
      time: '18:55',
      important: false,
      complete: false,
    },
  ]);
  const [guestRequests, setGuestRequests] = useState<GuestRequest[]>([
    { id: 701, room: '235', text: 'Is there a chemist nearby?', time: '19:46', urgent: false, status: 'New' },
    { id: 702, room: '118', text: 'Water is leaking from the bathroom ceiling.', time: '19:43', urgent: true, status: 'New' },
    { id: 703, room: '307', text: "Where can I warm my baby's milk?", time: '19:40', urgent: false, status: 'New' },
  ]);
  const [guestReplyDrafts, setGuestReplyDrafts] = useState<Record<number, string>>({});
  const [selectedGuestRequestId, setSelectedGuestRequestId] = useState<number | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(null);
  const [selectedPlannerDay, setSelectedPlannerDay] = useState<number | null>(null);
  const [selectedHandoverId, setSelectedHandoverId] = useState<number | null>(null);
  const [replyContext, setReplyContext] = useState<{ id: number; from: string; text: string; time: string } | null>(null);

  const departmentAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.department === activeDepartment)
        .sort(
          (left, right) =>
            new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
    [activeDepartment, appointments],
  );
  const plannerMonth = now ?? new Date();
  const plannerYear = plannerMonth.getFullYear();
  const plannerMonthIndex = plannerMonth.getMonth();
  const plannerMonthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(plannerMonth);
  const plannerDayCount = new Date(plannerYear, plannerMonthIndex + 1, 0).getDate();
  const plannerLeadingDays = (new Date(plannerYear, plannerMonthIndex, 1).getDay() + 6) % 7;
  const plannerCells = Array.from({ length: plannerLeadingDays + plannerDayCount }, (_, index) => {
    if (index < plannerLeadingDays) return null;
    const day = index - plannerLeadingDays + 1;
    const events = departmentAppointments.filter((appointment) => {
      const date = new Date(appointment.startsAt);
      return date.getFullYear() === plannerYear && date.getMonth() === plannerMonthIndex && date.getDate() === day;
    });
    return { day, events };
  });
  const selectedPlannerEvents = selectedPlannerDay
    ? departmentAppointments.filter((appointment) => {
        const date = new Date(appointment.startsAt);
        return date.getFullYear() === plannerYear && date.getMonth() === plannerMonthIndex && date.getDate() === selectedPlannerDay;
      })
    : [];
  const selectedDepartment = departments.find(
    (department) => department.name === activeDepartment,
  ) ?? departments[1];
  const SelectedDepartmentIcon = selectedDepartment.icon;
  const canAccessGuestRequests =
    activeDepartment === 'Front of House' || activeDepartment === 'General Manager';
  useEffect(() => {
    if (!canAccessGuestRequests && utilityPanel === 'guest') setUtilityPanel(null);
  }, [canAccessGuestRequests, utilityPanel]);
  const pendingGuestRequests = guestRequests.filter((request) => request.status === 'New');
  const featuredGuestRequest =
    pendingGuestRequests.find((request) => request.urgent) ?? pendingGuestRequests[0];

  const currentAppointment = useMemo(() => {
    if (!now) return undefined;
    return departmentAppointments.find((appointment) => {
      const startsAt = new Date(appointment.startsAt).getTime();
      const reminderStarts = startsAt - appointment.reminderMinutes * 60 * 1000;
      const elapsed = now.getTime() - startsAt;
      return now.getTime() >= reminderStarts && elapsed <= 15 * 60 * 1000 && !dismissedAppointments.includes(appointment.id);
    });
  }, [departmentAppointments, dismissedAppointments, now]);

  const spellingSuggestions = useMemo(() => {
    if (!spellCheckEnabled || !draft.trim()) return [];
    const words = draft.toLowerCase().match(/[a-z']+/g) ?? [];
    return Array.from(new Set(words))
      .filter((word) => Boolean(commonSpellingCorrections[word]))
      .map((word) => ({ word, correction: commonSpellingCorrections[word] }));
  }, [draft, spellCheckEnabled]);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordingSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);

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
  const attentionItems = useMemo(() => {
    const urgentMessages = messages
      .filter(
        (message) =>
          message.to === activeDepartment && message.urgent && !message.seenAt,
      )
      .map((message) => ({
        id: `message-${message.id}`,
        kind: 'urgent' as const,
        title: message.text,
        meta: `${message.from} · ${message.time}`,
        messageId: message.id,
      }));
    const unacknowledgedTasks = assignedTasks
      .filter(
        (task) => task.to === activeDepartment && task.status === 'Sent',
      )
      .map((task) => ({
        id: `task-${task.id}`,
        kind: 'unacknowledged' as const,
        title: task.title,
        meta: `${task.from} · awaiting acknowledgement`,
        messageId: task.id,
      }));
    const overdueCalendarItems = !now
      ? []
      : departmentAppointments
          .filter(
            (appointment) =>
              new Date(appointment.startsAt).getTime() < now.getTime() &&
              !dismissedAppointments.includes(appointment.id),
          )
          .map((appointment) => ({
            id: `calendar-${appointment.id}`,
            kind: 'overdue' as const,
            title: appointment.title,
            meta: 'Calendar entry · overdue',
            messageId: undefined,
          }));

    return [...urgentMessages, ...unacknowledgedTasks, ...overdueCalendarItems].slice(0, 4);
  }, [activeDepartment, assignedTasks, departmentAppointments, dismissedAppointments, messages, now]);

  const markNotificationSeen = (messageId: number) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, unread: false } : message,
      ),
    );
  };

  const toggleNotificationPin = (key: string) => {
    setPinnedNotificationKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [key, ...current],
    );
  };

  const beginNotificationSwipe = (key: string, event: ReactPointerEvent<HTMLElement>) => {
    notificationSwipeStart.current[key] = event.clientX;
  };

  const finishNotificationSwipe = (
    key: string,
    event: ReactPointerEvent<HTMLElement>,
    dismiss: () => void,
  ) => {
    const start = notificationSwipeStart.current[key];
    delete notificationSwipeStart.current[key];
    if (typeof start === 'number' && start - event.clientX > 56) dismiss();
  };

  const openInternalNotification = (message: { id: number; from: string; text: string; time: string }) => {
    setReplyContext(message);
    setRecipient(message.from);
    setDraft('');
    setNotificationsOpen(false);
    setComposerOpen(true);
    markNotificationSeen(message.id);
  };

  const openGuestNotification = (requestId: number) => {
    setSelectedGuestRequestId(requestId);
    setGuestNotificationsOpen(false);
    setUtilityPanel('guest');
    setCalendarOpen(false);
    setComposerOpen(false);
    window.setTimeout(() => {
      document.getElementById(`guest-request-${requestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const addShiftHandover = (event: FormEvent) => {
    event.preventDefault();
    const text = handoverDraft.trim();
    if (!text) return;
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    setShiftHandovers((current) => [
      {
        id: Date.now(),
        department: activeDepartment,
        author: activeStaffNames[activeDepartment] ?? activeDepartment,
        text,
        time,
        important: handoverImportant,
        complete: false,
      },
      ...current,
    ]);
    setHandoverDraft('');
    setHandoverImportant(false);
  };

  const markMessageOpened = (messageId: number) => {
    const seenAt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.to === activeDepartment
          ? {
              ...message,
              unread: false,
              seenAt,
              seenBy: activeDepartment,
            }
          : message,
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
  const encouragementHour = now?.getHours() ?? 9;
  const encouragementMinuteOfDay = now ? now.getHours() * 60 + now.getMinutes() : 8 * 60;
  const isStaffMorningGreeting = encouragementMinuteOfDay >= 7 * 60 + 30 && encouragementMinuteOfDay < 9 * 60 + 30;
  const encouragementPeriod = isStaffMorningGreeting
    ? 'morning'
    : encouragementMinuteOfDay < 7 * 60 + 30 || encouragementMinuteOfDay >= 18 * 60
      ? 'night'
      : 'afternoon';
  const encouragementSet = staffEncouragementMessages[activeDepartment] ?? defaultStaffEncouragement;
  const encouragementOptions = encouragementSet[encouragementPeriod];
  const encouragementSlot = now
    ? Math.floor(now.getTime() / 86_400_000) * 12 +
      Math.max(0, Math.floor((encouragementMinuteOfDay - (9 * 60 + 30)) / 120))
    : 0;
  const staffEncouragement = encouragementOptions[encouragementSlot % encouragementOptions.length];

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
      from: activeDepartment,
      to: recipient,
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
    if (gentleSounds) playPing(urgent);
    setDraft('');
    setAttachment('');
    setAttachmentPreview('');
    setMessageError('');
    setUrgent(false);
    setAssignAsTask(false);
    setTaskNote('');
    setReplyContext(null);
    setComposerOpen(false);
  };

  const addAppointment = (event: FormEvent) => {
    event.preventDefault();
    if (!appointmentTitle.trim() || !appointmentTime) return;
    setAppointments((current) => [
      ...current,
      {
        id: Date.now(),
        department: activeDepartment,
        title: appointmentTitle.trim(),
        startsAt: new Date(appointmentTime).toISOString(),
        reminderMinutes: Number(appointmentReminder),
        category: appointmentCategory,
      },
    ]);
    setAppointmentTitle('');
    setAppointmentTime('');
    setAppointmentReminder('15');
    setAppointmentCategory('routine');
  };

  const applySpellingCorrection = (word: string, correction: string) => {
    setDraft((current) =>
      current.replace(new RegExp(`\\b${word}\\b`, 'gi'), (match) =>
        match[0] === match[0]?.toUpperCase()
          ? correction[0].toUpperCase() + correction.slice(1)
          : correction,
      ),
    );
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

  const markTaskOpened = (taskId: number) => {
    const openedAt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    setAssignedTasks((current) =>
      current.map((task) =>
        task.id === taskId && task.to === activeDepartment && !task.openedAt
          ? { ...task, openedAt, openedBy: activeDepartment }
          : task,
      ),
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
    if (gentleSounds) playPing(false);
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
      setRecordingSeconds(0);
      setRecording(true);
    } catch {
      setMessageError('Microphone access is needed to record a voice note.');
    }
  };

  const answeredGuestRequestCount = guestRequests.filter((request) => request.status === 'Resolved' || Boolean(request.reply)).length;
  const openTaskCount = assignedTasks.filter((task) => task.to === activeDepartment && task.status !== 'Complete').length;
  const outstandingHandoverCount = shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length;
  const todayAllClear = guestRequests.every((request) => request.status !== 'New') && openTaskCount === 0 && outstandingHandoverCount === 0;

  const publishAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    const body = announcementDraft.trim();
    if (!body) return;
    const postedAt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    setHotelAnnouncement({ body, author: activeStaffNames['General Manager'] ?? 'General Manager', postedAt });
    setAnnouncementAcknowledged(false);
    setAnnouncementStatus('Announcement published across every department dashboard.');
    setAnnouncementEditorOpen(false);
    const token = window.sessionStorage.getItem('hotel_staff_session');
    if (!token) return;
    try {
      const response = await fetch('/api/operations/announcements', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ body, expiresAt: announcementExpiry || null }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setAnnouncementStatus('Preview updated. The permanent announcement will sync after staff sign-in is connected.');
    }
  };

  return (
    <main className={`hotel-shell ${calmMotion ? '' : 'calm-motion-off'}`}>
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
                if (gentleSounds) playPing(false);
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
          <button
            className={`nav-button ${!calendarOpen && !utilityPanel ? 'active' : ''}`}
            aria-label="Dashboard"
            title="Dashboard"
            onClick={() => {
              setCalendarOpen(false);
              setUtilityPanel(null);
              setComposerOpen(false);
            }}
          >
            <LayoutDashboard size={20} />
          </button>
          <button
            className="nav-button"
            aria-label="Messages"
            title="Messages"
            onClick={() => {
              setComposerOpen(true);
              setCalendarOpen(false);
              setUtilityPanel(null);
            }}
          >
            <MessageSquareText size={20} />
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-button ${utilityPanel === 'notes' ? 'active' : ''}`}
            aria-label="Department notes"
            title="Department notes"
            onClick={() => {
              setUtilityPanel((panel) => (panel === 'notes' ? null : 'notes'));
              setCalendarOpen(false);
            }}
          >
            <NotebookPen size={20} />
          </button>
          {canAccessGuestRequests && <button
            className={`nav-button guest-nav-button ${utilityPanel === 'guest' ? 'active' : ''} ${canAccessGuestRequests ? '' : 'restricted'} ${pendingGuestRequests.some((request) => request.urgent) ? 'guest-urgent' : ''}`}
            aria-label={canAccessGuestRequests ? 'Guest requests' : 'Guest requests — restricted to Reception, Front of House and Duty Manager'}
            title={canAccessGuestRequests ? 'Guest requests' : 'Guest requests — restricted'}
            onClick={() => {
              setUtilityPanel((panel) => (panel === 'guest' ? null : 'guest'));
              setCalendarOpen(false);
              setComposerOpen(false);
            }}
          >
            <ConciergeBell size={20} />
            {canAccessGuestRequests && guestRequests.filter((request) => request.status === 'New').length > 0 && (
              <span className="guest-nav-count">
                {guestRequests.filter((request) => request.status === 'New').length}
              </span>
            )}
          </button>}
          <button
            className={`nav-button ${calendarOpen ? 'active' : ''}`}
            aria-label={`${activeDepartment} calendar`}
            title={`${activeDepartment} calendar`}
            onClick={() => {
              setCalendarOpen((open) => !open);
              setUtilityPanel(null);
            }}
          >
            <CalendarDays size={20} />
            {departmentAppointments.length > 0 && <span className="calendar-nav-dot">{departmentAppointments.length}</span>}
          </button>
          <button
            className={`nav-button ${utilityPanel === 'security' ? 'active' : ''}`}
            aria-label="Accountability and security"
            title="Accountability and security"
            onClick={() => {
              setUtilityPanel((panel) => (panel === 'security' ? null : 'security'));
              setCalendarOpen(false);
            }}
          >
            <ShieldCheck size={20} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-button ${utilityPanel === 'settings' ? 'active' : ''}`}
            aria-label="Settings"
            title="Settings"
            onClick={() => {
              setUtilityPanel((panel) => (panel === 'settings' ? null : 'settings'));
              setCalendarOpen(false);
            }}
          >
            <Settings size={19} />
          </button>
          <div className="profile-avatar" aria-label="Current shift profile EM" title="Current shift profile">EM</div>
        </div>
      </aside>

      {utilityPanel && (
        <section
          className={`utility-panel glass-panel ${utilityPanel === 'guest' ? 'guest-requests-panel' : ''}`}
          aria-label={`${utilityPanel} panel`}
          tabIndex={utilityPanel === 'guest' ? 0 : undefined}
          onKeyDown={(event) => {
            if (utilityPanel !== 'guest' || event.target !== event.currentTarget) return;
            if (event.key === 'PageDown' || event.key === 'ArrowDown') {
              event.preventDefault();
              event.currentTarget.scrollBy({ top: event.key === 'PageDown' ? 320 : 48, behavior: 'smooth' });
            } else if (event.key === 'PageUp' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.currentTarget.scrollBy({ top: event.key === 'PageUp' ? -320 : -48, behavior: 'smooth' });
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              event.currentTarget.scrollTo({ top: event.key === 'Home' ? 0 : event.currentTarget.scrollHeight, behavior: 'smooth' });
            }
          }}
        >
          <div className="calendar-heading">
            <div>
              <span>{utilityPanel === 'notes' ? 'Department workspace' : utilityPanel === 'guest' ? 'Separate guest channel' : utilityPanel === 'security' ? 'Accountability' : 'Dashboard'}</span>
              <strong>{utilityPanel === 'notes' ? `${activeDepartment} notes` : utilityPanel === 'guest' ? 'Guest requests' : utilityPanel === 'security' ? 'Security & audit' : 'Settings'}</strong>
            </div>
            <button onClick={() => setUtilityPanel(null)} aria-label={`Close ${utilityPanel}`}><X size={17} /></button>
          </div>
          {utilityPanel === 'notes' && (
            <>
              <form className="utility-note-form" onSubmit={pinNote}>
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder={`Write a note for ${activeDepartment}…`} />
                <button type="submit" disabled={!noteDraft.trim()}><Pin size={14} /> Save note</button>
              </form>
              <div className="utility-note-list">
                {pinnedNotes.filter((note) => note.department === activeDepartment).map((note) => (
                  <article key={note.id}><Pin size={12} /><span>{note.text}</span></article>
                ))}
              </div>
            </>
          )}
          {utilityPanel === 'guest' && (
            canAccessGuestRequests ? <div className="guest-requests-layout staff-only">
              <section className="guest-queue" aria-label="Guest request queue">
                <div className="guest-queue-heading">
                  <div><span>STAFF VIEW</span><strong>Guest request queue</strong></div>
                  <div className="guest-queue-heading-actions">
                    <span>{guestRequests.filter((request) => request.status !== 'Resolved').length} open</span>
                    <a href="/guest-help" target="_blank" rel="noreferrer"><QrCode size={12} /> Guest QR page</a>
                  </div>
                </div>
                {guestRequests.map((request) => (
                  <article id={`guest-request-${request.id}`} className={`${request.urgent ? 'urgent' : ''} ${selectedGuestRequestId === request.id ? 'selected' : ''} status-${request.status.toLowerCase()}`} key={request.id}>
                    <span className="guest-request-room">{request.room === 'Guest' ? 'Guest' : `Room ${request.room}`}</span>
                    <strong>{request.text}</strong>
                    <small>{request.time} · {request.status}</small>
                    <div>
                      {request.urgent && request.status === 'New' && (
                        <button onClick={() => setGuestRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'Escalated' } : item))}>
                          Escalate to Reception / duty manager
                        </button>
                      )}
                      {request.status !== 'Resolved' && (
                        <button onClick={() => setGuestRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'Resolved' } : item))}>
                          Resolve
                        </button>
                      )}
                      {request.status !== 'Resolved' && !request.internalAssignment && (
                        <button onClick={() => setGuestRequests((current) => current.map((item) => item.id === request.id ? { ...item, internalAssignment: 'Kitchen' } : item))}>
                          Ask Kitchen internally
                        </button>
                      )}
                    </div>
                    {request.internalAssignment && (
                      <p className="guest-internal-assignment"><ChefHat size={12} /> Internal input requested from {request.internalAssignment}; guest conversation remains private.</p>
                    )}
                    {request.status !== 'Resolved' && (
                      <div className="guest-reply-row">
                        <input
                          value={guestReplyDrafts[request.id] ?? ''}
                          onChange={(event) => setGuestReplyDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Reply to guest…"
                          aria-label={`Reply to ${request.room}`}
                        />
                        <button
                          disabled={!(guestReplyDrafts[request.id] ?? '').trim()}
                          onClick={() => {
                            const reply = (guestReplyDrafts[request.id] ?? '').trim();
                            if (!reply) return;
                            setGuestRequests((current) => current.map((item) => item.id === request.id ? { ...item, reply } : item));
                            setGuestReplyDrafts((current) => ({ ...current, [request.id]: '' }));
                          }}
                        >
                          Send reply
                        </button>
                      </div>
                    )}
                    {request.reply && <p className="guest-sent-reply"><ShieldCheck size={12} /> Reply sent: “{request.reply}”</p>}
                  </article>
                ))}
                <p className="guest-channel-note"><ShieldCheck size={13} /> Guest requests remain separate from internal department chat.</p>
              </section>
            </div> : <div className="guest-access-denied">
              <span><KeyRound size={20} /></span>
              <strong>Guest conversations are restricted</strong>
              <p>Only Reception, Front of House and the Duty Manager can open guest requests or send replies.</p>
              <small>{activeDepartment} can receive a separate internal task when guest-facing staff need operational input.</small>
            </div>
          )}
          {utilityPanel === 'security' && (
            <div className="security-summary">
              <article><ShieldCheck size={17} /><div><strong>Accountable activity</strong><span>Message and task opening times remain visible in their conversations.</span></div></article>
              <article><KeyRound size={17} /><div><strong>PIN only when required</strong><span>The shared console stays active; a staff PIN is reserved for privileged actions.</span></div></article>
              <article><ListChecks size={17} /><div><strong>No silent deletion</strong><span>Production records will be archived with a named audit event.</span></div></article>
            </div>
          )}
          {utilityPanel === 'settings' && (
            <div className="settings-list">
              <label><span><strong>Gentle notification sounds</strong><small>One ping for normal messages</small></span><input type="checkbox" checked={gentleSounds} onChange={(event) => setGentleSounds(event.target.checked)} /></label>
              <label><span><strong>Calm interface motion</strong><small>Subtle visual movement and reminders</small></span><input type="checkbox" checked={calmMotion} onChange={(event) => setCalmMotion(event.target.checked)} /></label>
            </div>
          )}
        </section>
      )}

      {currentAppointment && (
        <section className="calendar-reminder" aria-live="polite" aria-label="Calendar reminder">
          <div className="calendar-reminder-icon">
            <CalendarClock size={18} />
          </div>
          <div>
            <span>Calendar · {activeDepartment}</span>
            <strong>{currentAppointment.title}</strong>
            <small>
              {new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date(currentAppointment.startsAt))}
              {now && new Date(currentAppointment.startsAt).getTime() > now.getTime()
                ? ` · In ${Math.max(1, Math.ceil((new Date(currentAppointment.startsAt).getTime() - now.getTime()) / 60000))} min`
                : ' · Due now'}
            </small>
          </div>
          <button
            type="button"
            onClick={() =>
              setDismissedAppointments((current) => [...current, currentAppointment.id])
            }
          >
            Seen
          </button>
        </section>
      )}

      {calendarOpen && (
        <section className="department-calendar glass-panel" aria-label={`${activeDepartment} calendar panel`}>
          <div className="calendar-heading">
            <div>
              <span>Department calendar</span>
              <strong>{activeDepartment}</strong>
            </div>
            <button type="button" onClick={() => setCalendarOpen(false)} aria-label="Close calendar">
              <X size={17} />
            </button>
          </div>
          <form onSubmit={addAppointment}>
            <label>
              Calendar entry
              <input
                value={appointmentTitle}
                onChange={(event) => setAppointmentTitle(event.target.value)}
                placeholder="Write what is happening…"
              />
            </label>
            <label>
              Date and time
              <input
                type="datetime-local"
                value={appointmentTime}
                onChange={(event) => setAppointmentTime(event.target.value)}
              />
            </label>
            <label>
              Remind me
              <select
                value={appointmentReminder}
                onChange={(event) => setAppointmentReminder(event.target.value)}
              >
                <option value="5">5 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
              </select>
            </label>
            <label>
              Ops Planner pin
              <select value={appointmentCategory} onChange={(event) => setAppointmentCategory(event.target.value as DepartmentAppointment['category'])}>
                <option value="routine">Green · Routine</option>
                <option value="maintenance">Amber · Maintenance / priority</option>
                <option value="staff">Blue · Staff / shift / admin</option>
                <option value="urgent">Red · Needs attention</option>
              </select>
            </label>
            <button type="submit" disabled={!appointmentTitle.trim() || !appointmentTime}>
              <Plus size={15} /> Add to {activeDepartment}
            </button>
          </form>
          <div className="calendar-list">
            <span>Upcoming</span>
            {departmentAppointments.length === 0 ? (
              <p>No appointments recorded for this department.</p>
            ) : (
              departmentAppointments.slice(0, 5).map((appointment) => (
                <article id={`calendar-entry-${appointment.id}`} className={selectedCalendarId === appointment.id ? 'selected' : ''} key={appointment.id}>
                  <time dateTime={appointment.startsAt}>
                    {new Intl.DateTimeFormat('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    }).format(new Date(appointment.startsAt))}
                  </time>
                  <strong>{appointment.title}</strong>
                  <small>{appointment.department} only</small>
                  <small>{appointment.reminderMinutes} min reminder</small>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      <section className="workspace">
        <header className="topbar glass-panel">
          <div className="property-heading">
            <p>NOIR HOUSE · LONDON</p>
            <div className="department-greeting">
              <span>Good evening,</span>
              <details className="department-switcher">
                <summary
                  className="department-switcher-trigger"
                  aria-label="Active department"
                >
                  <SelectedDepartmentIcon size={14} />
                  <span>{selectedDepartment.name}</span>
                  <ChevronDown size={12} />
                </summary>
                <div className="department-switcher-menu" role="menu">
                    {departments.map((department) => {
                      const DepartmentIcon = department.icon;
                      return (
                        <button
                          type="button"
                          role="menuitem"
                          className={department.name === activeDepartment ? 'selected' : ''}
                          key={department.name}
                          onClick={(event) => {
                            setActiveDepartment(department.name);
                            event.currentTarget
                              .closest('details')
                              ?.removeAttribute('open');
                          }}
                        >
                          <DepartmentIcon size={14} style={{ color: department.accent }} />
                          <span>{department.name}</span>
                        </button>
                      );
                    })}
                </div>
              </details>
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
              <p className="staff-encouragement" key={`${activeDepartment}-${encouragementSlot}`}>
                {staffEncouragement}
              </p>
            </div>
          </div>
          <div className="top-actions">
            <span className="console-active" aria-label="Shared console active">
              <i /> Console active
            </span>
            <button className="icon-button search-action" aria-label="Search">
              <Search size={18} />
            </button>
            <div className="notification-wrap top-notification guest-top-notification">
              <button
                key={pendingGuestRequests.map((request) => request.id).join('-') || 'no-guest-alerts'}
                className={`icon-button ${pendingGuestRequests.length ? 'has-alert' : ''} ${pendingGuestRequests.some((request) => request.urgent) ? 'guest-urgent' : ''}`}
                aria-label={`${pendingGuestRequests.length} new guest requests`}
                onClick={() => {
                  if (!canAccessGuestRequests) {
                    setUtilityPanel('guest');
                    return;
                  }
                  setGuestNotificationsOpen((open) => !open);
                  setNotificationsOpen(false);
                  setShiftNotificationsOpen(false);
                }}
              >
                <ConciergeBell size={18} />
                {pendingGuestRequests.length > 0 && canAccessGuestRequests && (
                  <span className={`guest-alert-count ${pendingGuestRequests.some((request) => request.urgent) ? 'urgent' : ''}`}>
                    {pendingGuestRequests.length}
                  </span>
                )}
              </button>
              {guestNotificationsOpen && canAccessGuestRequests && (
                <div className="notification-popover guest-notification-popover glass-panel">
                  <div className="popover-heading">
                    <div><span>Guest Requests</span><strong>{pendingGuestRequests.length} new</strong></div>
                    <button onClick={() => setGuestNotificationsOpen(false)}><X size={16} /></button>
                  </div>
                  {[...pendingGuestRequests]
                    .sort((a, b) => Number(pinnedNotificationKeys.includes(`guest-${b.id}`)) - Number(pinnedNotificationKeys.includes(`guest-${a.id}`)))
                    .map((request) => {
                    const notificationKey = `guest-${request.id}`;
                    const isPinned = pinnedNotificationKeys.includes(notificationKey);
                    return (
                    <article
                      className={`guest-notification-row swipe-notification ${request.urgent ? 'urgent' : ''} ${isPinned ? 'pinned' : ''}`}
                      key={request.id}
                      onPointerDown={(event) => beginNotificationSwipe(notificationKey, event)}
                      onPointerUp={(event) => finishNotificationSwipe(notificationKey, event, () => setGuestRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'Resolved' } : item)))}
                    >
                      <ConciergeBell size={15} />
                      <button className="guest-notification-copy" onClick={() => openGuestNotification(request.id)}>
                        <strong>{request.room === 'Guest' ? 'Guest' : `Room ${request.room}`}</strong><small>{request.text}</small>
                      </button>
                      <time>{request.time}</time>
                      <span className="guest-notification-actions">
                        <button
                          aria-label={isPinned ? 'Unpin guest request notification' : 'Pin guest request notification'}
                          aria-pressed={isPinned}
                          onClick={() => {
                            toggleNotificationPin(notificationKey);
                            if (!isPinned) setPinnedNotes((current) => [{ id: Date.now(), text: `Guest request · ${request.room === 'Guest' ? 'Guest' : `Room ${request.room}`} · ${request.text}`, urgent: request.urgent, department: activeDepartment }, ...current]);
                          }}
                        ><Pin size={13} /><span>{isPinned ? 'Pinned' : 'Pin'}</span></button>
                        <button
                          aria-label="Clear guest request notification; it can also be swiped away"
                          onClick={() => setGuestRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'Resolved' } : item))}
                        ><span>Clear</span></button>
                      </span>
                    </article>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="notification-wrap">
              <button
                className={`icon-button ${unreadCount ? 'has-alert' : ''}`}
                aria-label={`${unreadCount} unread internal messages`}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setGuestNotificationsOpen(false);
                  setShiftNotificationsOpen(false);
                }}
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
                      <span>Internal Messages</span>
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
                  {[...seenNotifications]
                    .sort((a, b) => Number(pinnedNotificationKeys.includes(`internal-${b.id}`)) - Number(pinnedNotificationKeys.includes(`internal-${a.id}`)))
                    .map((message) => (
                      <article
                        key={message.id}
                        className={`notification-item swipe-notification ${message.urgent ? 'urgent' : ''} ${pinnedNotificationKeys.includes(`internal-${message.id}`) ? 'pinned' : ''}`}
                        onPointerDown={(event) => beginNotificationSwipe(`internal-${message.id}`, event)}
                        onPointerUp={(event) => finishNotificationSwipe(`internal-${message.id}`, event, () => setMessages((current) => current.filter((item) => item.id !== message.id)))}
                      >
                        <span className="notification-symbol">
                          {message.urgent ? (
                            <Zap size={15} />
                          ) : (
                            <BellRing size={15} />
                          )}
                        </span>
                        <button className="notification-copy notification-open-action" onClick={() => openInternalNotification(message)}>
                          <strong>{message.from}</strong>
                          <small>{message.text}</small>
                        </button>
                        <span className="notification-actions">
                          <button
                            aria-label={pinnedNotificationKeys.includes(`internal-${message.id}`) ? 'Unpin internal message notification' : 'Pin internal message notification'}
                            aria-pressed={pinnedNotificationKeys.includes(`internal-${message.id}`)}
                            onClick={() => {
                              const key = `internal-${message.id}`;
                              const isPinned = pinnedNotificationKeys.includes(key);
                              toggleNotificationPin(key);
                              if (!isPinned) setPinnedNotes((current) => [{ id: Date.now(), text: `${message.from} · ${message.text}`, urgent: message.urgent, department: activeDepartment }, ...current]);
                              if (gentleSounds) playPing(false);
                            }}
                          >
                            <Pin size={13} /><span>{pinnedNotificationKeys.includes(`internal-${message.id}`) ? 'Pinned' : 'Pin'}</span>
                          </button>
                          <button
                            aria-label="Clear internal message notification; it can also be swiped away"
                            onClick={() =>
                              setMessages((current) =>
                                current.filter(
                                  (item) => item.id !== message.id,
                                ),
                              )
                            }
                          >
                            <span>Clear</span>
                          </button>
                        </span>
                      </article>
                    ))}
                </div>
              )}
            </div>
            <div className="notification-wrap top-notification shift-top-notification">
              <button
                className="icon-button"
                aria-label={`${departmentAppointments.length} calendar entries and ${shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length} outstanding handovers`}
                onClick={() => {
                  setShiftNotificationsOpen((open) => !open);
                  setNotificationsOpen(false);
                  setGuestNotificationsOpen(false);
                }}
              >
                <CalendarDays size={18} />
                {(departmentAppointments.length + shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length) > 0 && (
                  <span className="shift-alert-count">
                    {departmentAppointments.length + shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length}
                  </span>
                )}
              </button>
              {shiftNotificationsOpen && (
                <div className="notification-popover shift-notification-popover glass-panel">
                  <div className="popover-heading">
                    <div><span>Calendar / Shift</span><strong>{activeDepartment}</strong></div>
                    <button onClick={() => setShiftNotificationsOpen(false)}><X size={16} /></button>
                  </div>
                  <div className="shift-notification-group">
                    <strong>UPCOMING CALENDAR</strong>
                    {departmentAppointments
                      .filter((appointment) => !dismissedShiftNotificationKeys.includes(`calendar-${appointment.id}`))
                      .sort((a, b) => Number(pinnedNotificationKeys.includes(`calendar-${b.id}`)) - Number(pinnedNotificationKeys.includes(`calendar-${a.id}`)))
                      .slice(0, 3)
                      .map((appointment) => {
                        const notificationKey = `calendar-${appointment.id}`;
                        const isPinned = pinnedNotificationKeys.includes(notificationKey);
                        return (
                          <article
                            className={`shift-notification-row swipe-notification ${isPinned ? 'pinned' : ''}`}
                            key={appointment.id}
                            onPointerDown={(event) => beginNotificationSwipe(notificationKey, event)}
                            onPointerUp={(event) => finishNotificationSwipe(notificationKey, event, () => setDismissedShiftNotificationKeys((current) => [...current, notificationKey]))}
                          >
                            <button className="shift-notification-copy" onClick={() => {
                              setSelectedCalendarId(appointment.id);
                              setShiftNotificationsOpen(false);
                              setCalendarOpen(true);
                              window.setTimeout(() => document.getElementById(`calendar-entry-${appointment.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
                            }}>
                              <CalendarClock size={14} /><span>{appointment.title}</span>
                            </button>
                            <span className="notification-actions compact-actions">
                              <button aria-label={isPinned ? 'Unpin calendar notification' : 'Pin calendar notification'} aria-pressed={isPinned} onClick={() => toggleNotificationPin(notificationKey)}><Pin size={12} /><span>{isPinned ? 'Pinned' : 'Pin'}</span></button>
                              <button aria-label="Clear calendar notification; it can also be swiped away" onClick={() => setDismissedShiftNotificationKeys((current) => [...current, notificationKey])}><span>Clear</span></button>
                            </span>
                          </article>
                        );
                      })}
                    {departmentAppointments.length === 0 && <small>No upcoming entries</small>}
                  </div>
                  <div className="shift-notification-group">
                    <strong>OUTSTANDING HANDOVER</strong>
                    {shiftHandovers
                      .filter((item) => item.department === activeDepartment && !item.complete && !dismissedShiftNotificationKeys.includes(`handover-${item.id}`))
                      .sort((a, b) => Number(pinnedNotificationKeys.includes(`handover-${b.id}`)) - Number(pinnedNotificationKeys.includes(`handover-${a.id}`)))
                      .slice(0, 3)
                      .map((item) => {
                        const notificationKey = `handover-${item.id}`;
                        const isPinned = pinnedNotificationKeys.includes(notificationKey);
                        return (
                          <article
                            className={`shift-notification-row swipe-notification ${isPinned ? 'pinned' : ''}`}
                            key={item.id}
                            onPointerDown={(event) => beginNotificationSwipe(notificationKey, event)}
                            onPointerUp={(event) => finishNotificationSwipe(notificationKey, event, () => setDismissedShiftNotificationKeys((current) => [...current, notificationKey]))}
                          >
                            <button className="shift-notification-copy" onClick={() => {
                              setSelectedHandoverId(item.id);
                              setShiftNotificationsOpen(false);
                              window.setTimeout(() => document.getElementById(`handover-entry-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
                            }}>
                              <NotebookPen size={14} /><span>{item.text}</span>
                            </button>
                            <span className="notification-actions compact-actions">
                              <button aria-label={isPinned ? 'Unpin handover notification' : 'Pin handover notification'} aria-pressed={isPinned} onClick={() => toggleNotificationPin(notificationKey)}><Pin size={12} /><span>{isPinned ? 'Pinned' : 'Pin'}</span></button>
                              <button aria-label="Clear handover notification; it can also be swiped away" onClick={() => setDismissedShiftNotificationKeys((current) => [...current, notificationKey])}><span>Clear</span></button>
                            </span>
                          </article>
                        );
                      })}
                    {shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length === 0 && <small>All handed over</small>}
                  </div>
                </div>
              )}
            </div>
            <button
              className="compose-button"
              onClick={() => {
                setReplyContext(null);
                setComposerOpen((open) => !open);
              }}
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
              <strong>{hotelAnnouncement.body}</strong>
              <small>Posted by {hotelAnnouncement.author} · {hotelAnnouncement.postedAt}</small>
            </div>
            <div className="announcement-controls">
              {activeDepartment === 'General Manager' && (
                <button className="announcement-manage" onClick={() => setAnnouncementEditorOpen((open) => !open)}>
                  <Plus size={13} /> Manage
                </button>
              )}
              <button
                className={announcementAcknowledged ? 'acknowledged' : ''}
                onClick={() => setAnnouncementAcknowledged(true)}
              >
                {announcementAcknowledged ? 'Acknowledged' : 'Acknowledge'}
              </button>
            </div>
            {activeDepartment === 'General Manager' && announcementEditorOpen && (
              <form className="announcement-editor" onSubmit={publishAnnouncement}>
                <label>
                  Hotel-wide announcement
                  <textarea value={announcementDraft} onChange={(event) => setAnnouncementDraft(event.target.value)} placeholder="Write the notice every department must see…" autoFocus />
                </label>
                <label>
                  Remove automatically (optional)
                  <input type="datetime-local" value={announcementExpiry} onChange={(event) => setAnnouncementExpiry(event.target.value)} />
                </label>
                <div>
                  <button type="button" onClick={() => setAnnouncementEditorOpen(false)}>Cancel</button>
                  <button type="submit" disabled={!announcementDraft.trim()}>Publish to all dashboards</button>
                </div>
              </form>
            )}
            {activeDepartment === 'General Manager' && announcementStatus && <small className="announcement-status">{announcementStatus}</small>}
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
          {canAccessGuestRequests && featuredGuestRequest && (
            <section className={`guest-request-alert glass-panel ${featuredGuestRequest.urgent ? 'urgent' : ''}`} aria-live={featuredGuestRequest.urgent ? 'assertive' : 'polite'}>
              <span className="guest-request-alert-icon"><ConciergeBell size={17} /></span>
              <div>
                <span>{featuredGuestRequest.urgent ? 'URGENT GUEST REQUEST' : 'GUEST REQUEST · HUMAN REPLY NEEDED'}</span>
                <strong>{featuredGuestRequest.room === 'Guest' ? 'Guest' : `Room ${featuredGuestRequest.room}`} · {featuredGuestRequest.text}</strong>
                <small>{featuredGuestRequest.time} · Separate from internal messages</small>
              </div>
              <button onClick={() => {
                setUtilityPanel('guest');
                setCalendarOpen(false);
                setComposerOpen(false);
              }}>
                Open guest requests
              </button>
            </section>
          )}
          <section className="shift-handover glass-panel" aria-labelledby="shift-handover-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Next shift</span>
                <h2 id="shift-handover-title">Shift handover</h2>
              </div>
              <span className="handover-count">
                {shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length} outstanding
              </span>
            </div>
            <form className="handover-form" onSubmit={addShiftHandover}>
              <textarea
                value={handoverDraft}
                onChange={(event) => setHandoverDraft(event.target.value)}
                placeholder={`Leave a clear note for the next ${activeDepartment} shift…`}
                aria-label="New shift handover note"
              />
              <div>
                <button
                  type="button"
                  className={handoverImportant ? 'active' : ''}
                  onClick={() => setHandoverImportant((value) => !value)}
                  aria-pressed={handoverImportant}
                >
                  <Zap size={13} /> Important
                </button>
                <button type="submit" disabled={!handoverDraft.trim()}>
                  Add handover <Send size={13} />
                </button>
              </div>
            </form>
            <div className="handover-list">
              {shiftHandovers
                .filter((item) => item.department === activeDepartment)
                .slice(0, 4)
                .map((item) => (
                  <article
                    id={`handover-entry-${item.id}`}
                    className={`${item.important ? 'important' : ''} ${item.complete ? 'complete' : ''} ${selectedHandoverId === item.id ? 'selected' : ''}`}
                    key={item.id}
                  >
                    <span className="handover-status">
                      {item.complete ? <ShieldCheck size={14} /> : item.important ? <Zap size={14} /> : <NotebookPen size={14} />}
                    </span>
                    <div>
                      <p>{item.text}</p>
                      <small>{item.author} · {item.department} · {item.time}</small>
                    </div>
                    <button
                      type="button"
                      disabled={item.complete}
                      onClick={() =>
                        setShiftHandovers((current) =>
                          current.map((handover) =>
                            handover.id === item.id ? { ...handover, complete: true } : handover,
                          ),
                        )
                      }
                    >
                      {item.complete ? 'Handed over' : 'Mark handed over'}
                    </button>
                  </article>
                ))}
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
                          {!message.seenAt && message.to === activeDepartment && (
                            <button
                              type="button"
                              className={`open-message ${message.urgent ? 'urgent' : ''}`}
                              onClick={() => markMessageOpened(message.id)}
                            >
                              Open {message.urgent ? 'urgent ' : ''}message
                            </button>
                          )}
                          {message.seenAt && (
                            <div className="message-read-receipt">
                              <ShieldCheck size={12} />
                              <span>
                                Seen by {message.seenBy} · {message.seenAt}
                              </span>
                            </div>
                          )}
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
                              {!task.openedAt && task.to === activeDepartment && (
                                <button
                                  className="open-linked-task"
                                  onClick={() => markTaskOpened(task.id)}
                                >
                                  Open task
                                </button>
                              )}
                              {task.openedAt && (
                                <div className="task-open-receipt">
                                  <ShieldCheck size={11} /> Opened by {task.openedBy} · {task.openedAt}
                                </div>
                              )}
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
              <section className="needs-attention glass-panel" aria-labelledby="needs-attention-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Priority overview</span>
                    <h2 id="needs-attention-title">Needs your attention</h2>
                  </div>
                  {attentionItems.length > 0 && (
                    <span className="attention-count">{attentionItems.length}</span>
                  )}
                </div>
                {attentionItems.length === 0 ? (
                  <div className="caught-up-state">
                    <span><ShieldCheck size={16} /></span>
                    <div>
                      <strong>All caught up</strong>
                      <p>No urgent, overdue, or unacknowledged items for {activeDepartment}.</p>
                    </div>
                  </div>
                ) : (
                  <div className="attention-list">
                    {attentionItems.map((item) => (
                      <article className={`attention-item ${item.kind}`} key={item.id}>
                        <span className="attention-symbol">
                          {item.kind === 'urgent' ? (
                            <Zap size={14} />
                          ) : item.kind === 'overdue' ? (
                            <CalendarClock size={14} />
                          ) : (
                            <ListChecks size={14} />
                          )}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.meta}</p>
                        </div>
                        {item.messageId ? (
                          <button
                            type="button"
                            onClick={() => {
                              markMessageOpened(item.messageId);
                              document
                                .getElementById(`message-${item.messageId}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                          >
                            Open
                          </button>
                        ) : (
                          <button type="button" onClick={() => setCalendarOpen(true)}>
                            View
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
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
                      {!task.openedAt && task.to === activeDepartment && (
                        <button
                          className="open-task-button"
                          onClick={() => markTaskOpened(task.id)}
                        >
                          Open task
                        </button>
                      )}
                      {task.openedAt && (
                        <div className="task-open-receipt">
                          <ShieldCheck size={11} /> Opened by {task.openedBy} · {task.openedAt}
                        </div>
                      )}
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
              <section className="attention-card glass-panel sidebar-secondary">
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
              <section className="today-glance glass-panel sidebar-secondary" aria-labelledby="today-glance-sidebar-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Operational summary</span>
                    <h2 id="today-glance-sidebar-title">Today at a glance</h2>
                  </div>
                  <ShieldCheck size={18} />
                </div>
                <div className="today-glance-stats">
                  <div><strong>{answeredGuestRequestCount}</strong><span>Guest requests answered</span></div>
                  <div><strong>{openTaskCount}</strong><span>Open tasks</span></div>
                  <div><strong>{outstandingHandoverCount}</strong><span>Handovers outstanding</span></div>
                </div>
                <div className={`today-glance-state ${todayAllClear ? 'clear' : ''}`}>
                  <ShieldCheck size={14} />
                  <span>{todayAllClear ? 'You’re on top of it' : 'Keep the handover moving'}</span>
                </div>
              </section>
            </aside>
          </section>
          <section className="lower-ops-grid" aria-label="Operations planning overview">
          <section className="month-planner glass-panel" aria-labelledby="month-planner-title">
            <div className="month-planner-heading">
              <div>
                <span className="eyebrow">Month at a glance</span>
                <h2 id="month-planner-title">Ops Planner · {plannerMonthLabel}</h2>
                <p>{activeDepartment} · select any day to open its calendar details</p>
              </div>
              <button type="button" onClick={() => setCalendarOpen(true)}>
                <CalendarDays size={15} /> Open full calendar
              </button>
            </div>
            <div className="month-planner-legend" aria-label="Ops Planner pin colours">
              <span className="urgent"><i /> Needs attention</span>
              <span className="maintenance"><i /> Maintenance</span>
              <span className="staff"><i /> Staff / shift</span>
              <span className="routine"><i /> Routine</span>
            </div>
            <div className="month-planner-weekdays" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="month-planner-grid">
              {plannerCells.map((cell, index) => cell ? (
                <button
                  type="button"
                  key={cell.day}
                  className={`${now && cell.day === now.getDate() ? 'today' : ''} ${cell.events.length ? 'has-events' : ''}`}
                  onClick={() => {
                    setSelectedPlannerDay(cell.day);
                  }}
                  aria-label={`${cell.day} ${plannerMonthLabel}${cell.events.length ? `, ${cell.events.length} calendar item${cell.events.length > 1 ? 's' : ''}` : ''}`}
                >
                  <span className="month-planner-date">{cell.day}</span>
                  <span className="month-planner-events">
                    {cell.events.slice(0, 2).map((event) => (
                      <span className={`planner-event-${event.category}`} key={event.id} title={event.title}>
                        <i /> {event.title}
                      </span>
                    ))}
                    {cell.events.length > 2 && <small>+{cell.events.length - 2} more</small>}
                  </span>
                </button>
              ) : <span className="month-planner-empty" key={`empty-${index}`} />)}
            </div>
          </section>
          <div className="lower-ops-stack">
            <section className="attention-card glass-panel">
              <div className="section-heading">
                <div><span className="eyebrow">Owned actions</span><h2>Action log</h2></div>
                <span className="request-count">3</span>
              </div>
              <div className="request"><span className="priority high" /><div><strong>Allergy confirmation</strong><p>Owned by Restaurant · Due now</p></div><ChevronDown size={15} /></div>
              <div className="request"><span className="priority medium" /><div><strong>Dishwasher repair</strong><p>Owned by Maintenance · Scheduled</p></div><ChevronDown size={15} /></div>
              <div className="request"><span className="priority low" /><div><strong>New kitchen starter</strong><p>Owned by Kitchen · Upcoming</p></div><ChevronDown size={15} /></div>
              <div className="handover-signoff"><ShieldCheck size={14} /><div><strong>Shift handover accepted</strong><span>Jordan M. · Front of House · 19:00</span></div></div>
            </section>
            <section className="today-glance glass-panel" aria-labelledby="today-glance-title">
              <div className="section-heading">
                <div><span className="eyebrow">Operational summary</span><h2 id="today-glance-title">Today at a glance</h2></div>
                <ShieldCheck size={18} />
              </div>
              <div className="today-glance-stats">
                <div><strong>{answeredGuestRequestCount}</strong><span>Guest requests answered</span></div>
                <div><strong>{openTaskCount}</strong><span>Open tasks</span></div>
                <div><strong>{outstandingHandoverCount}</strong><span>Handovers outstanding</span></div>
              </div>
              <div className={`today-glance-state ${todayAllClear ? 'clear' : ''}`}><ShieldCheck size={14} /><span>{todayAllClear ? 'You’re on top of it' : 'Keep the handover moving'}</span></div>
            </section>
          </div>
          </section>
          {selectedPlannerDay && (
            <section className="planner-day-panel" role="dialog" aria-modal="true" aria-labelledby="planner-day-title">
              <button className="planner-day-close" type="button" onClick={() => setSelectedPlannerDay(null)} aria-label="Close Ops Planner day details"><X size={18} /></button>
              <span className="eyebrow">Ops Planner · {activeDepartment}</span>
              <h2 id="planner-day-title">{selectedPlannerDay} {plannerMonthLabel}</h2>
              <div className="planner-day-entries">
                {selectedPlannerEvents.length ? selectedPlannerEvents.map((event) => (
                  <article key={event.id}>
                    <i className={`planner-pin-${event.category}`} />
                    <div><strong>{event.title}</strong><span>{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(event.startsAt))}</span></div>
                  </article>
                )) : <p>No operational entries for this day.</p>}
              </div>
              <button className="planner-day-calendar" type="button" onClick={() => {
                setSelectedCalendarId(selectedPlannerEvents[0]?.id ?? null);
                setSelectedPlannerDay(null);
                setCalendarOpen(true);
              }}><CalendarDays size={15} /> Open full calendar</button>
            </section>
          )}
          <footer className="product-credit">Powered by Freedom Services</footer>
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
            <form onSubmit={sendMessage} tabIndex={0} aria-label="Message details">
              {replyContext && (
                <div className="reply-context" aria-label="Replying to message">
                  <span>Replying to {replyContext.from} · {replyContext.time}</span>
                  <p>{replyContext.text}</p>
                </div>
              )}
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
                key={spellCheckEnabled ? 'spell-check-on' : 'spell-check-off'}
                value={draft}
                spellCheck={spellCheckEnabled}
                lang="en-GB"
                inputMode="text"
                autoComplete="on"
                autoCorrect={spellCheckEnabled ? 'on' : 'off'}
                autoCapitalize={spellCheckEnabled ? 'sentences' : 'off'}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setMessageError('');
                }}
                placeholder="Write your message…"
                autoFocus
              />
              {spellCheckEnabled && draft.trim() && (
                <div className={`spelling-results ${spellingSuggestions.length ? 'has-suggestions' : ''}`} aria-live="polite">
                  <SpellCheck size={13} />
                  {spellingSuggestions.length ? (
                    <div>
                      <span>Suggested corrections</span>
                      {spellingSuggestions.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion.word}
                          onClick={() => applySpellingCorrection(suggestion.word, suggestion.correction)}
                        >
                          {suggestion.word} → {suggestion.correction}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span>No common spelling issues found</span>
                  )}
                </div>
              )}
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
                    onClick={() => {
                      setSpellCheckEnabled((value) => {
                        const next = !value;
                        setSpellCheckNotice(next ? 'Spell check on' : 'Spell check off');
                        return next;
                      });
                    }}
                    aria-label={spellCheckEnabled ? 'Turn spell-check off' : 'Turn spell-check on'}
                    title={spellCheckEnabled ? 'Spell-check on' : 'Spell-check off'}
                  >
                    <SpellCheck size={18} />
                  </button>
                  <span className={`spellcheck-status ${spellCheckEnabled ? 'active' : ''}`}>
                    {spellCheckNotice}
                  </span>
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
                  {recording && (
                    <span className="voice-live-indicator" aria-live="polite">
                      <span className="voice-wave" aria-hidden="true"><i /><i /><i /></span>
                      <time>{String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</time>
                    </span>
                  )}
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
