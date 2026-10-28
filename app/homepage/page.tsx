'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const menuItems = [
  {
    id: 'checkin',
    title: 'ลงชื่อเข้าใช้ห้องโปรเจกต์',
    description: 'บันทึกเวลาเข้าและออกจากห้องปฏิบัติการโปรเจกต์สำหรับนักศึกษา',
    image: '/images/checkin.png',
    link: '/checkin',
    isExternal: false,
  },
  {
    id: 'keepleave',
    title: 'ข่าวสารและประกาศ',
    description: 'ข่าวสารและประกาศจากห้องโปรเจกต์ กิจกรรม และแจ้งเตือนรับของ',
    image: '/images/annoument.png',
    link: '/Announcement',
    isExternal: false,
  },
  {
    id: 'report',
    title: 'แจ้งเหตุ',
    description: 'แจ้งอุปกรณ์ชำรุด ความสะอาด หรือข้อขัดข้องภายในห้องโปรเจกต์',
    image: '/images/report.png',
    link: '/report',
    isExternal: false,
  },
];

/* ===================== ข่าวสาร/แจ้งเตือน หมุนเวียนทุก 3 วินาที ===================== */

const ROTATE_INTERVAL_MS = 3000;

interface NewsEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

interface NewsAnnouncement {
  id: string;
  type: string; // lost | return | urgent | survey | general
  title: string;
  createdAtMs: number;
  deadlineMs?: number;
}

interface NewsSlot {
  key: string;
  icon: string;
  label: string;
  title: string;
  when: string;
  iconCls: string;
}

const fmtTime = (t: string) => {
  const [h, m] = (t || '0:00').split(':');
  return `${parseInt(h, 10)}.${m}`;
};

const dayText = (targetMs: number, nowMs: number) => {
  const a = new Date(targetMs);
  a.setHours(0, 0, 0, 0);
  const b = new Date(nowMs);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (diff <= 0) return 'วันนี้';
  if (diff === 1) return 'พรุ่งนี้';
  if (diff < 7) return `อีก ${diff} วัน`;
  return a.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

const remainText = (deadlineMs: number, nowMs: number) => {
  const diff = deadlineMs - nowMs;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `เหลือ ${days} วัน ${hours} ชม.`;
  if (hours > 0) return `เหลือ ${hours} ชม.`;
  return `เหลือ ${Math.max(1, Math.floor((diff % 3600000) / 60000))} นาที`;
};

const postedText = (ms: number) =>
  new Date(ms).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

function buildNewsSlots(events: NewsEvent[], announcements: NewsAnnouncement[]): NewsSlot[] {
  const now = Date.now();
  const slots: NewsSlot[] = [];

  const nextEvent = events
    .map((e) => ({
      e,
      start: new Date(`${e.date}T${e.startTime}:00`).getTime(),
      end: new Date(`${e.date}T${e.endTime}:00`).getTime(),
    }))
    .filter((x) => !isNaN(x.end) && x.end >= now)
    .sort((a, b) => a.start - b.start)[0];
  if (nextEvent) {
    slots.push({
      key: 'event',
      icon: '🎉',
      label: 'กิจกรรมที่กำลังจะมาถึง',
      title: nextEvent.e.title,
      when: `${dayText(nextEvent.start, now)} ${fmtTime(nextEvent.e.startTime)} น.`,
      iconCls: 'bg-violet-50 text-violet-600',
    });
  }

  const latestOf = (t: string) =>
    announcements.filter((a) => a.type === t).sort((a, b) => b.createdAtMs - a.createdAtMs)[0];

  const urgent = latestOf('urgent');
  if (urgent) {
    slots.push({
      key: 'urgent',
      icon: '🚨',
      label: 'กิจกรรมด่วน',
      title: urgent.title,
      when: `ประกาศ ${postedText(urgent.createdAtMs)}`,
      iconCls: 'bg-red-50 text-red-600',
    });
  }

  const nextReturn = announcements
    .filter((a) => a.type === 'return' && a.deadlineMs && a.deadlineMs > now)
    .sort((a, b) => (a.deadlineMs as number) - (b.deadlineMs as number))[0];
  if (nextReturn) {
    slots.push({
      key: 'return',
      icon: '📦',
      label: 'แจ้งนำสิ่งของคืน',
      title: nextReturn.title,
      when: remainText(nextReturn.deadlineMs as number, now),
      iconCls: 'bg-amber-50 text-amber-700',
    });
  }

  const simple: [string, string, string, string][] = [
    ['lost', '🔍', 'ประกาศตามหา', 'bg-blue-50 text-blue-600'],
    ['survey', '📝', 'แบบสอบถาม', 'bg-emerald-50 text-emerald-600'],
    ['general', '📢', 'ประกาศทั่วไป', 'bg-stone-100 text-stone-600'],
  ];
  simple.forEach(([type, icon, label, iconCls]) => {
    const a = latestOf(type);
    if (a) {
      slots.push({ key: type, icon, label, title: a.title, when: `ประกาศ ${postedText(a.createdAtMs)}`, iconCls });
    }
  });

  return slots;
}

// การ์ดสถิติใบที่ 3: สลับแสดงทีละหัวข้อทุก 3 วินาที (หยุดเมื่อเอาเมาส์วาง) กดแล้วไปหน้าข่าวสารและประกาศ
function NewsRotatorStat({ events, announcements }: { events: NewsEvent[]; announcements: NewsAnnouncement[] }) {
  const slots = buildNewsSlots(events, announcements);
  const count = slots.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, count, paused]);

  return (
    <Link
      href="/Announcement"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="min-w-0 overflow-hidden bg-white py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-lg border border-gray-200/80 shadow-sm hover:border-orange-300 transition-colors grid grid-cols-[minmax(0,1fr)]"
      title="ไปที่ข่าวสารและประกาศ"
    >
      {count === 0 ? (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-stone-100 text-stone-500 flex items-center justify-center text-xs sm:text-sm shrink-0">
            📢
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-medium text-gray-500 truncate">ข่าวสารและประกาศ</p>
            <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight truncate">ยังไม่มีรายการ</p>
          </div>
        </div>
      ) : (
        slots.map((slot, i) => (
          <div
            key={slot.key}
            aria-hidden={i !== index}
            className={`col-start-1 row-start-1 min-w-0 flex items-center gap-2.5 transition-opacity duration-500 ${
              i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${slot.iconCls}`}
            >
              {slot.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] font-medium text-gray-500 truncate">
                {slot.label} · <span className="text-gray-400">{slot.when}</span>
              </p>
              <p className="text-[13px] sm:text-sm font-bold text-gray-900 leading-snug line-clamp-2 break-words [overflow-wrap:anywhere]" title={slot.title}>{slot.title}</p>
            </div>
          </div>
        ))
      )}
    </Link>
  );
}

interface UserData {
  name?: string;
  studentId?: string;
  profileImage?: string;
  role?: string;
}

export default function HomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<UserData>({
    name: 'กำลังโหลด...',
    studentId: '------',
    profileImage: '/images/defaultprofile.jpg',
    role: 'student',
  });

  // ข้อมูลสถิติดึงจาก Firestore แบบ Dynamic
  const [stats, setStats] = useState({
    activeInRoom: 0,
    todayCheckins: 0,
    resolvedReports: 0,
  });
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [newsAnnouncements, setNewsAnnouncements] = useState<NewsAnnouncement[]>([]);

  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ฟังก์ชันสำหรับดึงข้อมูลสถิติจาก Firestore
  const fetchSummaryStats = async () => {
    try {
      // 1. ดึงจำนวนรายการที่ "แก้ไขสำเร็จ" จาก collection 'reports'
      let resolvedCount = 0;
      try {
        const reportsSnap = await getDocs(collection(db, 'reports'));
        reportsSnap.docs.forEach((d) => {
          const data = d.data();
          const st = String(data.status || '').trim().toLowerCase();
          if (st.includes('สำเร็จ') || st.includes('resolved') || st.includes('เสร็จ')) {
            resolvedCount++;
          }
        });
      } catch (e) {
        console.warn('Reports collection query error:', e);
      }

      // 2. ดึงจำนวนผู้ใช้งานขณะนี้ และ เช็คอินวันนี้ จาก collection 'checkins'
      let activeCount = 0;
      let todayCount = 0;
      const todayStr = new Date().toDateString();

      try {
        const checkinsSnap = await getDocs(collection(db, 'checkins'));
        checkinsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const status = String(data.status || '').toLowerCase();
          
          if (status === 'active' || status === 'checkin') {
            activeCount++;
          }

          if (data.createdAt) {
            let checkInDate: Date | null = null;
            if (typeof data.createdAt.toDate === 'function') {
              checkInDate = data.createdAt.toDate();
            } else if (data.createdAtMs) {
              checkInDate = new Date(data.createdAtMs);
            } else if (typeof data.createdAt === 'string') {
              checkInDate = new Date(data.createdAt);
            }

            if (checkInDate && checkInDate.toDateString() === todayStr) {
              todayCount++;
            }
          }
        });
      } catch (err) {
        console.warn('Checkins collection query error:', err);
      }

      // 3. ดึงกิจกรรมและประกาศ สำหรับการ์ดข่าวสารที่สลับแสดงทุก 3 วินาที
      try {
        const [eventsSnap, announceSnap] = await Promise.all([
          getDocs(collection(db, 'events')),
          getDocs(collection(db, 'announcements')),
        ]);
        setNewsEvents(
          eventsSnap.docs.map((d) => {
            const v = d.data() as any;
            return {
              id: d.id,
              title: v.title || 'ไม่มีชื่อกิจกรรม',
              date: v.date || '',
              startTime: v.startTime || '00:00',
              endTime: v.endTime || '23:59',
            };
          })
        );
        setNewsAnnouncements(
          announceSnap.docs.map((d) => {
            const v = d.data() as any;
            return {
              id: d.id,
              type: v.type || 'general',
              title: v.title || 'ไม่มีหัวข้อ',
              createdAtMs: v.createdAtMs || 0,
              deadlineMs: v.deadlineMs,
            };
          })
        );
      } catch (err) {
        console.warn('News collections query error:', err);
      }

      setStats({
        activeInRoom: activeCount,
        todayCheckins: todayCount,
        resolvedReports: resolvedCount,
      });
    } catch (error) {
      console.error('Error fetching dynamic summary stats:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/preloginhomepage');
        return;
      }

      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserData({
            name: data.name || currentUser.displayName || 'ผู้ใช้งาน',
            studentId: data.studentId || '-',
            profileImage: data.profileImage || currentUser.photoURL || '/images/defaultprofile.jpg',
            role: data.role || 'student',
          });
        } else {
          setUserData({
            name: currentUser.displayName || 'ผู้ใช้งาน',
            studentId: '-',
            profileImage: currentUser.photoURL || '/images/defaultprofile.jpg',
            role: 'student',
          });
        }

        // ดึงสถิติตามข้อมูลจริงใน Firestore
        await fetchSummaryStats();
      } catch (err) {
        console.error('Error fetching user data:', err);
      } finally {
        setIsLoading(false);
      }
    });

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsTrackingOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const isAdmin = userData.role === 'admin';
  const isTrackingActive = pathname?.startsWith('/tracking') || pathname?.startsWith('/admin');

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          
          {/* Logo & System Name */}
          <Link href="/homepage" className="flex items-center gap-3 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center shrink-0">
              <img 
                src="/images/cis.png" 
                alt="CIS Logo" 
                className="w-full h-full object-contain" 
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <span className="font-extrabold text-[13px] sm:text-[15px] text-gray-900 leading-tight tracking-tight truncate">CIS KKU</span>
              <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 uppercase tracking-wider block truncate">Project Room Management System</span>
            </div>
          </Link>

          {/* Right Section: Navigation & Profile */}
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-5 text-[13px] font-semibold text-gray-600">
              <Link 
                href="/homepage" 
                className={`transition hover:text-orange-600 ${pathname === '/homepage' ? 'text-orange-600 font-bold' : ''}`}
              >
                Home
              </Link>
              <Link 
                href="/checkin" 
                className={`transition hover:text-orange-600 ${pathname === '/checkin' ? 'text-orange-600 font-bold' : ''}`}
              >
                Check-in
              </Link>
             
              <Link 
                href="/Announcement" 
                className={`transition hover:text-orange-600 ${pathname === '/Announcement' ? 'text-orange-600 font-bold' : ''}`}
              >
                Announcement
              </Link>
              <Link 
                href="/report" 
                className={`transition hover:text-orange-600 ${pathname === '/report' ? 'text-orange-600 font-bold' : ''}`}
              >
                Report
              </Link>

              {isAdmin ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsTrackingOpen(!isTrackingOpen)}
                    className={`flex items-center gap-1 transition hover:text-orange-600 focus:outline-none ${isTrackingActive ? 'text-orange-600 font-bold' : ''}`}
                  >
                    Tracking <span>▾</span>
                  </button>
                  {isTrackingOpen && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50">
                      <Link
                        href="/tracking"
                        onClick={() => setIsTrackingOpen(false)}
                        className={`block px-4 py-2 text-xs hover:bg-orange-50 hover:text-orange-600 ${pathname === '/tracking' ? 'text-orange-600 font-bold bg-orange-50/50' : 'text-gray-700'}`}
                      >
                        User Tracking
                      </Link>
                      <Link
                        href="/admin"
                        onClick={() => setIsTrackingOpen(false)}
                        className={`block px-4 py-2 text-xs hover:bg-orange-50 hover:text-orange-600 border-t border-gray-50 ${pathname === '/admin' ? 'text-orange-600 font-bold bg-orange-50/50' : 'text-gray-700'}`}
                      >
                        Administration Tracking
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <Link 
                  href="/tracking" 
                  className={`transition hover:text-orange-600 ${pathname === '/tracking' ? 'text-orange-600 font-bold' : ''}`}
                >
                  Tracking
                </Link>
              )}
            </nav>

            {/* User Profile Pill */}
            <Link 
              href="/profile" 
              className={`flex items-center gap-2.5 p-1 sm:py-1 sm:px-3 rounded-full bg-gray-50/85 hover:bg-orange-50/60 border transition-all duration-300 shadow-sm group shrink-0 ${pathname === '/profile' ? 'border-orange-500 bg-orange-50/40' : 'border-gray-200/60 hover:border-orange-200'}`}
              title="ไปที่หน้าโปรไฟล์"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-orange-500 shadow-sm shrink-0 bg-white group-hover:scale-105 transition-transform">
                <img 
                  src={userData.profileImage} 
                  alt="Profile" 
                  className="w-full h-full object-cover rounded-full aspect-square"
                />
              </div>
              <div className="text-left min-w-0 pr-0.5 hidden sm:block">
                <span className="block text-[12px] font-bold text-gray-900 leading-tight truncate group-hover:text-orange-600 transition-colors">
                  {userData.name}
                </span>
                <span className="block text-[10px] font-medium text-gray-400 tracking-wide truncate">
                  {userData.studentId}
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="flex lg:hidden items-center justify-around bg-gray-50/90 border-t border-gray-100 py-2 px-2 text-[11px] font-semibold text-gray-600 relative overflow-x-auto gap-2">
          <Link 
            href="/homepage" 
            className={`whitespace-nowrap hover:text-orange-600 ${pathname === '/homepage' ? 'text-orange-600 font-bold' : ''}`}
          >
            Home
          </Link>
          <Link 
            href="/checkin" 
            className={`whitespace-nowrap hover:text-orange-600 ${pathname === '/checkin' ? 'text-orange-600 font-bold' : ''}`}
          >
            Check-in
          </Link>
          <a 
            href="https://ciseasyborrow.infinityfreeapp.com/index.php" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="whitespace-nowrap hover:text-orange-600"
          >
            Borrow ↗
          </a>
          <Link 
            href="/Announcement" 
            className={`whitespace-nowrap hover:text-orange-600 ${pathname === '/Announcement' ? 'text-orange-600 font-bold' : ''}`}
          >
            Announcement
          </Link>
          <Link 
            href="/report" 
            className={`whitespace-nowrap hover:text-orange-600 ${pathname === '/report' ? 'text-orange-600 font-bold' : ''}`}
          >
            Report
          </Link>
          
          {isAdmin ? (
            <div className="relative">
              <button
                onClick={() => setIsTrackingOpen(!isTrackingOpen)}
                className={`flex items-center gap-1 focus:outline-none whitespace-nowrap hover:text-orange-600 ${isTrackingActive ? 'text-orange-600 font-bold' : ''}`}
              >
                Tracking ▾
              </button>
              {isTrackingOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50">
                  <Link
                    href="/tracking"
                    onClick={() => setIsTrackingOpen(false)}
                    className={`block px-4 py-2 text-xs text-center hover:bg-orange-50 hover:text-orange-600 ${pathname === '/tracking' ? 'text-orange-600 font-bold bg-orange-50/50' : 'text-gray-700'}`}
                  >
                    User Tracking
                  </Link>
                  <Link
                    href="/admin"
                    onClick={() => setIsTrackingOpen(false)}
                    className={`block px-4 py-2 text-xs text-center hover:bg-orange-50 hover:text-orange-600 border-t border-gray-50 ${pathname === '/admin' ? 'text-orange-600 font-bold bg-orange-50/50' : 'text-gray-700'}`}
                  >
                    Admin Tracking
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <Link 
              href="/tracking" 
              className={`whitespace-nowrap hover:text-orange-600 ${pathname === '/tracking' ? 'text-orange-600 font-bold' : ''}`}
            >
              Tracking
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-between">
        <div>
          {/* Title Section */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 tracking-tight">
              🎓 บริการสำหรับผู้ใช้งานห้องโปรเจกต์
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              สาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ มหาวิทยาลัยขอนแก่น
            </p>
          </div>

          {/* 3-Column Grid (Menu Items) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item) => {
              const CardContent = (
                <div 
                  className="group relative h-full bg-white rounded-2xl overflow-hidden border border-gray-200/80 shadow-sm 
                             hover:-translate-y-1 hover:shadow-md hover:border-orange-300
                             transition-all duration-300 ease-out flex flex-col cursor-pointer"
                >
                  <div className="relative w-full aspect-[16/9] bg-gray-50 overflow-hidden border-b border-gray-100">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  </div>

                  <div className="p-5 flex flex-col justify-between flex-1 bg-white">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 group-hover:text-orange-600 transition-colors duration-200 mb-2">
                        {item.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-orange-600">
                      <span>{item.isExternal ? 'ไปยังเว็บภายนอก ↗' : 'เข้าสู่บริการ →'}</span>
                    </div>
                  </div>
                </div>
              );

              return item.isExternal ? (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full outline-none"
                >
                  {CardContent}
                </a>
              ) : (
                <Link key={item.id} href={item.link} className="block h-full outline-none">
                  {CardContent}
                </Link>
              );
            })}
          </div>

          {/* Dynamic Summary Statistics Section */}
          <div className="mt-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 max-w-5xl mx-auto [&>*]:min-w-0">
              {/* Stat 1 */}
              <div className="bg-white py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-lg border border-gray-200/80 shadow-sm flex items-center gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs sm:text-sm font-bold shrink-0">
                  🟢
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-medium text-gray-500 truncate">ผู้ใช้งานในห้องขณะนี้</p>
                  <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
                    {stats.activeInRoom} <span className="text-[10px] font-normal text-gray-400">คน</span>
                  </p>
                </div>
              </div>

              {/* Stat 2 */}
              <div className="bg-white py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-lg border border-gray-200/80 shadow-sm flex items-center gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center text-xs sm:text-sm font-bold shrink-0">
                  📊
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-medium text-gray-500 truncate">เช็คอินวันนี้</p>
                  <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
                    {stats.todayCheckins} <span className="text-[10px] font-normal text-gray-400">ครั้ง</span>
                  </p>
                </div>
              </div>

              {/* Stat 3: ข่าวสาร/แจ้งเตือน สลับทุก 3 วินาที */}
              <NewsRotatorStat events={newsEvents} announcements={newsAnnouncements} />

              {/* Stat 4 */}
              <div className="bg-white py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-lg border border-gray-200/80 shadow-sm flex items-center gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs sm:text-sm font-bold shrink-0">
                  ✅
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-medium text-gray-500 truncate">แก้ไขสำเร็จแล้ว</p>
                  <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
                    {stats.resolvedReports} <span className="text-[10px] font-normal text-gray-400">เรื่อง</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Post-it Note Rules Section */}
        <div className="mt-12 mb-6 flex justify-center">
          <div className="relative w-full max-w-2xl bg-amber-100 border-2 border-amber-300 p-6 sm:p-8 rounded-sm shadow-xl transform -rotate-1 transition hover:rotate-0 duration-300">
            {/* Post-it Tape */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-amber-200/80 border border-amber-300/60 shadow-sm rotate-2"></div>
            
            {/* Pin Graphic */}
            <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-red-500 border border-red-700 shadow-md"></div>

            <h3 className="text-lg sm:text-xl font-bold text-amber-900 mb-3 flex items-center gap-2 border-b-2 border-amber-300/60 pb-2">
              📌 กฎระเบียบและข้อปฏิบัติการใช้ห้อง
            </h3>

            <ul className="space-y-2.5 text-xs sm:text-sm font-medium text-amber-950 list-disc list-inside leading-relaxed">
              <li>กรุณา<strong>ลงชื่อเข้าใช้</strong>และ<strong>ลงชื่อออก</strong>ทุกครั้งเมื่อเข้าใช้ห้องโปรเจกต์</li>
              <li>ช่วยกันดูแลและรักษาความสะอาด จัดเก็บอุปกรณ์เข้าที่เดิมหลังใช้งานเสร็จสิ้น</li>
              <li>ห้ามนำอาหารหรือเครื่องดื่มแบบเปียกเข้ามาในตู้เย็น</li>
              <li>หากพบอุปกรณ์ชำรุดหรือเกิดข้อขัดข้อง กรุณาใช้งานเมนู <strong>แจ้งเหตุ</strong> ทันที</li>
              <li>ไม่ส่งเสียงดัง หรือกระทำการผิดกฏหมาย มั่วสุมภายในห้องโปรเจกต์เด็ดขาด</li>
              <li>ปิดสวิตช์ไฟ เครื่องปรับอากาศ และอุปกรณ์ไฟฟ้าทุกครั้งเมื่อเป็นคนสุดท้ายที่ออกจากห้อง</li>
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#2b2623] text-gray-300 py-6 text-center text-xs border-t border-gray-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-bold text-white mb-1">Smart CIS KKU</p>
          <p className="text-gray-400">
            ©โปรเจกต์รายวิชาโครงงานทางวิทยาการและระเบียบวิธีวิจัยทางวิทยาการคอมพิวเตอร์และสารสนเทศ ระบบสารสนเทศเพื่อการจัดการห้องปฏิบัติการ สาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ มหาวิทยาลัยขอนแก่น
          </p>
        </div>
      </footer>
    </div>
  );
}