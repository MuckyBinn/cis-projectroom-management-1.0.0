'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as XLSX from 'xlsx';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
  year?: string | number;
}

interface CheckInRecord {
  id: string;
  uid: string;
  name: string;
  studentId: string;
  year?: string | number;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'active' | 'completed' | 'autocheckout' | 'overdue';
  isAutoCheckout?: boolean;
  dateStr: string;
  note?: string;
  rawTimestamp?: number;
}

export default function CheckDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'checkin' | 'checkout' | 'active' | 'autocheckout'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<CheckInRecord | null>(null);

  const [isUserActive, setIsUserActive] = useState(false);
  const [globalActiveCount, setGlobalActiveCount] = useState(0);
  const [globalTodayCount, setGlobalTodayCount] = useState(0);

  // Tracking Dropdown state
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pagination State (10 รายการต่อหน้า)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/preloginhomepage');
        return;
      }
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        let currentProfileData: UserProfile = {
          name: currentUser.displayName || 'ผู้ใช้งาน',
          studentId: '-',
          email: currentUser.email || '',
          role: 'student',
          profileImage: currentUser.photoURL || '/images/defaultprofile.jpg',
          year: '-'
        };

        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          currentProfileData = {
            name: data.name || currentUser.displayName || 'ผู้ใช้งาน',
            studentId: data.studentId || '-',
            email: data.email || currentUser.email || '',
            role: data.role || 'student',
            profileImage: data.profileImage || currentUser.photoURL || '/images/defaultprofile.jpg',
            year: data.year || '-'
          };
          setProfile(currentProfileData);
        } else {
          setProfile(currentProfileData);
        }

        const q = query(
          collection(db, 'checkins'),
          where('uid', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        const userRecords: CheckInRecord[] = [];
        let hasActive = false;

        querySnapshot.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const checkOut = d.checkOutTime || null;
          const rawStatus = String(d.status || '').toLowerCase().trim();
          
          const isAuto = Boolean(
            d.isAutoCheckout || 
            rawStatus === 'autocheckout' || 
            rawStatus === 'auto-completed' || 
            rawStatus === 'auto' || 
            rawStatus === 'overdue' || 
            rawStatus.includes('เกิน') || 
            rawStatus.includes('อัตโนมัติ') ||
            rawStatus.includes('ออโต้')
          );

          let status: CheckInRecord['status'] = 'completed';
          if (rawStatus === 'active' || rawStatus.includes('กำลัง')) {
            status = 'active';
            hasActive = true;
          } else if (isAuto) {
            status = 'autocheckout';
          }

          const rawTime = d.createdAt?.toMillis ? d.createdAt.toMillis() : new Date(d.createdAt || Date.now()).getTime();

          userRecords.push({
            id: docSnap.id,
            uid: d.uid,
            name: d.name || currentProfileData.name || 'ผู้ใช้งาน',
            studentId: d.studentId || currentProfileData.studentId || '-',
            year: d.year || currentProfileData.year || '-',
            checkInTime: d.checkInTime || '-',
            checkOutTime: checkOut,
            status: status,
            isAutoCheckout: isAuto,
            dateStr: d.dateStr || '2026-09',
            note: d.note || '-',
            rawTimestamp: rawTime,
          });
        });

        userRecords.sort((a, b) => (b.rawTimestamp || 0) - (a.rawTimestamp || 0));
        setRecords(userRecords);
        setIsUserActive(hasActive);

        const activeGlobalQuery = query(collection(db, 'checkins'), where('status', '==', 'active'));
        const activeGlobalSnap = await getDocs(activeGlobalQuery);
        setGlobalActiveCount(activeGlobalSnap.size);

        const todayDateStr = new Date().toISOString().split('T')[0];
        const todayGlobalQuery = query(collection(db, 'checkins'), where('dateStr', '==', todayDateStr));
        const todayGlobalSnap = await getDocs(todayGlobalQuery);
        setGlobalTodayCount(todayGlobalSnap.size);

      } catch (err) {
        console.error('Error loading check-in data:', err);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, selectedMonth]);

  const isAdmin = profile?.role === 'admin';
  const isTrackingActive = pathname?.startsWith('/tracking') || pathname?.startsWith('/admin');

  const totalCheckInCount = records.length;
  const totalCheckOutCount = records.filter(r => r.status === 'completed' || (!r.isAutoCheckout && r.checkOutTime)).length;
  const userActiveCount = records.filter(r => r.status === 'active').length;
  const autoCheckoutCount = records.filter(r => r.isAutoCheckout || r.status === 'autocheckout').length;

  const filteredRecords = records.filter((r) => {
    const matchesMonth = r.dateStr === selectedMonth;
    if (selectedFilter === 'all') return matchesMonth;
    if (selectedFilter === 'checkin') return matchesMonth;
    if (selectedFilter === 'checkout') return (r.status === 'completed' || (!r.isAutoCheckout && r.checkOutTime)) && matchesMonth;
    if (selectedFilter === 'active') return r.status === 'active';
    if (selectedFilter === 'autocheckout') return (r.isAutoCheckout || r.status === 'autocheckout') && matchesMonth;
    return matchesMonth;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getEmptyMessage = () => {
    switch (selectedFilter) {
      case 'checkin': return 'ยังไม่มีประวัติการลงชื่อเข้าใช้';
      case 'checkout': return 'ยังไม่มีประวัติการลงชื่อออก';
      case 'active': return 'ยังไม่มีประวัติการใช้งานที่กำลังเปิดอยู่ (Active)';
      case 'autocheckout': return 'ยังไม่มีประวัติการลงชื่อออกเกินเวลา';
      default: return 'ยังไม่มีประวัติการลงชื่อเข้าใช้ในเดือนนี้';
    }
  };

  const handleDownloadExcel = () => {
    const worksheetData = filteredRecords.map((r, index) => ({
      'ลำดับ': index + 1,
      'ชื่อ-นามสกุล': r.name,
      'รหัสนักศึกษา': r.studentId,
      'ชั้นปี': String(r.year || '').replace(/ปี/g, '').trim(),
      'เวลาเข้าใช้': r.checkInTime,
      'เวลาลงชื่อออก': r.checkOutTime || 'ยังไม่ลงชื่อออก',
      'สถานะการใช้งาน': r.status === 'active' ? 'กำลังใช้งาน' : 'ลงชื่อออกแล้ว',
      'หมายเหตุการออก': (r.isAutoCheckout || r.status === 'autocheckout') ? 'ออกเกินเวลา (Auto)' : 'ปกติ',
      'วัตถุประสงค์': r.note || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CheckInHistory');
    XLSX.writeFile(workbook, `CheckIn_History_${selectedMonth}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans antialiased">
      
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
              <Link href="/homepage" className="transition hover:text-orange-600">Home</Link>
              <Link href="/checkin" className="transition hover:text-orange-600 text-orange-600 font-bold">Check-in</Link>
              
              <Link href="/Announcement" className="transition hover:text-orange-600">Announcement</Link>
              <Link href="/report" className="transition hover:text-orange-600">Report</Link>

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
                        className="block px-4 py-2 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                      >
                        User Tracking
                      </Link>
                      <Link
                        href="/admin"
                        onClick={() => setIsTrackingOpen(false)}
                        className="block px-4 py-2 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-600 border-t border-gray-50"
                      >
                        Administration Tracking
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/tracking" className={`transition hover:text-orange-600 ${isTrackingActive ? 'text-orange-600 font-bold' : ''}`}>
                  Tracking
                </Link>
              )}
            </nav>

            {/* User Profile Pill */}
            <Link 
              href="/profile" 
              className="flex items-center gap-2.5 p-1 sm:py-1 sm:px-3 rounded-full bg-gray-50/85 hover:bg-orange-50/60 border border-gray-200/60 hover:border-orange-200 transition-all duration-300 shadow-sm group shrink-0"
              title="ไปที่หน้าโปรไฟล์"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-orange-500 shadow-sm shrink-0 bg-white group-hover:scale-105 transition-transform">
                <img 
                  src={profile?.profileImage || '/images/defaultprofile.jpg'} 
                  alt="Profile" 
                  className="w-full h-full object-cover rounded-full aspect-square"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/images/defaultprofile.jpg';
                  }}
                />
              </div>
              <div className="text-left min-w-0 pr-0.5 hidden sm:block">
                <span className="block text-[12px] font-bold text-gray-900 leading-tight truncate group-hover:text-orange-600 transition-colors">
                  {profile?.name}
                </span>
                <span className="block text-[10px] font-medium text-gray-400 tracking-wide truncate">
                  {profile?.studentId}
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="flex lg:hidden items-center justify-around bg-gray-50/90 border-t border-gray-100 py-2 px-2 text-[11px] font-semibold text-gray-600 relative overflow-x-auto gap-2">
          <Link href="/homepage" className="whitespace-nowrap hover:text-orange-600">Home</Link>
          <Link href="/checkin" className="whitespace-nowrap hover:text-orange-600 text-orange-600 font-bold">Check-in</Link>
          
          <Link href="/keepleaveitems" className="whitespace-nowrap hover:text-orange-600">Keep</Link>
          <Link href="/report" className="whitespace-nowrap hover:text-orange-600">Report</Link>
          
          {isAdmin ? (
            <div className="relative">
              <button
                onClick={() => setIsTrackingOpen(!isTrackingOpen)}
                className="flex items-center gap-1 focus:outline-none whitespace-nowrap hover:text-orange-600"
              >
                Tracking ▾
              </button>
              {isTrackingOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50">
                  <Link
                    href="/tracking"
                    onClick={() => setIsTrackingOpen(false)}
                    className="block px-4 py-2 text-xs text-center text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                  >
                    User Tracking
                  </Link>
                  <Link
                    href="/admin"
                    onClick={() => setIsTrackingOpen(false)}
                    className="block px-4 py-2 text-xs text-center text-gray-700 hover:bg-orange-50 hover:text-orange-600 border-t border-gray-50"
                  >
                    Admin Tracking
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <Link href="/tracking" className="whitespace-nowrap hover:text-orange-600">
              Tracking
            </Link>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        
        {/* BANNER HEADER */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
              CIS PROJECT ROOM SYSTEM
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              แดชบอร์ดสถิติการเข้าใช้งานห้องปฏิบัติการ
            </h1>
            <p className="text-xs text-gray-500 max-w-xl">
              รายงานประวัติและติดตามสถานะการเข้าใช้ห้องโปรเจกต์ สาขาวิทยาการคอมพิวเตอร์และสารสนเทศ
            </p>
          </div>
          
          <div className="shrink-0 flex flex-col sm:flex-row gap-2">
            {/* ปุ่มเข้าห้องแชท: แสดงเมื่อ Check-in อยู่ (แอดมินเข้าได้เสมอเพื่อตอบข้อความ) */}
            {(isUserActive || isAdmin) && (
              <Link
                href="/chat"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-orange-50 border border-orange-300 text-orange-700 font-semibold text-xs rounded-lg shadow-xs transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h8M8 14h5m-9 6l2.5-3H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14z" />
                </svg>
                <span>{isAdmin && !isUserActive ? 'ข้อความจากผู้ใช้' : 'เข้าห้องแชท'}</span>
              </Link>
            )}

            {isUserActive ? (
              <Link 
                href="/logintouse" 
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>ลงชื่อออกจากห้อง</span>
              </Link>
            ) : (
              <Link 
                href="/logintouse" 
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#653E1B] hover:bg-[#523115] text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>ลงชื่อเข้าใช้ห้อง</span>
              </Link>
            )}
          </div>
        </div>

        {/* METRICS CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div 
            onClick={() => setSelectedFilter('checkin')}
            className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-xs relative overflow-hidden ${
              selectedFilter === 'checkin' ? 'border-[#653E1B] ring-2 ring-[#653E1B]/10' : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">ลงชื่อเข้าใช้สะสม</span>
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900 tracking-tight">{totalCheckInCount}</div>
              <p className="text-[11px] text-gray-400 mt-0.5">รวมทุกรายการในระบบของคุณ</p>
            </div>
          </div>

          <div 
            onClick={() => setSelectedFilter('checkout')}
            className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-xs relative overflow-hidden ${
              selectedFilter === 'checkout' ? 'border-emerald-600 ring-2 ring-emerald-600/10' : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">ลงชื่อออกเรียบร้อย</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900 tracking-tight">{totalCheckOutCount}</div>
              <p className="text-[11px] text-emerald-600 font-medium mt-0.5">เช็คเอาท์ปกติสมบูรณ์</p>
            </div>
          </div>

          <div 
            onClick={() => setSelectedFilter('active')}
            className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-xs relative overflow-hidden ${
              selectedFilter === 'active' ? 'border-amber-600 ring-2 ring-amber-600/10' : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">กำลังใช้งานอยู่ (Active)</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900 tracking-tight">{userActiveCount}</div>
              <p className="text-[11px] text-amber-700 font-medium mt-0.5">ยังไม่ทำการลงชื่อออก</p>
            </div>
          </div>

          <div 
            onClick={() => setSelectedFilter('autocheckout')}
            className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-xs relative overflow-hidden ${
              selectedFilter === 'autocheckout' ? 'border-rose-600 ring-2 ring-rose-600/10' : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">ลงชื่อออกเกินเวลา</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900 tracking-tight">{autoCheckoutCount}</div>
              <p className="text-[11px] text-rose-600 font-medium mt-0.5">ตัดระบบอัตโนมัติ เวลา 23:00 น.</p>
            </div>
          </div>
        </div>

        {/* MAIN DASHBOARD CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* LEFT CONTENT - TABLE & PAGINATION */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
            
            {/* Table Header Controls */}
            <div className="p-5 border-b border-gray-200/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900">ตารางบันทึกประวัติการใช้งาน</h2>
                  <p className="text-xs text-gray-500">แสดงผลครั้งละ 10 รายการ แยกตามเดือนและดาวน์โหลดรายงาน</p>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="month" 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-800 focus:outline-none focus:border-stone-400"
                  />
                  
                  <button 
                    onClick={handleDownloadExcel}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>ส่งออก Excel</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Bar */}
              <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg text-xs font-medium text-stone-600 overflow-x-auto">
                <button 
                  onClick={() => setSelectedFilter('all')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${selectedFilter === 'all' ? 'bg-white text-gray-900 font-bold shadow-xs' : 'hover:text-gray-900'}`}
                >
                  ทั้งหมด
                </button>
                <button 
                  onClick={() => setSelectedFilter('checkin')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${selectedFilter === 'checkin' ? 'bg-white text-gray-900 font-bold shadow-xs' : 'hover:text-gray-900'}`}
                >
                  ลงชื่อเข้าใช้
                </button>
                <button 
                  onClick={() => setSelectedFilter('checkout')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${selectedFilter === 'checkout' ? 'bg-white text-gray-900 font-bold shadow-xs' : 'hover:text-gray-900'}`}
                >
                  ออกปกติ
                </button>
                <button 
                  onClick={() => setSelectedFilter('active')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${selectedFilter === 'active' ? 'bg-white text-[#653E1B] font-bold shadow-xs' : 'hover:text-gray-900'}`}
                >
                  กำลังใช้ (Active)
                </button>
                <button 
                  onClick={() => setSelectedFilter('autocheckout')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${selectedFilter === 'autocheckout' ? 'bg-white text-rose-700 font-bold shadow-xs' : 'hover:text-gray-900'}`}
                >
                  ออกเกินเวลา
                </button>
              </div>
            </div>

            {/* Table Area */}
            {filteredRecords.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-stone-100 mx-auto flex items-center justify-center text-stone-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-stone-600">{getEmptyMessage()}</p>
                <Link 
                  href="/logintouse" 
                  className="inline-block px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-medium text-xs rounded-lg transition-colors"
                >
                  ลงชื่อเข้าใช้ห้องปฏิบัติการ
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                  <thead>
                    <tr className="bg-stone-50 border-b border-gray-200/80 text-stone-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">ผู้ใช้งาน</th>
                      <th className="py-3 px-4">รหัสนักศึกษา</th>
                      <th className="py-3 px-4 text-center">ชั้นปี</th>
                      <th className="py-3 px-4">เข้าใช้</th>
                      <th className="py-3 px-4">ออก</th>
                      <th className="py-3 px-4 text-center">สถานะ</th>
                      <th className="py-3 px-4 text-center">หมายเหตุ</th>
                      <th className="py-3 px-4 text-right">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {paginatedRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-gray-900 whitespace-nowrap">
                          {r.name}
                        </td>
                        <td className="py-3.5 px-4 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                          {r.studentId}
                        </td>
                        <td className="py-3.5 px-4 text-stone-600 text-center whitespace-nowrap">
                          {String(r.year || '').replace(/ปี/g, '').trim()}
                        </td>
                        <td className="py-3.5 px-4 text-stone-700 font-medium whitespace-nowrap">
                          {r.checkInTime}
                        </td>
                        <td className="py-3.5 px-4 text-stone-700 whitespace-nowrap">
                          {r.checkOutTime || <span className="text-amber-700 font-medium italic">-</span>}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {r.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 font-medium text-[10px]">
                              เรียบร้อย
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {r.isAutoCheckout ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-medium text-[10px]">
                              Auto (23:00)
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[10px]">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => setSelectedRecordDetail(r)}
                            className="px-2.5 py-1 rounded bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 font-medium transition-colors text-[11px]"
                          >
                            เรียกดู
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredRecords.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-200/80 bg-stone-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-600">
                <div>
                  แสดงผลลำดับที่ <span className="font-bold text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> ถึง{' '}
                  <span className="font-bold text-gray-900">{Math.min(currentPage * itemsPerPage, filteredRecords.length)}</span> จากทั้งหมด{' '}
                  <span className="font-bold text-gray-900">{filteredRecords.length}</span> รายการ
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[11px] font-semibold text-stone-700 shadow-2xs"
                  >
                    ก่อนหน้า
                  </button>
                  
                  <span className="px-3 py-1 font-bold text-stone-800 text-[11px]">
                    หน้า {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[11px] font-semibold text-stone-700 shadow-2xs"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* RIGHT CONTENT - ROOM STATUS & GUIDELINES */}
          <div className="lg:col-span-4 space-y-4">

            {/* CHAT CARD: ระบบแชท (แสดงสถานะตามการ Check-in) */}
            <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">ห้องแชทโปรเจกต์</h2>
                  <p className="text-xs text-gray-500">แชทกับคนในห้องและติดต่อผู้ดูแลระบบ</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${
                    isUserActive
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-stone-100 border-stone-200 text-stone-500'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isUserActive ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`}></span>
                  {isUserActive ? 'พร้อมใช้งาน' : 'ยังไม่ Check-in'}
                </span>
              </div>

              {isUserActive || isAdmin ? (
                <Link
                  href="/chat"
                  className="block text-center px-4 py-2.5 bg-[#653E1B] hover:bg-[#523115] text-white font-semibold text-xs rounded-lg transition-colors"
                >
                  {isAdmin && !isUserActive ? 'เปิดกล่องข้อความผู้ใช้' : 'เข้าห้องแชท'}
                </Link>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ลงชื่อเข้าใช้ห้องก่อน จึงจะเข้าแชทในห้องได้
                  </p>
                  <Link
                    href="/chat"
                    className="block text-center px-4 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 font-semibold text-xs rounded-lg transition-colors"
                  >
                    ดูประวัติแชทกับผู้ดูแล
                  </Link>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs space-y-4">
              <div className="border-b border-stone-100 pb-3">
                <h2 className="text-sm font-bold text-gray-900">ภาพรวมห้องวันนี้</h2>
                <p className="text-xs text-gray-500">ข้อมูลสถิติผู้เข้าใช้บริการห้องโปรเจกต์แบบเรียลไทม์</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-200/60 text-xs">
                  <span className="text-stone-600 font-medium">รายการเข้าใช้งานวันนี้</span>
                  <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-stone-200">{globalTodayCount} ครั้ง</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-200/60 text-xs">
                  <span className="text-stone-600 font-medium">กำลังใช้บริการขณะนี้</span>
                  <span className="font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-stone-200">{globalActiveCount} คน</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-200/60 text-xs">
                  <span className="text-stone-600 font-medium">รอการลงชื่อออก (Active)</span>
                  <span className="font-bold text-amber-700 bg-white px-2 py-0.5 rounded border border-stone-200">{globalActiveCount} รายการ</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
                <div className="w-6 h-6 rounded bg-amber-50 text-amber-800 flex items-center justify-center font-bold text-xs">
                  !
                </div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  ข้อปฏิบัติการเข้าใช้ห้องโปรเจกต์
                </h3>
              </div>

              <ul className="space-y-2.5 text-xs text-stone-600 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-[#653E1B] font-bold">•</span>
                  <span><strong>ลงชื่อเข้า-ออกทุกครั้ง:</strong> ทำการลงชื่อผ่านระบบดิจิทัลทุกครั้งที่เข้าและออกจากห้อง</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#653E1B] font-bold">•</span>
                  <span><strong>งดเว้นอาหารมีกลิ่น:</strong> ห้ามนำอาหารหนักหรือเครื่องดื่มที่อาจหกเลอะเทอะเข้ามา</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#653E1B] font-bold">•</span>
                  <span><strong>รักษาความสะอาด:</strong> จัดเก็บอุปกรณ์และทำความสะอาดโต๊ะทำงานทุกครั้งหลังเลิกใช้</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#653E1B] font-bold">•</span>
                  <span><strong>ระบบตัดอัตโนมัติ:</strong> ระบบจะทำ Check-out อัตโนมัติในเวลา 23:00 น. ของทุกวัน</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#653E1B] font-bold">•</span>
                  <span><strong>ตรวจสอบความเรียบร้อย:</strong> ปิดไฟ แอร์ และอุปกรณ์ไฟฟ้าหากท่านเป็นคนสุดท้าย</span>
                </li>
              </ul>
            </div>

          </div>

        </div>
      </div>

      {/* RECORD DETAIL MODAL */}
      {selectedRecordDetail && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900">รายละเอียดการลงชื่อเข้าใช้</h3>
              <button 
                onClick={() => setSelectedRecordDetail(null)}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-2 px-3 bg-stone-50 rounded-lg border border-stone-100">
                <span className="text-stone-500 font-medium">ชื่อ-นามสกุล</span>
                <span className="font-bold text-gray-900">{selectedRecordDetail.name}</span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-stone-50 rounded-lg border border-stone-100">
                <span className="text-stone-500 font-medium">รหัสนักศึกษา</span>
                <span className="font-mono font-bold text-gray-900">{selectedRecordDetail.studentId}</span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-stone-50 rounded-lg border border-stone-100">
                <span className="text-stone-500 font-medium">ชั้นปี</span>
                <span className="font-bold text-gray-900">{String(selectedRecordDetail.year || '').replace(/ปี/g, '').trim()}</span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-stone-50 rounded-lg border border-stone-100">
                <span className="text-stone-500 font-medium">เวลาเข้าใช้งาน</span>
                <span className="font-semibold text-gray-900">{selectedRecordDetail.checkInTime}</span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-stone-50 rounded-lg border border-stone-100">
                <span className="text-stone-500 font-medium">เวลาลงชื่อออก</span>
                <span className="font-semibold text-gray-900">{selectedRecordDetail.checkOutTime || 'ยังไม่ลงชื่อออก (Active)'}</span>
              </div>

              {selectedRecordDetail.isAutoCheckout && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-xs font-medium flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>ถูกลงชื่อออกอัตโนมัติเนื่องจากเกินเวลา 23:00 น.</span>
                </div>
              )}

              <div className="p-3 bg-stone-50 rounded-lg border border-stone-100 space-y-1">
                <span className="text-stone-500 font-medium block">วัตถุประสงค์ / หมายเหตุ</span>
                <p className="text-gray-900 font-medium">{selectedRecordDetail.note || '-'}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {selectedRecordDetail.status === 'active' && (
                <Link
                  href="/logintouse"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors"
                >
                  ไปหน้าลงชื่อออก
                </Link>
              )}

              <button
                onClick={() => setSelectedRecordDetail(null)}
                className="px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}