'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  FileSpreadsheet, FileText, Activity, ShieldCheck, AlertTriangle, Wrench, MessageSquare
} from 'lucide-react';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
}

export default function TrackingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({
    checkInTotal: 0,
    checkOutCompleted: 0,
    checkOutActive: 0,
    checkOutAuto: 0,
    reportTotal: 0,
    reportPending: 0,
    reportResolved: 0,
  });

  const [reportTypeStats, setReportTypeStats] = useState({
    issuePending: 0, issueInprogress: 0, issueResolved: 0,
    repairPending: 0, repairInprogress: 0, repairResolved: 0,
    complaintPending: 0, complaintInprogress: 0, complaintResolved: 0,
  });

  const [featureUsageData, setFeatureUsageData] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/preloginhomepage');
        return;
      }
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        let currentUserName = currentUser.displayName || 'ผู้ใช้งาน';
        if (userSnap.exists()) {
          const data = userSnap.data();
          currentUserName = data.name || currentUserName;
          setProfile({
            name: currentUserName,
            studentId: data.studentId || '-',
            email: currentUser.email || '',
            role: data.role || 'student',
            profileImage: data.profileImage || currentUser.photoURL || '/images/defaultprofile.jpg',
          });
        } else {
          setProfile({
            name: currentUserName,
            studentId: '-',
            email: currentUser.email || '',
            role: 'student',
            profileImage: currentUser.photoURL || '/images/defaultprofile.jpg',
          });
        }

        const uid = currentUser.uid;

        // 1. Checkins data
        let cTotal = 0, cCompleted = 0, cActive = 0, cAuto = 0;
        try {
          const checkinsQuery = query(collection(db, 'checkins'), where('uid', '==', uid));
          let checkinsSnap = await getDocs(checkinsQuery);
          
          if (checkinsSnap.empty) {
            const checkinsQueryAlt = query(collection(db, 'checkins'), where('userId', '==', uid));
            checkinsSnap = await getDocs(checkinsQueryAlt);
          }

          if (!checkinsSnap.empty) {
            cTotal = checkinsSnap.size;
            checkinsSnap.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.status === 'completed') cCompleted++;
              if (data.status === 'active') cActive++;
              if (data.status === 'auto-completed') cAuto++;
            });
          }
        } catch (e) { console.error("Error fetching checkins:", e); }

        // 2. Reports data
        let rpTotal = 0, rpPending = 0, rpResolved = 0;
        let iPend = 0, iProg = 0, iRes = 0;
        let rPend = 0, rProg = 0, rRes = 0;
        let cPend = 0, cProg = 0, cRes = 0;

        try {
          const reportsQuery = query(collection(db, 'reports'), where('uid', '==', uid));
          let reportsSnap = await getDocs(reportsQuery);

          if (reportsSnap.empty) {
            const reportsQueryAlt = query(collection(db, 'reports'), where('userId', '==', uid));
            reportsSnap = await getDocs(reportsQueryAlt);
          }

          if (!reportsSnap.empty) {
            rpTotal = reportsSnap.size;
            reportsSnap.docs.forEach(d => {
              const data = d.data();
              const st = String(data.status || '').trim();
              const category = String(data.category || data.type || data.topic || '').toLowerCase();

              const isResolved = st.includes('สำเร็จ') || st.includes('resolved') || st.includes('เสร็จ');
              const isInProgress = st.includes('กำลัง') || st.includes('progress') || st.includes('ดำเนินการ');
              
              if (isResolved) rpResolved++;
              else rpPending++;

              const isRepair = category.includes('ซ่อม') || category.includes('repair') || category.includes('พัง');
              const isIssue = category.includes('เหตุ') || category.includes('issue') || category.includes('ฉุกเฉิน');

              if (isRepair) {
                if (isResolved) rRes++;
                else if (isInProgress) rProg++;
                else rPend++;
              } else if (isIssue) {
                if (isResolved) iRes++;
                else if (isInProgress) iProg++;
                else iPend++;
              } else {
                if (isResolved) cRes++;
                else if (isInProgress) cProg++;
                else cPend++;
              }
            });
          }
        } catch (e) { console.error("Error fetching reports:", e); }

        setStats({
          checkInTotal: cTotal,
          checkOutCompleted: cCompleted,
          checkOutActive: cActive,
          checkOutAuto: cAuto,
          reportTotal: rpTotal,
          reportPending: rpPending,
          reportResolved: rpResolved,
        });

        setReportTypeStats({
          issuePending: iPend, issueInprogress: iProg, issueResolved: iRes,
          repairPending: rPend, repairInprogress: rProg, repairResolved: rRes,
          complaintPending: cPend, complaintInprogress: cProg, complaintResolved: cRes,
        });

        setFeatureUsageData([
          { name: 'ลงชื่อเข้าใช้ห้อง', count: cTotal },
          { name: 'แจ้งเหตุ/ปัญหา', count: rpTotal },
        ]);

      } catch (err) {
        console.error("Error fetching user tracking data:", err);
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
      unsubscribeAuth();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [router]);

  const handleExportExcel = () => {
    const csvContent = [
      ["System Feature", "Total Count", "Completed / Resolved", "Active / Pending"],
      ["Check-In System", stats.checkInTotal, stats.checkOutCompleted, stats.checkOutActive],
      ["Report System", stats.reportTotal, stats.reportResolved, stats.reportPending]
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `My_Tracking_Summary_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';
  const isTrackingActive = pathname?.startsWith('/tracking') || pathname?.startsWith('/admin');

  const checkInPieData = [
    { name: 'ปกติ', value: stats.checkOutCompleted, color: '#059669' },
    { name: 'กำลังใช้งาน', value: stats.checkOutActive, color: '#d97706' },
    { name: 'เกินเวลา/ออโต้', value: stats.checkOutAuto, color: '#dc2626' },
  ].filter(d => d.value > 0);

  const issuePieData = [
    { name: 'แก้ไขสำเร็จ', value: reportTypeStats.issueResolved, color: '#059669' },
    { name: 'กำลังดำเนินการ', value: reportTypeStats.issueInprogress, color: '#2563eb' },
    { name: 'รอดำเนินการ', value: reportTypeStats.issuePending, color: '#d97706' },
  ].filter(d => d.value > 0);

  const repairPieData = [
    { name: 'แก้ไขสำเร็จ', value: reportTypeStats.repairResolved, color: '#059669' },
    { name: 'กำลังดำเนินการ', value: reportTypeStats.repairInprogress, color: '#2563eb' },
    { name: 'รอดำเนินการ', value: reportTypeStats.repairPending, color: '#d97706' },
  ].filter(d => d.value > 0);

  const complaintPieData = [
    { name: 'แก้ไขสำเร็จ', value: reportTypeStats.complaintResolved, color: '#059669' },
    { name: 'กำลังดำเนินการ', value: reportTypeStats.complaintInprogress, color: '#2563eb' },
    { name: 'รอดำเนินการ', value: reportTypeStats.complaintPending, color: '#d97706' },
  ].filter(d => d.value > 0);

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans selection:bg-orange-500 selection:text-white print:bg-white">
      
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
          .printable-page {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
        }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-sm transition-all print:hidden">
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
                  src={profile?.profileImage || '/images/defaultprofile.jpg'} 
                  alt="Profile" 
                  className="w-full h-full object-cover rounded-full aspect-square"
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

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* PAGE TITLE & EXPORT ACTIONS */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm printable-page">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 text-xs font-semibold">
              <Activity className="w-3.5 h-3.5" /> บันทึกประวัติการใช้งานระบบ
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">แดชบอร์ดติดตามข้อมูลส่วนบุคคล</h1>
            <p className="text-xs sm:text-sm text-gray-500">ภาพรวมสถิติกิจกรรมและการทำรายการภายในห้องโปรเจกต์ของ (<span className="font-medium text-gray-700">{profile?.name}</span>)</p>
          </div>
          <div className="flex items-center gap-2.5 print:hidden w-full sm:w-auto">
            <button onClick={handleExportExcel} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition shadow-sm">
              <FileSpreadsheet className="w-4 h-4" /> ส่งออก Excel
            </button>
            <button onClick={handleExportPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-medium text-xs transition shadow-sm">
              <FileText className="w-4 h-4" /> พิมพ์ / PDF
            </button>
          </div>
        </div>

        {/* QUICK METRICS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 printable-page">
          
          <Link href="/checkin" className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:border-orange-500 transition-all group flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">ลงชื่อเข้าใช้ห้อง</span>
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-105 transition">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="my-4">
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{stats.checkInTotal} <span className="text-xs font-medium text-gray-400">ครั้ง</span></div>
            </div>
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-gray-500">สำเร็จปกติ</span>
              <span className="font-semibold text-emerald-600">{stats.checkOutCompleted} ครั้ง</span>
            </div>
          </Link>

          <Link href="/report" className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:border-rose-500 transition-all group flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">แจ้งเหตุ / ปัญหา</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="my-4">
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{stats.reportTotal} <span className="text-xs font-medium text-gray-400">เรื่อง</span></div>
            </div>
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-gray-500">รอดำเนินการ</span>
              <span className="font-semibold text-rose-600">{stats.reportPending} เรื่อง</span>
            </div>
          </Link>

        </div>

        {/* CHARTS SECTION 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 printable-page">
          
          <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900">สถิติปริมาณการใช้งานในแต่ละระบบหลัก</h3>
                <span className="text-xs text-gray-400 font-medium">ภาพรวมการใช้งาน</span>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureUsageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#ea580c" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">สถานะการลงชื่อเข้าห้อง</h3>
              <p className="text-xs text-gray-400 mb-2">สัดส่วนรายละเอียดการเช็คอิน</p>
            </div>
            <div className="h-52 w-full flex items-center justify-center">
              {checkInPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={checkInPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                      {checkInPieData.map((e, i) => <Cell key={`ci-${i}`} fill={e.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-gray-400">ยังไม่มีประวัติการลงชื่อเข้าห้อง</p>
              )}
            </div>
          </div>

        </div>

        {/* CHARTS SECTION 3 */}
        <div className="printable-page space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">รายละเอียดสถานะการแจ้งเหตุ แจ้งซ่อม และข้อเสนอแนะ</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-gray-700" />
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">แจ้งเหตุฉุกเฉิน</h4>
              </div>
              <div className="h-48 w-full flex items-center justify-center">
                {issuePieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={issuePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value">
                        {issuePieData.map((e, i) => <Cell key={`is-${i}`} fill={e.color} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-gray-400">ยังไม่มีประวัติการแจ้งเหตุฉุกเฉิน</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="w-4 h-4 text-gray-700" />
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">ประวัติแจ้งซ่อมอุปกรณ์</h4>
              </div>
              <div className="h-48 w-full flex items-center justify-center">
                {repairPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={repairPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value">
                        {repairPieData.map((e, i) => <Cell key={`r-${i}`} fill={e.color} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-gray-400">ยังไม่มีประวัติแจ้งซ่อม</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-gray-700" />
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">เรื่องร้องเรียน / ข้อเสนอแนะ</h4>
              </div>
              <div className="h-48 w-full flex items-center justify-center">
                {complaintPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={complaintPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value">
                        {complaintPieData.map((e, i) => <Cell key={`c-${i}`} fill={e.color} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-gray-400">ยังไม่มีประวัติเรื่องร้องเรียน</p>
                )}
              </div>
            </div>

          </div>
        </div>

      </main>

    </div>
  );
}