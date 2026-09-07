'use client';

import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  BedDouble,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronUp,
  CloudRain,
  CloudSun,
  ConciergeBell,
  Crown,
  LayoutDashboard,
  KeyRound,
  ListChecks,
  Martini,
  MessageSquareText,
  Mic,
  Minus,
  NotebookPen,
  Paperclip,
  Pin,
  Plus,
  QrCode,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UtensilsCrossed,
  Wrench,
  X,
  Zap,
  Home as HomeIcon,
  FolderKanban,
  BarChart3,
  ArrowUpRight,
  Users,
} from 'lucide-react';
import { flushMessageQueue, queueMessage, watchConnectivity } from '@/lib/client/reliable-messages';

const departments = [
  { name: 'General Manager', icon: Crown, online: 1, accent: '#e0b563' },
  { name: 'Front of House', icon: ConciergeBell, online: 6, accent: '#e2748a' },
  { name: 'Concierge', icon: BellRing, online: 3, accent: '#45b8a0' },
  { name: 'Restaurant', icon: UtensilsCrossed, online: 9, accent: '#dd8a52' },
  { name: 'Kitchen', icon: ChefHat, online: 7, accent: '#d4614a' },
  { name: 'Bar', icon: Martini, online: 4, accent: '#b072d6' },
  { name: 'Housekeeping', icon: BedDouble, online: 11, accent: '#63b86a' },
  { name: 'Maintenance', icon: Wrench, online: 2, accent: '#a5a35a' },
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
  voiceNoteUrl?: string;
  voiceNoteDuration?: number;
  deliveryStatus?: 'Waiting offline' | 'Queued' | 'Delivered' | 'Failed';
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type DashboardTileId = 'pinboard' | 'guest' | 'handover' | 'management' | 'operations' | 'planner';

type RoomStatus = 'To clean' | 'Ready';

const housekeepingRooms = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
  301, 302, 303, 304, 305, 306, 307, 308, 309, 310,
];

const defaultTableCount = 20;

const defaultDashboardTileOrder: DashboardTileId[] = ['pinboard', 'guest', 'handover', 'management', 'operations', 'planner'];
const dashboardTileLabels: Record<DashboardTileId, string> = {
  pinboard: 'Department pinboard', guest: 'Guest request alert', handover: 'Shift handover',
  management: 'Management operations', operations: 'Recent messages and tasks', planner: 'Ops Planner and action log',
};

const initialMessages: HotelMessage[] = [
  {
    id: 101,
    from: 'General Manager',
    to: 'Kitchen',
    text: "Please send tomorrow's menu and allergen notes for approval before 21:00.",
    time: '19:44',
    unread: false,
    urgent: false,
  },
  {
    id: 1,
    from: 'Front of House',
    to: 'Restaurant',
    text: 'The Carrington party has arrived — six guests for table 12.',
    time: '19:42',
    unread: true,
    urgent: false,
  },
  {
    id: 2,
    from: 'Kitchen',
    to: 'Restaurant',
    text: 'Sea bass special: four portions remain. Please confirm availability before taking another order.',
    time: '19:38',
    unread: true,
    urgent: false,
  },
  {
    id: 3,
    from: 'Housekeeping',
    to: 'Front of House',
    text: 'Room 235 has been cleaned and is ready for the waiting guest.',
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
  { id: 5, from: 'Maintenance', to: 'Housekeeping', text: 'The third-floor linen-room dryer is repaired, tested and ready to use.', time: '19:27', unread: true, urgent: false },
  { id: 6, from: 'Concierge', to: 'Front of House', text: 'The airport car for room 408 has arrived at the main entrance.', time: '19:24', unread: true, urgent: false },
  { id: 7, from: 'Restaurant', to: 'Kitchen', text: 'Table 5 mains away.', time: '19:20', unread: true, urgent: false },
  { id: 201, from: 'Front of House', to: 'General Manager', text: 'Guest refund approval requested after a delayed room handover.', time: '18:58', unread: true, urgent: true },
  { id: 202, from: 'Reception', to: 'General Manager', text: 'Room upgrade decision needed for a service recovery.', time: '18:46', unread: true, urgent: false },
  { id: 203, from: 'Restaurant', to: 'General Manager', text: 'Please decide whether table 14 can be released for the waiting party.', time: '18:31', unread: true, urgent: false },
  { id: 204, from: 'Kitchen', to: 'General Manager', text: 'Overtime approval requested for the closing team tonight.', time: '18:18', unread: true, urgent: false },
  { id: 205, from: 'Maintenance', to: 'General Manager', text: 'Urgent operational maintenance decision needed for the laundry boiler.', time: '18:04', unread: true, urgent: true },
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
    // A low, two-tone hotel-console signature rather than a phone-style chime.
    const notes = urgent
      ? [
          { offset: 0, frequency: 360, duration: 0.24, volume: 0.042 },
          { offset: 0, frequency: 540, duration: 0.24, volume: 0.026 },
          { offset: 0.24, frequency: 480, duration: 0.32, volume: 0.048 },
          { offset: 0.24, frequency: 720, duration: 0.32, volume: 0.028 },
        ]
      : [
          { offset: 0, frequency: 420, duration: 0.16, volume: 0.035 },
          { offset: 0, frequency: 630, duration: 0.16, volume: 0.02 },
        ];
    notes.forEach(({ offset, frequency, duration, volume }) => {
      const gain = context.createGain();
      const start = context.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      gain.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
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
  const [calendarEditingId, setCalendarEditingId] = useState<number | null>(null);
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
    const receptionPcRepair = new Date(arrival.getFullYear(), arrival.getMonth(), Math.min(8, new Date(arrival.getFullYear(), arrival.getMonth() + 1, 0).getDate()), 11, 0);
    const staffTraining = new Date(arrival.getFullYear(), arrival.getMonth(), Math.min(21, new Date(arrival.getFullYear(), arrival.getMonth() + 1, 0).getDate()), 14, 0);
    const plannedMaintenance = new Date(arrival.getFullYear(), arrival.getMonth(), Math.min(25, new Date(arrival.getFullYear(), arrival.getMonth() + 1, 0).getDate()), 8, 30);
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
      {
        id: 904,
        department: 'Front of House',
        title: 'Reception PC repair',
        startsAt: receptionPcRepair.toISOString(),
        reminderMinutes: 30,
        category: 'maintenance',
      },
      {
        id: 905,
        department: 'Front of House',
        title: 'Staff training',
        startsAt: staffTraining.toISOString(),
        reminderMinutes: 60,
        category: 'staff',
      },
      {
        id: 906,
        department: 'Maintenance',
        title: 'Planned maintenance',
        startsAt: plannedMaintenance.toISOString(),
        reminderMinutes: 60,
        category: 'routine',
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
  const [messageDeliveryNotice, setMessageDeliveryNotice] = useState('');
  const [staffSessionToken, setStaffSessionToken] = useState('');
  const [connectedDepartment, setConnectedDepartment] = useState('');
  const [departmentDirectory, setDepartmentDirectory] = useState<Array<{ id: string; name: string }>>([]);
  const [departmentPin, setDepartmentPin] = useState('');
  const [departmentSessionStatus, setDepartmentSessionStatus] = useState('Not connected');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState('');
  const [voiceNoteDuration, setVoiceNoteDuration] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [dictationAvailable, setDictationAvailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
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
  const [housekeepingFloor, setHousekeepingFloor] = useState(1);
  const [roomStatuses, setRoomStatuses] = useState<Record<number, RoomStatus>>({
    102: 'Ready',
    205: 'Ready',
  });
  const [roomStatusNotice, setRoomStatusNotice] = useState('');
  const [tableStatuses, setTableStatuses] = useState<Record<number, 'Occupied' | 'Cleared'>>({});
  const [tableStatusNotice, setTableStatusNotice] = useState('');
  const [tableCount, setTableCount] = useState(defaultTableCount);
  const [editingTables, setEditingTables] = useState(false);
  const restaurantTables = useMemo(
    () => Array.from({ length: tableCount }, (_, index) => index + 1),
    [tableCount],
  );
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
  const [plannerEntryMode, setPlannerEntryMode] = useState<'add' | 'edit' | null>(null);
  const [plannerEditingId, setPlannerEditingId] = useState<number | null>(null);
  const [plannerEntryTitle, setPlannerEntryTitle] = useState('');
  const [plannerEntryTime, setPlannerEntryTime] = useState('09:00');
  const [selectedHandoverId, setSelectedHandoverId] = useState<number | null>(null);
  const [replyContext, setReplyContext] = useState<{ id: number; from: string; text: string; time: string } | null>(null);
  const [managementDepartmentFilter, setManagementDepartmentFilter] = useState('All departments');
  const [managementPriorityFilter, setManagementPriorityFilter] = useState('All priorities');
  const [managementStatusFilter, setManagementStatusFilter] = useState('Open');
  const [managementDateFilter, setManagementDateFilter] = useState('Today');
  const [selectedManagementThreadId, setSelectedManagementThreadId] = useState<number | null>(null);
  const [watchedManagementIds, setWatchedManagementIds] = useState<number[]>([]);
  const [steppedInManagementIds, setSteppedInManagementIds] = useState<number[]>([]);
  const [resolvedManagementIds, setResolvedManagementIds] = useState<number[]>([]);
  const [managementThreadNotes, setManagementThreadNotes] = useState<Record<number, string[]>>({});
  const [managementNoteDraft, setManagementNoteDraft] = useState('');
  const [managementReassign, setManagementReassign] = useState('');
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [departmentTileLayouts, setDepartmentTileLayouts] = useState<Record<string, DashboardTileId[]>>({});

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

  const signInDepartment = async (event: FormEvent) => {
    event.preventDefault();
    setDepartmentSessionStatus('Checking PIN…');
    try {
      const response = await fetch('/api/staff-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ department: activeDepartment, pin: departmentPin }),
      });
      const result = await response.json() as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error || 'Unable to connect');
      window.sessionStorage.setItem('noir-house-staff-session', result.token);
      setStaffSessionToken(result.token);
      setConnectedDepartment(activeDepartment);
      setDepartmentPin('');
      setDepartmentSessionStatus(`${activeDepartment} connected`);
      const departmentsResponse = await fetch('/api/departments', { headers: { authorization: `Bearer ${result.token}` } });
      if (departmentsResponse.ok) {
        const data = await departmentsResponse.json() as { departments: Array<{ id: string; name: string }> };
        setDepartmentDirectory(data.departments);
      }
    } catch (error) {
      setDepartmentSessionStatus(error instanceof Error ? error.message : 'Unable to connect');
    }
  };

  const signOutDepartment = async () => {
    if (staffSessionToken) await fetch('/api/staff-session', { method: 'DELETE', headers: { authorization: `Bearer ${staffSessionToken}` } }).catch(() => undefined);
    window.sessionStorage.removeItem('noir-house-staff-session');
    setStaffSessionToken('');
    setConnectedDepartment('');
    setDepartmentDirectory([]);
    setDepartmentSessionStatus('Not connected');
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('noir-house-department-layouts');
      if (stored) setDepartmentTileLayouts(JSON.parse(stored) as Record<string, DashboardTileId[]>);
    } catch {
      /* The dashboard remains usable when local preferences are unavailable. */
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('noir-house-table-count');
      if (stored) setTableCount(Math.max(1, Number(stored) || defaultTableCount));
    } catch {
      /* The dashboard remains usable when local preferences are unavailable. */
    }
  }, []);

  const addTable = () => {
    setTableCount((count) => {
      const next = count + 1;
      try { window.localStorage.setItem('noir-house-table-count', String(next)); } catch { /* Local preference storage may be blocked. */ }
      return next;
    });
  };

  const removeTable = () => {
    setTableCount((count) => {
      if (count <= 1) return count;
      const next = count - 1;
      setTableStatuses((current) => {
        const { [count]: _removed, ...rest } = current;
        return rest;
      });
      try { window.localStorage.setItem('noir-house-table-count', String(next)); } catch { /* Local preference storage may be blocked. */ }
      return next;
    });
  };

  const activeTileOrder = departmentTileLayouts[activeDepartment] ?? defaultDashboardTileOrder;
  const tileOrder = (tile: DashboardTileId) => 10 + activeTileOrder.indexOf(tile);
  const moveDashboardTile = (tile: DashboardTileId, direction: -1 | 1) => {
    const current = [...activeTileOrder];
    const from = current.indexOf(tile);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.length) return;
    [current[from], current[to]] = [current[to], current[from]];
    const next = { ...departmentTileLayouts, [activeDepartment]: current };
    setDepartmentTileLayouts(next);
    try { window.localStorage.setItem('noir-house-department-layouts', JSON.stringify(next)); } catch { /* Local preference storage may be blocked. */ }
  };

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordingSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    setDictationAvailable(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
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

  const isForActiveDepartment = useCallback(
    (message: HotelMessage) =>
      message.to === activeDepartment || message.to === 'All departments',
    [activeDepartment],
  );
  const unreadCount = useMemo(
    () => messages.filter((message) => message.unread && isForActiveDepartment(message)).length,
    [messages, isForActiveDepartment],
  );
  const activeNotification = useMemo(
    () => messages.find((message) => message.unread && isForActiveDepartment(message)),
    [messages, isForActiveDepartment],
  );
  const activeNotificationDepartment = activeNotification?.from === 'Reception'
    ? 'Front of House'
    : activeNotification?.from;
  const ActiveNotificationIcon = departments.find(
    (department) => department.name === activeNotificationDepartment,
  )?.icon ?? MessageSquareText;
  const seenNotifications = useMemo(
    () => messages.filter((message) => !message.unread && isForActiveDepartment(message)),
    [messages, isForActiveDepartment],
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

  useEffect(() => {
    const token = window.sessionStorage.getItem('noir-house-staff-session') ?? '';
    setStaffSessionToken(token);
    if (!token) return;
    const flush = () => void flushMessageQueue(token).then(({ remaining }) => setMessageDeliveryNotice(remaining ? `${remaining} message${remaining === 1 ? '' : 's'} waiting to send` : 'All queued messages sent'));
    flush();
    const stop = watchConnectivity(flush);
    void fetch('/api/departments', { headers: { authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { departments: Array<{ id: string; name: string }> }) => setDepartmentDirectory(data.departments))
      .catch(() => setMessageDeliveryNotice('Department session needs renewing'));
    void fetch('/api/staff-session', { headers: { authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { departmentName?: string | null }) => {
        if (data.departmentName) {
          setConnectedDepartment(data.departmentName);
          setDepartmentSessionStatus(`${data.departmentName} connected`);
        }
      })
      .catch(() => setDepartmentSessionStatus('Department session needs renewing'));
    return stop;
  }, []);

  useEffect(() => {
    if (!staffSessionToken || connectedDepartment !== activeDepartment) return;
    const type = activeDepartment === 'Housekeeping'
      ? 'housekeeping_room'
      : activeDepartment === 'Restaurant'
        ? 'restaurant_table'
        : null;
    if (!type) return;
    void fetch(`/api/status-board?type=${type}`, { headers: { authorization: `Bearer ${staffSessionToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load saved statuses');
        return response.json() as Promise<{ results: Array<{ item_number: number; status: string }> }>;
      })
      .then(({ results }) => {
        if (type === 'housekeeping_room') {
          setRoomStatuses(Object.fromEntries(results.map((item) => [item.item_number, item.status === 'ready' ? 'Ready' : 'To clean'])));
        } else {
          setTableStatuses(Object.fromEntries(results.map((item) => [item.item_number, item.status === 'away' ? 'Cleared' : 'Occupied'])));
        }
      })
      .catch(() => {
        const notice = 'Saved statuses could not be loaded. Check the department connection.';
        if (type === 'housekeeping_room') setRoomStatusNotice(notice);
        else setTableStatusNotice(notice);
      });
  }, [activeDepartment, connectedDepartment, staffSessionToken]);

  const sendMessage = async (event: FormEvent) => {
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
    const next: HotelMessage = {
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
      voiceNoteUrl: voiceNoteUrl || undefined,
      voiceNoteDuration: voiceNoteUrl ? voiceNoteDuration : undefined,
      deliveryStatus: navigator.onLine ? 'Queued' as const : 'Waiting offline' as const,
    };
    const recipientDepartmentIds = recipient === 'All departments'
      ? departmentDirectory.filter((department) => department.name !== activeDepartment).map((department) => department.id)
      : departmentDirectory.filter((department) => department.name === recipient).map((department) => department.id);
    if (staffSessionToken && recipientDepartmentIds.length) {
      await queueMessage({
        recipientDepartmentIds,
        subject: replyContext ? `Reply to ${replyContext.from}` : null,
        message: draft.trim(),
        urgency: urgent ? 'urgent' : 'normal',
        messageType: assignAsTask ? 'request' : 'message',
        kind: 'department',
      });
      try {
        const result = await flushMessageQueue(staffSessionToken);
        next.deliveryStatus = result.remaining ? 'Waiting offline' : 'Queued';
        setMessageDeliveryNotice(result.remaining ? 'Saved safely — waiting for connection' : 'Message queued for delivery');
      } catch {
        next.deliveryStatus = 'Failed';
        setMessageDeliveryNotice('Message not sent — please review it and try again');
      }
    } else {
      setMessageDeliveryNotice('Demo message only — department PIN connection is still required');
    }
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
    setVoiceNoteUrl('');
    setVoiceNoteDuration(0);
    setMessageError('');
    setUrgent(false);
    setAssignAsTask(false);
    setTaskNote('');
    setReplyContext(null);
    setComposerOpen(false);
  };

  const saveBoardStatus = async (type: 'housekeeping_room' | 'restaurant_table', itemNumber: number, status: 'pending' | 'ready' | 'away'): Promise<string | null> => {
    if (!staffSessionToken || connectedDepartment !== activeDepartment) return null;
    try {
      const response = await fetch('/api/status-board', {
        method: 'PUT',
        headers: { authorization: `Bearer ${staffSessionToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ type, itemNumber, status }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        return result.error || 'the change was not saved to the shared board.';
      }
      return null;
    } catch {
      return 'the change was not saved to the shared board.';
    }
  };

  const markRoomReady = async (room: number) => {
    if (roomStatuses[room] === 'Ready') return;
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    setRoomStatuses((current) => ({ ...current, [room]: 'Ready' }));
    const saveError = await saveBoardStatus('housekeeping_room', room, 'ready');
    setMessages((current) => [
      {
        id: Date.now(),
        from: 'Housekeeping',
        to: 'Front of House',
        text: `Room ${room} has been cleaned and is ready for the guest.`,
        time,
        unread: true,
        urgent: false,
      },
      ...current,
    ]);
    setRoomStatusNotice(saveError ? `Room ${room} sent to Front of House as ready (${saveError})` : `Room ${room} sent to Front of House as ready.`);
    if (gentleSounds) playPing(false);
    window.setTimeout(() => setRoomStatusNotice(''), 4000);
  };

  const undoRoomReady = async (room: number) => {
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    setRoomStatuses((current) => ({ ...current, [room]: 'To clean' }));
    const saveError = await saveBoardStatus('housekeeping_room', room, 'pending');
    setMessages((current) => [{ id: Date.now(), from: 'Housekeeping', to: 'Front of House', text: `Correction: room ${room} is not ready yet. Please wait for a new cleaning confirmation.`, time, unread: true, urgent: false }, ...current]);
    setRoomStatusNotice(saveError ? `Room ${room} returned to awaiting confirmation (${saveError})` : `Room ${room} returned to awaiting confirmation. Front of House notified.`);
    window.setTimeout(() => setRoomStatusNotice(''), 4000);
  };

  const markTableCleared = async (table: number) => {
    if (tableStatuses[table] === 'Cleared') return;
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    setTableStatuses((current) => ({ ...current, [table]: 'Cleared' }));
    const saveError = await saveBoardStatus('restaurant_table', table, 'away');
    setMessages((current) => [
      {
        id: Date.now(),
        from: 'Restaurant',
        to: 'Kitchen',
        text: `Table ${table} has been cleared.`,
        time,
        unread: true,
        urgent: false,
      },
      ...current,
    ]);
    setTableStatusNotice(saveError ? `Table ${table} marked cleared and Kitchen notified (${saveError})` : `Table ${table} marked cleared and Kitchen notified.`);
    if (gentleSounds) playPing(false);
    window.setTimeout(() => setTableStatusNotice(''), 4000);
  };

  const undoTableCleared = async (table: number) => {
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    setTableStatuses((current) => ({ ...current, [table]: 'Occupied' }));
    const saveError = await saveBoardStatus('restaurant_table', table, 'pending');
    setMessages((current) => [{ id: Date.now(), from: 'Restaurant', to: 'Kitchen', text: `Correction: cleared status for table ${table} was withdrawn.`, time, unread: true, urgent: false }, ...current]);
    setTableStatusNotice(saveError ? `Table ${table} returned to occupied (${saveError})` : `Table ${table} returned to occupied. Kitchen notified.`);
    window.setTimeout(() => setTableStatusNotice(''), 4000);
  };

  const addAppointment = (event: FormEvent) => {
    event.preventDefault();
    if (!appointmentTitle.trim() || !appointmentTime) return;
    if (calendarEditingId) {
      setAppointments((current) => current.map((item) => item.id === calendarEditingId ? {
        ...item, title: appointmentTitle.trim(), startsAt: new Date(appointmentTime).toISOString(),
        reminderMinutes: Number(appointmentReminder), category: appointmentCategory,
      } : item));
    } else {
      setAppointments((current) => [...current, {
        id: Date.now(), department: activeDepartment, title: appointmentTitle.trim(),
        startsAt: new Date(appointmentTime).toISOString(), reminderMinutes: Number(appointmentReminder),
        category: appointmentCategory,
      }]);
    }
    setCalendarEditingId(null);
    setAppointmentTitle('');
    setAppointmentTime('');
    setAppointmentReminder('15');
    setAppointmentCategory('routine');
  };

  const savePlannerEntry = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPlannerDay || !plannerEntryTitle.trim() || !plannerEntryTime) return;
    const [hours, minutes] = plannerEntryTime.split(':').map(Number);
    const startsAt = new Date(plannerYear, plannerMonthIndex, selectedPlannerDay, hours, minutes).toISOString();
    if (plannerEntryMode === 'edit' && plannerEditingId) {
      setAppointments((current) => current.map((item) => item.id === plannerEditingId
        ? { ...item, title: plannerEntryTitle.trim(), startsAt }
        : item));
    } else {
      setAppointments((current) => [...current, {
        id: Date.now(), department: activeDepartment, title: plannerEntryTitle.trim(), startsAt,
        reminderMinutes: 15, category: 'routine',
      }]);
    }
    setPlannerEntryMode(null);
    setPlannerEditingId(null);
    setPlannerEntryTitle('');
    setPlannerEntryTime('09:00');
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
        setVoiceNoteUrl(URL.createObjectURL(voiceNote));
        setVoiceNoteDuration(Math.max(1, recordingSeconds));
        setAttachment(
          `Voice note · ${Math.max(1, Math.round(voiceNote.size / 1024))} KB`,
        );
        setAttachmentPreview('');
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

  const toggleDictation = () => {
    if (dictating) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setMessageError('Voice to text is not available in this browser. You can still type or record a voice note.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim();
      if (transcript) setDraft((current) => `${current}${current.trim() ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = () => setMessageError('Voice to text could not hear that clearly. Please try again or type your message.');
    recognition.onend = () => setDictating(false);
    speechRecognitionRef.current = recognition;
    setMessageError('');
    setDictating(true);
    recognition.start();
  };

  const answeredGuestRequestCount = guestRequests.filter((request) => request.status === 'Resolved' || Boolean(request.reply)).length;
  const openTaskCount = assignedTasks.filter((task) => task.to === activeDepartment && task.status !== 'Complete').length;
  const outstandingHandoverCount = shiftHandovers.filter((item) => item.department === activeDepartment && !item.complete).length;
  const todayAllClear = guestRequests.every((request) => request.status !== 'New') && openTaskCount === 0 && outstandingHandoverCount === 0;
  const completedTaskCount = assignedTasks.filter((task) => task.status === 'Complete').length;
  const heroTaskPercent = assignedTasks.length ? Math.round((completedTaskCount / assignedTasks.length) * 100) : 100;
  const managementDecisionIds = new Set([201, 202, 203, 204, 205]);
  const internalManagementIssues = messages.map((message) => {
    const linkedTask = assignedTasks.find((task) => task.id === message.id);
    const department = message.from === 'Reception' ? 'Front of House' : message.from;
    return {
      id: message.id,
      department,
      title: linkedTask?.title ?? message.text,
      summary: message.text,
      time: message.time,
      priority: message.urgent ? 'Urgent' : 'Normal',
      status: resolvedManagementIds.includes(message.id) ? 'Resolved' : linkedTask?.status ?? 'Open',
      requiresDecision: managementDecisionIds.has(message.id),
      task: linkedTask,
      source: 'internal' as const,
    };
  });
  const guestManagementIssues = guestRequests.map((request) => ({
    id: 100_000 + request.id,
    department: 'Guest Requests',
    title: `${request.room === 'Guest' ? 'Guest' : `Room ${request.room}`} · ${request.text}`,
    summary: request.reply ? `${request.text} · Reply: ${request.reply}` : request.text,
    time: request.time,
    priority: request.urgent ? 'Urgent' : 'Normal',
    status: request.status,
    requiresDecision: request.urgent && request.status !== 'Resolved',
    task: undefined,
    source: 'guest' as const,
  }));
  const managementIssues = [...guestManagementIssues, ...internalManagementIssues];
  const filteredManagementIssues = managementIssues.filter((issue) =>
    (managementDepartmentFilter === 'All departments' || issue.department === managementDepartmentFilter) &&
    (managementPriorityFilter === 'All priorities' || issue.priority === managementPriorityFilter) &&
    (managementStatusFilter === 'All statuses' || (managementStatusFilter === 'Open' ? issue.status !== 'Resolved' && issue.status !== 'Complete' : issue.status === managementStatusFilter)),
  );
  const selectedManagementIssue = managementIssues.find((issue) => issue.id === selectedManagementThreadId) ?? null;
  const managementUpdateSignal = watchedManagementIds.length + steppedInManagementIds.length + resolvedManagementIds.length + Object.values(managementThreadNotes).reduce((total, notes) => total + notes.length, 0);

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
            <ActiveNotificationIcon size={18} />
          </span>
          <div className="live-notification-copy">
            <span>
              {activeNotification.urgent && <Zap size={12} aria-hidden="true" />}
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
        <>
        <div className="panel-scrim" aria-hidden="true" onClick={() => setUtilityPanel(null)} />
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
              <article><KeyRound size={17} /><div><strong>Department PIN session</strong><span>Messages and privileged actions are attributed to the connected department console.</span></div></article>
              <article><ListChecks size={17} /><div><strong>No silent deletion</strong><span>Production records will be archived with a named audit event.</span></div></article>
            </div>
          )}
          {utilityPanel === 'settings' && (
            <div className="settings-list">
              <form className="department-session-form" onSubmit={signInDepartment}>
                <span><strong>Department connection</strong><small>{departmentSessionStatus}</small></span>
                {staffSessionToken ? (
                  <button type="button" onClick={signOutDepartment}>Disconnect</button>
                ) : (
                  <div><input type="password" inputMode="numeric" pattern="[0-9]{4,8}" value={departmentPin} onChange={(event) => setDepartmentPin(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder={`${activeDepartment} PIN`} aria-label={`${activeDepartment} PIN`} /><button type="submit" disabled={departmentPin.length < 4}>Connect</button></div>
                )}
              </form>
              <label><span><strong>Notification sounds</strong><small>Short chime normally · calm distinct pattern when urgent</small></span><input type="checkbox" checked={gentleSounds} onChange={(event) => setGentleSounds(event.target.checked)} /></label>
              <label><span><strong>Calm interface motion</strong><small>Subtle visual movement and reminders</small></span><input type="checkbox" checked={calmMotion} onChange={(event) => setCalmMotion(event.target.checked)} /></label>
            </div>
          )}
        </section>
        </>
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
        <>
        <div className="panel-scrim" aria-hidden="true" onClick={() => setCalendarOpen(false)} />
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
            <div className="calendar-form-actions">
              {calendarEditingId && <button type="button" onClick={() => { setCalendarEditingId(null); setAppointmentTitle(''); setAppointmentTime(''); setAppointmentReminder('15'); setAppointmentCategory('routine'); }}>Cancel</button>}
              <button type="submit" disabled={!appointmentTitle.trim() || !appointmentTime}>
                <Plus size={15} /> {calendarEditingId ? 'Save changes' : `Add to ${activeDepartment}`}
              </button>
            </div>
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
                  <button type="button" onClick={() => {
                    const local = new Date(appointment.startsAt);
                    const localValue = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setSelectedCalendarId(appointment.id);
                    setCalendarEditingId(appointment.id);
                    setAppointmentTitle(appointment.title);
                    setAppointmentTime(localValue);
                    setAppointmentReminder(String(appointment.reminderMinutes));
                    setAppointmentCategory(appointment.category);
                  }}>Edit</button>
                </article>
              ))
            )}
          </div>
        </section>
        </>
      )}

      <section className="workspace">
        <nav className="pill-topnav glass-panel">
          <div className="pill-topnav-mark">N</div>
          <div className="pill-tabs">
            <span className="pill-tab active"><HomeIcon size={15} />Home</span>
            <span className="pill-tab"><LayoutDashboard size={15} />Dashboard</span>
            <span className="pill-tab"><FolderKanban size={15} />Projects</span>
            <span className="pill-tab"><ListChecks size={15} />Tasks</span>
            <span className="pill-tab"><BarChart3 size={15} />Reporting</span>
            <span className="pill-tab"><Users size={15} />Users</span>
          </div>
          <div className="pill-topnav-right">
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
                    .map((message) => {
                      const messageDepartment = message.from === 'Reception' ? 'Front of House' : message.from;
                      const MessageDepartmentIcon = departments.find((department) => department.name === messageDepartment)?.icon ?? MessageSquareText;
                      return (
                      <article
                        key={message.id}
                        className={`notification-item swipe-notification ${message.urgent ? 'urgent' : ''} ${pinnedNotificationKeys.includes(`internal-${message.id}`) ? 'pinned' : ''}`}
                        onPointerDown={(event) => beginNotificationSwipe(`internal-${message.id}`, event)}
                        onPointerUp={(event) => finishNotificationSwipe(`internal-${message.id}`, event, () => setMessages((current) => current.filter((item) => item.id !== message.id)))}
                      >
                        <span className="notification-symbol">
                          <MessageDepartmentIcon size={15} />
                          {message.urgent && <Zap className="notification-priority-mark" size={8} />}
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
                    );})}
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
        </nav>

        <div className="greeting-row">
          <div className="greeting">
            <p>Hello, {activeDepartment} team</p>
            <h1>Welcome to Dashboard</h1>
          </div>
          <details className="department-switcher">
            <summary
              className="department-switcher-trigger dept-pill"
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
                    <span className="dept-menu-icon" style={{ '--dept-color': department.accent } as CSSProperties}>
                      <DepartmentIcon size={14} />
                    </span>
                    <span>{department.name}</span>
                  </button>
                );
              })}
            </div>
          </details>
        </div>

        <div className="dash-grid">
          <div className="dash-stack">
            <section className="hero-stat glass-panel" aria-label="Today's task completion">
          <div className="hero-stat-top">
            <strong>{heroTaskPercent}%</strong>
            <span>of today&rsquo;s tasks complete</span>
            <em>{heroTaskPercent >= 75 ? 'On track' : heroTaskPercent >= 40 ? 'In progress' : 'Needs attention'}</em>
          </div>
          <div className="hero-bar-wrap">
            <span className="hero-marker" style={{ left: `${heroTaskPercent}%` }} />
            <div className="hero-bar-track">
              <div className="hero-bar-fill" style={{ width: `${heroTaskPercent}%` }} />
            </div>
          </div>
          <div className="hero-scale">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </section>

            <section className="revenue-card glass-panel">
              <div className="card-head">
                <div><span className="eyebrow">{activeDepartment}</span><h2>Weekly guest volume</h2></div>
                <span className="expand"><ArrowUpRight size={13} /></span>
              </div>
              <strong className="revenue-figure">{guestRequests.length}<em>total requests logged</em></strong>
              <svg className="mini-chart" viewBox="0 0 220 60" preserveAspectRatio="none" aria-hidden="true">
                <polyline points="0,45 40,30 80,38 120,18 160,26 220,8" fill="none" stroke="#22c3a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mini-chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Today</span></div>
            </section>

            <section className="employees-card glass-panel">
              <div className="card-head">
                <div><h2>Departments</h2><span className="eyebrow">On this console</span></div>
              </div>
              {departments.slice(0, 3).map((department) => (
                <div className="employee-row" key={department.name}>
                  <span className="employee-avatar" style={{ '--dept-color': department.accent } as CSSProperties}><department.icon size={15} /></span>
                  <div><strong>{department.name}</strong><span>Department console</span></div>
                </div>
              ))}
            </section>
          </div>

          <div className="dash-side">
            <div className="controls-row">
              <span className="control-pill"><SelectedDepartmentIcon size={14} />{activeDepartment}</span>
              <button className="primary-btn-black" onClick={() => { setReplyContext(null); setComposerOpen(true); }}>
                <Plus size={15} />New message
              </button>
            </div>

            <div className="stat-trio">
              <div className="stat-card glass-panel">
                <div className="stat-card-top">
                  <span className="stat-ic pink"><ConciergeBell size={16} /></span>
                  <span className="expand"><ArrowUpRight size={12} /></span>
                </div>
                <strong>{pendingGuestRequests.length}</strong>
                <span>Guest requests open</span>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-card-top">
                  <span className="stat-ic blue"><ListChecks size={16} /></span>
                  <span className="expand"><ArrowUpRight size={12} /></span>
                </div>
                <strong>{openTaskCount}</strong>
                <span>Tasks in progress</span>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-card-top">
                  <span className="stat-ic green"><NotebookPen size={16} /></span>
                  <span className="expand"><ArrowUpRight size={12} /></span>
                </div>
                <strong>{outstandingHandoverCount}</strong>
                <span>Handovers outstanding</span>
              </div>
            </div>

            <section className="task-summary-card glass-panel">
              <div className="card-head">
                <div><span className="eyebrow">Accountability</span><h2>Task Management Summary</h2></div>
                <span className="expand"><ArrowUpRight size={13} /></span>
              </div>
              <strong className="task-summary-count">{assignedTasks.length} Task{assignedTasks.length === 1 ? '' : 's'}</strong>
              <svg className="mini-area-chart" viewBox="0 0 320 90" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="taskAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points="0,60 45,40 90,55 135,25 180,45 225,20 270,38 320,15 320,90 0,90" fill="url(#taskAreaFill)" opacity="0.18" />
                <polyline points="0,60 45,40 90,55 135,25 180,45 225,20 270,38 320,15" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mini-chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
            </section>
          </div>
        </div>

        <div className="content">
          {/* Old tiles removed — rebuilding section by section on the new base. */}
        </div>

        {composerOpen && (
          <>
          <div className="panel-scrim" aria-hidden="true" onClick={() => setComposerOpen(false)} />
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
                value={draft}
                spellCheck
                lang="en-GB"
                inputMode="text"
                autoComplete="on"
                autoCorrect="on"
                autoCapitalize="sentences"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setMessageError('');
                }}
                placeholder="Write your message…"
                autoFocus
              />
              {spellCheckEnabled && spellingSuggestions.length > 0 && (
                <div className="spelling-results has-suggestions">
                  <ShieldCheck size={12} />
                  <div>
                    <span>Possible spelling:</span>
                    {spellingSuggestions.map(({ word, correction }) => (
                      <button
                        type="button"
                        key={word}
                        onClick={() => applySpellingCorrection(word, correction)}
                      >
                        {word} → {correction}
                      </button>
                    ))}
                  </div>
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
              {messageDeliveryNotice && <p className="message-delivery-notice" role="status" aria-live="polite"><ShieldCheck size={13} /> {messageDeliveryNotice}</p>}
              {attachment && (
                <div className="attachment-chip">
                  <Paperclip size={13} />
                  <span>{attachment}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachment('');
                      setAttachmentPreview('');
                      setVoiceNoteUrl('');
                      setVoiceNoteDuration(0);
                    }}
                    aria-label="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {dictating && (
                <p className="dictation-status" role="status" aria-live="polite">
                  <span aria-hidden="true" />
                  Voice to text is listening
                </p>
              )}
              <div className="composer-footer">
                <div className="composer-tools">
                  <button type="button" className={`voice-to-text-button ${dictating ? 'active' : ''}`} onClick={toggleDictation} disabled={!dictationAvailable} aria-pressed={dictating} aria-label={dictationAvailable ? (dictating ? 'Stop voice to text' : 'Start voice to text') : 'Voice to text is unavailable in this browser'} title={dictationAvailable ? 'Voice to text' : 'Voice to text unavailable'}>
                    <Mic size={17} /><span>{dictating ? 'Listening…' : 'Voice to text'}</span>
                  </button>
                  <button
                    type="button"
                    className={`spellcheck-toggle ${spellCheckEnabled ? 'active' : ''}`}
                    onClick={() => {
                      const next = !spellCheckEnabled;
                      setSpellCheckEnabled(next);
                      setSpellCheckNotice(next ? 'Spell check on' : 'Spell check off');
                    }}
                    aria-pressed={spellCheckEnabled}
                    aria-label={spellCheckEnabled ? 'Turn off spell check' : 'Turn on spell check'}
                    title={spellCheckEnabled ? 'Spell check on' : 'Spell check off'}
                  >
                    <ShieldCheck size={17} /><span className={`spellcheck-status ${spellCheckEnabled ? 'active' : ''}`}>{spellCheckNotice}</span>
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
                      key={attachment}
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
                          setVoiceNoteUrl('');
                          setVoiceNoteDuration(0);
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
          </>
        )}
      </section>
    </main>
  );
}
