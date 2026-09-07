import {
  BarChart3,
  CalendarDays,
  Download,
  Home as HomeIcon,
  MoreHorizontal,
  Percent,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from 'lucide-react';

function RailIcon({ icon: Icon, active = false }: { icon: typeof HomeIcon; active?: boolean }) {
  return (
    <div className={`grid h-[42px] w-[42px] place-items-center rounded-[13px] ${active ? 'bg-white/10' : ''}`}>
      <Icon size={19} strokeWidth={1.7} className={active ? 'text-[#EDEAFF]' : 'text-[#7C7E8A]'} />
    </div>
  );
}

function Sparkline() {
  return (
    <svg className="mt-2.5" width="100%" height="46" viewBox="0 0 250 46" preserveAspectRatio="none">
      <polyline
        points="0,36 35,30 70,33 105,20 140,24 175,10 210,14 250,3"
        fill="none"
        stroke="#22A55B"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="0,36 35,30 70,33 105,20 140,24 175,10 210,14 250,3 250,46 0,46" fill="#EAF9EF" />
    </svg>
  );
}

function Ring({ percent, color, label }: { percent: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <div
        className="relative h-16 w-16 rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${percent}%, #EEEFF2 ${percent}% 100%)` }}
      >
        <div className="absolute inset-1.5 grid place-items-center rounded-full bg-white text-[12.5px] font-bold">
          {percent}%
        </div>
      </div>
      <div className="text-[10.5px] leading-tight text-[#9A9CA6]">{label}</div>
    </div>
  );
}

const bars = [
  { label: 'Jan', h: 46, pct: '+1.4%', tone: 'dark' },
  { label: 'Feb', h: 62, pct: '+6.2%', tone: 'green' },
  { label: 'Mar', h: 68, pct: '+6.6%', tone: 'green' },
  { label: 'Apr', h: 100, pct: '+12.1%', tone: 'dark' },
  { label: 'May', h: 76, pct: '+7.2%', tone: 'green' },
  { label: 'Jun', h: 53, pct: '-1.1%', tone: 'red' },
  { label: 'Jul', h: 40, pct: '-4.1%', tone: 'red' },
] as const;

const contacts = [
  { name: 'Sarah Green', role: 'Investment Analyst', initials: 'SG', from: '#F2A65A', to: '#E5604D' },
  { name: 'Emily Johnson', role: 'Portfolio Manager', initials: 'EJ', from: '#6D5FE8', to: '#39B0A6' },
  { name: 'Michael Lee', role: 'Risk Assessment Lead', initials: 'ML', from: '#5B4FE9', to: '#8B7BF7' },
  { name: 'Sophia Williams', role: '', initials: 'SW', from: '#9CA0AE', to: '#6B6E7A' },
];

export default function Page() {
  return (
    <div className="flex min-h-screen w-full gap-3.5 bg-[#EEF0F3] p-5 text-[#14151A]">
      {/* SIDEBAR */}
      <aside className="flex w-[76px] flex-none flex-col items-center justify-between rounded-[28px] bg-gradient-to-b from-[#1C1D24] to-[#111117] py-5">
        <div className="flex flex-col items-center gap-4">
          <div className="mb-1 grid h-[38px] w-[38px] place-items-center rounded-[11px] bg-gradient-to-br from-[#5B4FE9] to-[#8B7BF7]">
            <HomeIcon size={17} strokeWidth={2} className="text-white" />
          </div>
          <RailIcon icon={HomeIcon} active />
          <RailIcon icon={CalendarDays} />
          <RailIcon icon={BarChart3} />
          <RailIcon icon={Users} />
          <RailIcon icon={Search} />
        </div>
        <div className="flex flex-col items-center gap-4">
          <RailIcon icon={Settings} />
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#6D5FE8] to-[#39B0A6] text-[12px] font-bold text-white">
            A
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* HEADER */}
        <header className="flex items-center gap-5 px-1">
          <div className="min-w-[190px]">
            <div className="text-[23px] font-semibold leading-tight tracking-tight">Hi, Anna!</div>
            <div className="mt-1.5 text-[12.5px] text-[#8A8D97]">Monday, January 12, 2024</div>
          </div>

          <div className="flex h-[46px] flex-1 items-center gap-3 rounded-full bg-white pl-[18px] pr-2 shadow-[0_1px_0_rgba(20,20,40,0.04),0_8px_20px_rgba(20,20,40,0.04)]">
            <Search size={17} strokeWidth={1.8} className="text-[#A6A9B4]" />
            <span className="flex-1 text-[13px] text-[#A6A9B4]">Find Something</span>
            <div className="h-[22px] w-px bg-[#ECEDF1]" />
            <div className="grid h-[34px] w-[34px] place-items-center rounded-full">
              <SlidersHorizontal size={16} strokeWidth={1.8} className="text-[#8A8D97]" />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-[0_8px_20px_rgba(20,20,40,0.04)]">
              <Settings size={18} strokeWidth={1.7} className="text-[#5B5E6A]" />
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-[0_8px_20px_rgba(20,20,40,0.04)]">
              <RefreshCw size={17} strokeWidth={1.7} className="text-[#5B5E6A]" />
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-[#14151A] px-5 text-[13.5px] font-semibold text-white">
              <Sparkles size={15} className="text-[#F3D9A0]" />
              Optimize
            </button>
          </div>
        </header>

        {/* CONTENT GRID */}
        <div className="grid grid-cols-[296px_1fr] items-start gap-4">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4">
            {/* Credit Assessment */}
            <div className="relative overflow-hidden rounded-[24px] bg-white p-5 pb-[22px] shadow-[0_1px_0_rgba(20,20,40,0.03),0_14px_30px_rgba(20,20,40,0.045)]">
              <svg className="absolute right-3.5 top-3.5 opacity-55" width="54" height="54" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2 L14 9 L21 10 L15.5 14.5 L17 21.5 L12 17.5 L7 21.5 L8.5 14.5 L3 10 L10 9 Z"
                  stroke="#F2A65A"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex items-center gap-2.5 text-[12.5px] font-semibold text-[#8A8D97]">
                <ShieldCheck size={15} strokeWidth={1.7} />
                Credit Assessment
              </div>
              <div className="mt-3.5 text-[34px] font-semibold tracking-tight">4.4K</div>
              <div className="mt-3 text-[12.5px] font-semibold">Credit status remains strong</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[#9A9CA6]">
                Your score reflects strong financial stability.
              </div>
            </div>

            {/* Performance Summary */}
            <div className="rounded-[24px] bg-white p-5 pb-[18px] shadow-[0_1px_0_rgba(20,20,40,0.03),0_14px_30px_rgba(20,20,40,0.045)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-[12.5px] font-semibold text-[#8A8D97]">
                  <TrendingUp size={15} strokeWidth={1.7} />
                  Performance Summary
                </div>
                <div className="rounded-full bg-[#EAF9EF] px-2.5 py-1 text-[11px] font-bold text-[#22A55B]">+12.4%</div>
              </div>
              <div className="mt-3 text-[12px] leading-relaxed text-[#8A8D97]">
                Your financial score is <strong className="text-[#14151A]">710</strong>, which means that you are a
                high-performing player.
              </div>
              <Sparkline />
            </div>

            {/* Promo */}
            <div className="flex flex-col items-center gap-4 rounded-[24px] bg-gradient-to-br from-[#1B1C22] to-[#0E0E12] p-6 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <div className="absolute inset-0 rounded-full border border-[#D8BB63]/35" />
                <div className="absolute inset-[9px] rounded-full border border-[#D8BB63]/28" />
                <div className="absolute inset-[18px] rounded-full border border-[#D8BB63]/40 bg-[#D8BB63]/10" />
                <Percent size={17} strokeWidth={2} className="relative text-[#E8D9A8]" />
              </div>
              <div className="text-[16.5px] font-semibold leading-snug text-white">
                Earn 5.0% APY
                <br />
                on savings.
              </div>
              <button className="h-11 w-full rounded-full border border-white/15 bg-white/[0.08] text-[13px] font-semibold text-white">
                Get Started
              </button>
            </div>

            {/* Top Contacts */}
            <div className="h-[322px] overflow-hidden rounded-[24px] bg-white p-5 pb-1">
              <div className="flex items-center justify-between">
                <div className="text-[14.5px] font-semibold">Top Contacts</div>
                <MoreHorizontal size={15} className="text-[#C7C9D1]" />
              </div>
              {contacts.map((c) => (
                <div key={c.name} className="flex items-center gap-2.5 border-t border-[#F1F1F4] py-3.5">
                  <div
                    className="grid h-9 w-9 flex-none place-items-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: `linear-gradient(150deg, ${c.from}, ${c.to})` }}
                  >
                    {c.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold">{c.name}</div>
                    {c.role && <div className="mt-0.5 text-[11px] text-[#9A9CA6]">{c.role}</div>}
                  </div>
                  {c.role && <MoreHorizontal size={15} className="text-[#C7C9D1]" />}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex min-w-0 flex-col gap-4">
          {/* CHART CARD */}
          <div className="min-w-0 rounded-[24px] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 text-[14.5px] font-semibold">
                <BarChart3 size={16} strokeWidth={1.8} />
                Annual Portfolio Growth
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-[34px] items-center gap-2 rounded-full bg-[#F5F6F8] px-3.5 text-[11.5px] font-semibold text-[#5B5E6A]">
                  <CalendarDays size={13} strokeWidth={1.7} className="text-[#8A8D97]" />
                  Jan 01, 2024 – Jul 31, 2024
                </div>
                <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#5B5E6A]">
                  <SlidersHorizontal size={13} strokeWidth={1.8} className="text-[#8A8D97]" />
                  Filter
                </div>
                <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#5B5E6A]">
                  <Download size={13} strokeWidth={1.8} className="text-[#8A8D97]" />
                  Export
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <div>
                <div className="flex items-baseline gap-2.5">
                  <div className="text-[32px] font-semibold tracking-tight">$26,444.54</div>
                  <div className="rounded-full bg-[#EAF9EF] px-2.5 py-1 text-[11px] font-bold text-[#22A55B]">+1.4%</div>
                </div>
                <div className="mt-1.5 text-[12.5px] text-[#9A9CA6]">
                  <span className="font-semibold text-[#22A55B]">+$12,546.44</span> this year
                </div>
              </div>
              <div className="flex items-center gap-4 pb-1.5 text-[11.5px] text-[#5B5E6A]">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#1C1B29]" />
                  Deposits
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#C7C2F7]" />
                  Interest
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#5B4FE9]" />
                  Growth
                </div>
              </div>
            </div>

            <div className="mt-6 grid h-[196px] grid-cols-7 items-end gap-3.5 border-b border-[#EFEFF2]">
              {bars.map((bar) => (
                <div key={bar.label} className="flex h-full flex-col items-center justify-end gap-2">
                  <div
                    className={`rounded-full px-2 py-[3px] text-[9.5px] font-bold ${
                      bar.tone === 'dark'
                        ? 'bg-[#14151A] text-white'
                        : bar.tone === 'green'
                          ? 'bg-[#EAF9EF] text-[#22A55B]'
                          : 'bg-[#FDEAE7] text-[#E5604D]'
                    }`}
                  >
                    {bar.pct}
                  </div>
                  <div className="flex w-11 flex-col overflow-hidden rounded-t-[9px]" style={{ height: `${bar.h}%` }}>
                    <div className="h-[26%] bg-[#5B4FE9]" />
                    <div className="h-[32%] bg-[#C7C2F7]" />
                    <div className="h-[42%] bg-[#1C1B29]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-7 text-center text-[11.5px] text-[#9A9CA6]">
              {bars.map((bar) => (
                <div key={bar.label}>{bar.label}</div>
              ))}
            </div>
          </div>

          {/* Portfolio Snapshot */}
          <div className="min-w-0 rounded-[24px] bg-white p-6">
            <div className="flex items-center justify-between">
              <div className="text-[14.5px] font-semibold">Portfolio Snapshot</div>
              <MoreHorizontal size={15} className="text-[#C7C9D1]" />
            </div>

            <div className="mt-4 flex justify-center">
              <div className="rounded-full bg-[#14151A] px-[22px] py-[9px] text-[19px] font-bold tracking-tight text-white">
                $654k
              </div>
            </div>

            <div className="mt-[22px] px-0.5">
              <div className="relative h-1.5 rounded-full bg-[#EEEFF2]">
                <div className="absolute inset-y-0 left-0 w-[65%] rounded-full bg-[#5B4FE9]" />
                <div className="absolute top-1/2 left-[65%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#5B4FE9] bg-white shadow-[0_2px_6px_rgba(20,20,40,0.18)]" />
              </div>
              <div className="mt-2.5 flex justify-between text-[11px] text-[#9A9CA6]">
                <span>$0</span>
                <span>$1M</span>
              </div>
            </div>

            <div className="mt-[22px] grid grid-cols-3 gap-3">
              <Ring percent={64} color="#5B4FE9" label="Portfolio Allocation Breakdown" />
              <Ring percent={36} color="#22A55B" label="Investment Growth Potential" />
              <Ring percent={48} color="#E5604D" label="Risk Exposure Insights" />
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
