import {
  BarChart3,
  CalendarDays,
  Download,
  Home as HomeIcon,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  SlidersHorizontal,
  Users,
} from 'lucide-react';

function SkeletonLine({ width = '70%', height = 10 }: { width?: string; height?: number }) {
  return (
    <div
      className="rounded-full bg-[#EEEFF2]"
      style={{ width, height }}
    />
  );
}

function SkeletonPill({ width = 64, height = 22 }: { width?: number; height?: number }) {
  return <div className="rounded-full bg-[#EEEFF2]" style={{ width, height }} />;
}

function RailIcon({
  icon: Icon,
  active = false,
}: {
  icon: typeof HomeIcon;
  active?: boolean;
}) {
  return (
    <div
      className={`grid h-[42px] w-[42px] place-items-center rounded-[13px] ${
        active ? 'bg-white/10' : ''
      }`}
    >
      <Icon size={19} strokeWidth={1.7} className={active ? 'text-[#EDEAFF]' : 'text-[#7C7E8A]'} />
    </div>
  );
}

function Ring({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className="relative h-16 w-16 rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${percent}%, #EEEFF2 ${percent}% 100%)` }}
      >
        <div className="absolute inset-1.5 rounded-full bg-white" />
      </div>
      <SkeletonLine width="72px" height={9} />
    </div>
  );
}

function TileHeader({ icon: Icon }: { icon: typeof HomeIcon }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon size={15} strokeWidth={1.7} className="text-[#8A8D97]" />
        <SkeletonLine width="96px" height={10} />
      </div>
      <MoreHorizontal size={15} className="text-[#C7C9D1]" />
    </div>
  );
}

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
          <div className="h-10 w-10 rounded-full bg-[#3A3B44]" />
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* HEADER */}
        <header className="flex items-center gap-5 px-1">
          <div className="flex min-w-[190px] flex-col gap-2">
            <SkeletonLine width="120px" height={20} />
            <SkeletonLine width="150px" height={11} />
          </div>

          <div className="flex h-[46px] flex-1 items-center gap-3 rounded-full bg-white pl-[18px] pr-2 shadow-[0_1px_0_rgba(20,20,40,0.04),0_8px_20px_rgba(20,20,40,0.04)]">
            <Search size={17} strokeWidth={1.8} className="text-[#A6A9B4]" />
            <span className="flex-1 text-[13px] text-[#A6A9B4]">Search</span>
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

        {/* ROW 1 */}
        <div className="grid grid-cols-[296px_1fr] items-start gap-4">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4">
            <div className="rounded-[24px] bg-white p-5 pb-[22px] shadow-[0_1px_0_rgba(20,20,40,0.03),0_14px_30px_rgba(20,20,40,0.045)]">
              <TileHeader icon={BarChart3} />
              <div className="mt-3.5">
                <SkeletonLine width="90px" height={30} />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <SkeletonLine width="85%" height={9} />
                <SkeletonLine width="60%" height={9} />
              </div>
            </div>

            <div className="rounded-[24px] bg-white p-5 pb-[18px] shadow-[0_1px_0_rgba(20,20,40,0.03),0_14px_30px_rgba(20,20,40,0.045)]">
              <div className="flex items-center justify-between">
                <TileHeader icon={Sparkles} />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <SkeletonLine width="90%" height={9} />
                <SkeletonLine width="55%" height={9} />
              </div>
              <svg className="mt-3" width="100%" height="46" viewBox="0 0 250 46" preserveAspectRatio="none">
                <polyline
                  points="0,36 35,30 70,33 105,20 140,24 175,10 210,14 250,3"
                  fill="none"
                  stroke="#DADCE3"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-[24px] bg-gradient-to-br from-[#1B1C22] to-[#0E0E12] p-6 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <div className="absolute inset-0 rounded-full border border-white/15" />
                <div className="absolute inset-[9px] rounded-full border border-white/10" />
                <div className="absolute inset-[18px] rounded-full border border-white/20 bg-white/5" />
              </div>
              <div className="flex w-full flex-col items-center gap-2">
                <SkeletonLine width="80%" height={11} />
                <SkeletonLine width="55%" height={11} />
              </div>
              <div className="h-11 w-full rounded-full border border-white/10 bg-white/[0.06]" />
            </div>
          </div>

          {/* CHART CARD */}
          <div className="min-w-0 rounded-[24px] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <BarChart3 size={16} strokeWidth={1.8} />
                <SkeletonLine width="150px" height={12} />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-[34px] items-center gap-2 rounded-full bg-[#F5F6F8] px-3.5">
                  <CalendarDays size={13} strokeWidth={1.7} className="text-[#8A8D97]" />
                  <SkeletonLine width="110px" height={8} />
                </div>
                <div className="flex items-center gap-1.5 text-[#5B5E6A]">
                  <SlidersHorizontal size={13} strokeWidth={1.8} className="text-[#8A8D97]" />
                  <span className="text-[11.5px] font-semibold">Filter</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#5B5E6A]">
                  <Download size={13} strokeWidth={1.8} className="text-[#8A8D97]" />
                  <span className="text-[11.5px] font-semibold">Export</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <SkeletonLine width="160px" height={26} />
                  <SkeletonPill width={48} height={20} />
                </div>
                <SkeletonLine width="140px" height={9} />
              </div>
              <div className="flex items-center gap-4 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#1C1B29]" />
                  <SkeletonLine width="70px" height={8} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#C7C2F7]" />
                  <SkeletonLine width="70px" height={8} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[#5B4FE9]" />
                  <SkeletonLine width="70px" height={8} />
                </div>
              </div>
            </div>

            <div className="mt-6 grid h-[196px] grid-cols-7 items-end gap-3.5 border-b border-[#EFEFF2]">
              {[46, 62, 68, 100, 76, 53, 40].map((h, i) => (
                <div key={i} className="flex h-full flex-col items-center justify-end gap-2">
                  <div
                    className="flex w-11 flex-col overflow-hidden rounded-t-[9px]"
                    style={{ height: `${h}%` }}
                  >
                    <div className="h-[26%] bg-[#5B4FE9]" />
                    <div className="h-[32%] bg-[#C7C2F7]" />
                    <div className="h-[42%] bg-[#1C1B29]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-7 gap-3.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex justify-center">
                  <SkeletonLine width="20px" height={8} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 2 */}
        <div className="grid grid-cols-[296px_1fr] items-start gap-4">
          {/* LIST CARD */}
          <div className="h-[322px] overflow-hidden rounded-[24px] bg-white p-5 pb-1">
            <TileHeader icon={Users} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 border-t border-[#F1F1F4] py-3.5">
                <div className="h-9 w-9 flex-none rounded-full bg-[#EEEFF2]" />
                <div className="flex flex-1 flex-col gap-2">
                  <SkeletonLine width="55%" height={9} />
                  <SkeletonLine width="40%" height={8} />
                </div>
                <MoreHorizontal size={15} className="text-[#C7C9D1]" />
              </div>
            ))}
          </div>

          {/* SNAPSHOT CARD */}
          <div className="min-w-0 rounded-[24px] bg-white p-6">
            <TileHeader icon={BarChart3} />

            <div className="mt-4 flex justify-center">
              <SkeletonPill width={110} height={38} />
            </div>

            <div className="mt-6 px-0.5">
              <div className="relative h-1.5 rounded-full bg-[#EEEFF2]">
                <div className="absolute inset-y-0 left-0 w-[60%] rounded-full bg-[#5B4FE9]" />
                <div className="absolute top-1/2 left-[60%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#5B4FE9] bg-white shadow-[0_2px_6px_rgba(20,20,40,0.18)]" />
              </div>
              <div className="mt-2.5 flex justify-between">
                <SkeletonLine width="24px" height={8} />
                <SkeletonLine width="24px" height={8} />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Ring percent={62} color="#5B4FE9" />
              <Ring percent={62} color="#22A55B" />
              <Ring percent={62} color="#E5604D" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
