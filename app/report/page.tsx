'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, query, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
  year?: string | number;
}

interface ReportItem {
  id: string;
  uid: string;
  reporterName: string;
  studentId: string;
  isAnonymous: boolean;
  category: 'แจ้งซ่อม' | 'แจ้งเหตุ' | 'ร้องเรียน';
  title: string;
  detail: string;
  images: string[];
  status: 'received' | 'processing' | 'success'; 
  createdAtMs: number;
  createdAtStr: string;
  evidenceImages?: string[];
  evidenceNote?: string;
}

export default function ReportSystemPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'แจ้งซ่อม' | 'แจ้งเหตุ' | 'ร้องเรียน'>('แจ้งซ่อม');
  const [filterOption, setFilterOption] = useState<'all' | 'pending' | 'success'>('all');
  const [reports, setReports] = useState<ReportItem[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<'แจ้งซ่อม' | 'แจ้งเหตุ' | 'ร้องเรียน'>('แจ้งซ่อม');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [images, setImages] = useState<string[]>(['', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

        const q = query(collection(db, 'reports'));
        const querySnapshot = await getDocs(q);
        const loadedReports: ReportItem[] = [];

        querySnapshot.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const createdAtMs = d.createdAtMs || (d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now());
          
          let mappedStatus: 'received' | 'processing' | 'success' = 'received';
          if (d.status === 'แก้ไขสำเร็จ' || d.status === 'success') {
            mappedStatus = 'success';
          } else if (d.status === 'กำลังดำเนินการ' || d.status === 'processing') {
            mappedStatus = 'processing';
          }

          loadedReports.push({
            id: docSnap.id,
            uid: d.uid,
            reporterName: d.reporterName || 'ไม่ระบุตัวตน',
            studentId: d.studentId || '-',
            isAnonymous: d.isAnonymous || false,
            category: d.category || 'แจ้งซ่อม',
            title: d.title || 'ไม่มีหัวข้อ',
            detail: d.detail || '-',
            images: d.images || [],
            status: mappedStatus,
            createdAtMs,
            createdAtStr: d.createdAtStr || new Date(createdAtMs).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
            evidenceImages: ((d.adminImages || d.evidenceImages || []) as any[])
              .filter((x) => typeof x === 'string' && !x.startsWith('blob:')),
            evidenceNote: d.adminNote || d.evidenceNote || ''
          });
        });

        loadedReports.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setReports(loadedReports);

      } catch (err) {
        console.error('Error loading reports:', err);
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

  const handleImageChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          const newImages = [...images];
          newImages[index] = compressedBase64;
          setImages(newImages);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!title.trim() || !detail.trim()) {
      alert('กรุณากรอกหัวข้อและรายละเอียดให้ครบถ้วน');
      return;
    }

    setIsSubmitting(true);
    try {
      const nowMs = Date.now();
      const validImages = images.filter(img => img.trim() !== '');

      const newReportData = {
        uid: auth.currentUser?.uid || '',
        reporterName: isAnonymous ? 'ไม่ระบุตัวตน (Anonymous)' : (profile.name || 'ผู้ใช้งาน'),
        studentId: isAnonymous ? 'XXXX' : (profile.studentId || '-'),
        isAnonymous,
        category: modalCategory,
        title: title.trim(),
        detail: detail.trim(),
        images: validImages,
        status: 'received',
        createdAtMs: nowMs,
        createdAtStr: new Date(nowMs).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'reports'), newReportData);

      const newRecord: ReportItem = {
        id: docRef.id,
        uid: newReportData.uid,
        reporterName: newReportData.reporterName,
        studentId: newReportData.studentId,
        isAnonymous: newReportData.isAnonymous,
        category: newReportData.category as any,
        title: newReportData.title,
        detail: newReportData.detail,
        images: newReportData.images,
        status: 'received',
        createdAtMs: nowMs,
        createdAtStr: newReportData.createdAtStr,
        evidenceImages: [],
        evidenceNote: ''
      };

      setReports([newRecord, ...reports]);
      setCurrentPage(1); 
      setIsModalOpen(false);
      setTitle('');
      setDetail('');
      setImages(['', '', '']);
      setIsAnonymous(false);
      alert('ส่งเรื่องแจ้งเรียบร้อยแล้ว เจ้าหน้าที่ / แอดมินจะดำเนินการตรวจสอบต่อไป');
    } catch (err) {
      console.error('Error submitting report:', err);
      alert('เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelReport = async (reportId: string, reportUid: string, status: string) => {
    if (status !== 'received') {
      alert('ไม่สามารถยกเลิกได้ เนื่องจากเรื่องนี้อยู่ในระหว่างดำเนินการหรือแก้ไขเสร็จสิ้นแล้ว');
      return;
    }

    if (auth.currentUser?.uid !== reportUid && profile?.role !== 'admin') {
      alert('คุณไม่มีสิทธิ์ยกเลิกรายการนี้');
      return;
    }

    if (confirm('คุณต้องการยกเลิกการแจ้งเรื่องนี้ใช่หรือไม่?')) {
      try {
        await deleteDoc(doc(db, 'reports', reportId));
        setReports(reports.filter(r => r.id !== reportId));
        setSelectedReport(null);
        alert('ยกเลิกและลบรายการเรียบร้อยแล้ว');
      } catch (err) {
        console.error('Error cancelling report:', err);
        alert('เกิดข้อผิดพลาดในการยกเลิกรายการ');
      }
    }
  };

  const filteredReports = reports.filter(item => {
    if (item.category !== activeTab) return false;
    if (filterOption === 'pending') {
      return item.status === 'received' || item.status === 'processing';
    }
    if (filterOption === 'success') {
      return item.status === 'success';
    }
    return true;
  });

  const categoryReports = reports.filter(item => item.category === activeTab);
  const totalCategoryCount = categoryReports.length;
  const pendingCategoryCount = categoryReports.filter(item => item.status === 'received' || item.status === 'processing').length;
  const successCategoryCount = categoryReports.filter(item => item.status === 'success').length;

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentReports = filteredReports.slice(startIndex, startIndex + itemsPerPage);

  const isAdmin = profile?.role === 'admin';
  const isTrackingActive = pathname?.startsWith('/tracking') || pathname?.startsWith('/admin');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-800 flex flex-col font-sans selection:bg-[#8A5A28] selection:text-white">
      
      {/* HEADER (Redesigned: Professional, Clean & Fully Responsive) */}
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
            href="/keepleaveitems" 
            className={`whitespace-nowrap hover:text-orange-600 ${pathname === '/keepleaveitems' ? 'text-orange-600 font-bold' : ''}`}
          >
            Keep
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

      {/* BODY LAYOUT */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col xl:flex-row gap-6">
        
        {/* SIDEBAR / CONTROLS */}
        <div className="w-full xl:w-80 shrink-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
          
          <div className="bg-white rounded-2xl border border-[#E6E1DA] p-4 sm:p-5 shadow-xs space-y-3.5">
            <div>
              <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block mb-0.5">Incident Categories</span>
              <h3 className="text-xs sm:text-sm font-black text-stone-900">ระบบจัดการเรื่องร้องเรียน</h3>
              <p className="text-[11px] text-stone-500">เลือกหมวดหมู่เพื่อดูหรือแจ้งเรื่อง</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2.5">
              <button
                onClick={() => { setActiveTab('แจ้งซ่อม'); setFilterOption('all'); setCurrentPage(1); }}
                className={`w-full p-3 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                  activeTab === 'แจ้งซ่อม' 
                    ? 'bg-[#653E1B] text-white shadow-sm' 
                    : 'bg-[#FAF8F5] text-stone-700 hover:bg-[#F3EFEA] border border-[#E6E1DA]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-base">🛠️</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${activeTab === 'แจ้งซ่อม' ? 'bg-white/20 text-white' : 'bg-stone-200/60 text-stone-600'}`}>พัง/ชำรุด</span>
                </div>
                <div>
                  <span className="text-xs font-black block leading-snug">แจ้งซ่อมอุปกรณ์</span>
                </div>
              </button>

              <button
                onClick={() => { setActiveTab('แจ้งเหตุ'); setFilterOption('all'); setCurrentPage(1); }}
                className={`w-full p-3 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                  activeTab === 'แจ้งเหตุ' 
                    ? 'bg-[#653E1B] text-white shadow-sm' 
                    : 'bg-[#FAF8F5] text-stone-700 hover:bg-[#F3EFEA] border border-[#E6E1DA]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-base">🚨</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${activeTab === 'แจ้งเหตุ' ? 'bg-white/20 text-white' : 'bg-stone-200/60 text-stone-600'}`}>เหตุการณ์ด่วน</span>
                </div>
                <div>
                  <span className="text-xs font-black block leading-snug">แจ้งเหตุฉุกเฉิน/อุบัติเหตุ</span>
                </div>
              </button>

              <button
                onClick={() => { setActiveTab('ร้องเรียน'); setFilterOption('all'); setCurrentPage(1); }}
                className={`w-full p-3 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                  activeTab === 'ร้องเรียน' 
                    ? 'bg-[#653E1B] text-white shadow-sm' 
                    : 'bg-[#FAF8F5] text-stone-700 hover:bg-[#F3EFEA] border border-[#E6E1DA]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-base">⚠️</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${activeTab === 'ร้องเรียน' ? 'bg-white/20 text-white' : 'bg-stone-200/60 text-stone-600'}`}>ไม่พอใจ/ละเมิด</span>
                </div>
                <div>
                  <span className="text-xs font-black block leading-snug">ร้องเรียนพฤติกรรม/กฎ</span>
                </div>
              </button>
            </div>
            <div className="pt-3 border-t border-[#E6E1DA]">
              <button
                onClick={() => {
                  setModalCategory(activeTab);
                  setIsModalOpen(true);
                }}
                className="w-full py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>✚</span> แจ้งเรื่องใหม่ ({activeTab})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            <div className="bg-white rounded-2xl border border-[#E6E1DA] p-4 sm:p-5 shadow-xs space-y-2.5">
              <div>
                <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block mb-0.5">Statistics Summary</span>
                <h4 className="text-xs font-black text-stone-900">ยอดสรุปการแก้ไข ({activeTab})</h4>
              </div>
              
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1DA]">
                  <span className="text-stone-600 font-medium">รับแจ้งแล้ว</span>
                  <span className="font-black text-stone-900">{totalCategoryCount} ครั้ง</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50/60 rounded-xl border border-amber-200">
                  <span className="text-amber-800 font-medium">รอการแก้ไข</span>
                  <span className="font-black text-amber-900">{pendingCategoryCount} ครั้ง</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50/60 rounded-xl border border-emerald-200">
                  <span className="text-emerald-800 font-medium">แก้ไขสำเร็จแล้ว</span>
                  <span className="font-black text-emerald-900">{successCategoryCount} ครั้ง</span>
                </div>
              </div>
            </div>

            <div className="bg-[#FEF9C3] border border-[#FDE047] p-4 rounded-2xl shadow-xs text-xs text-stone-800 space-y-1.5">
              <p className="font-bold text-stone-900">💡 ข้อมูลเบื้องต้น:</p>
              <p>• <strong>แจ้งซ่อม:</strong> อุปกรณ์ในห้องโปรเจกต์พัง</p>
              <p>• <strong>แจ้งเหตุ:</strong> อุบัติเหตุหรือปัญหาด่วน</p>
              <p>• <strong>ร้องเรียน:</strong> ละเมิดกฎระเบียบหรือความไม่พอใจ</p>
            </div>
          </div>

        </div>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 space-y-6 min-w-0 flex flex-col justify-between">
          
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-[#E6E1DA] p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-[10px] font-black text-[#8A5A28] uppercase tracking-widest block mb-1">หมวดหมู่ปัจจุบัน</span>
                <h2 className="text-lg sm:text-xl font-black text-stone-900">
                  {activeTab === 'แจ้งซ่อม' && '🛠️ รายการแจ้งซ่อมอุปกรณ์'}
                  {activeTab === 'แจ้งเหตุ' && '🚨 รายการแจ้งเหตุฉุกเฉิน'}
                  {activeTab === 'ร้องเรียน' && '⚠️ รายการเรื่องร้องเรียน'}
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  {activeTab === 'แจ้งซ่อม' && 'สำหรับแจ้งอุปกรณ์ เครื่องมือ หรือสิ่งอำนวยความสะดวกที่ชำรุดภายในห้องโปรเจกต์'}
                  {activeTab === 'แจ้งเหตุ' && 'สำหรับแจ้งอุบัติเหตุ ปัญหาด่วน หรือเหตุการณ์ไม่ปกติที่เกิดขึ้น'}
                  {activeTab === 'ร้องเรียน' && 'สำหรับแจ้งความไม่พอใจ หรือผู้ที่ฝ่าฝืนละเมิดกฎระเบียบห้องโปรเจกต์'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-stone-600">ตัวกรอง:</span>
                <select
                  value={filterOption}
                  onChange={(e) => { setFilterOption(e.target.value as any); setCurrentPage(1); }}
                  className="px-3 py-2 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:border-[#8A5A28] cursor-pointer"
                >
                  <option value="all">การร้องเรียนทั้งหมด</option>
                  <option value="pending">การร้องเรียนที่รอการดำเนินการ</option>
                  <option value="success">การร้องเรียนที่ได้รับการแก้ไขแล้ว</option>
                </select>
              </div>
            </div>

            {currentReports.length === 0 ? (
              <div className="min-h-[380px] bg-white rounded-2xl border border-dashed border-[#D6CFC7] p-12 flex flex-col items-center justify-center text-center space-y-4 shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-3xl shadow-inner">
                  {activeTab === 'แจ้งซ่อม' && '🛠️'}
                  {activeTab === 'แจ้งเหตุ' && '🚨'}
                  {activeTab === 'ร้องเรียน' && '⚠️'}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-stone-800">ยังไม่มีข้อมูลในหมวดหมู่ "{activeTab}" ตามเงื่อนไขตัวกรองนี้</h4>
                  <p className="text-xs text-stone-500">หากคุณพบปัญหาหรือต้องการแจ้งเรื่อง สามารถกดปุ่มด้านล่างเพื่อสร้างรายการใหม่ได้ทันที</p>
                </div>
                <button
                  onClick={() => {
                    setModalCategory(activeTab);
                    setIsModalOpen(true);
                  }}
                  className="px-5 py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-md hover:bg-[#78481C] transition flex items-center gap-2 cursor-pointer active:scale-95 mt-2"
                >
                  <span>➕</span> แจ้ง{activeTab}ตอนนี้เลย
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentReports.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedReport(item)}
                    className="bg-white rounded-2xl border border-[#E6E1DA] p-5 shadow-xs hover:border-[#C8B8A6] transition cursor-pointer flex flex-col justify-between space-y-4 group min-h-[160px]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-stone-500 bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E6E1DA]">
                          {item.createdAtStr}
                        </span>
                        
                        {item.status === 'received' && (
                          <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold text-[10px]">
                            รับเรื่องเรียบร้อย
                          </span>
                        )}
                        {item.status === 'processing' && (
                          <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold text-[10px]">
                            กำลังดำเนินการแก้ไข
                          </span>
                        )}
                        {item.status === 'success' && (
                          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px]">
                            แก้ไขสำเร็จแล้ว ✓
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-black text-stone-900 group-hover:text-[#8A5A28] transition-colors">
                        {item.title}
                      </h4>

                      <p className="text-xs text-stone-600 line-clamp-2">
                        {item.detail}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#F3EFEA] flex items-center justify-between text-[11px] text-stone-500">
                      <span>ผู้แจ้ง: {item.reporterName}</span>
                      <span className="font-bold text-[#8A5A28] group-hover:underline">คลิกดู Tracking สถานะ →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 pb-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-2 bg-white border border-[#E6E1DA] rounded-xl text-xs font-bold text-stone-700 hover:bg-[#FAF8F5] disabled:opacity-40 cursor-pointer transition"
              >
                ← ก่อนหน้า
              </button>

              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-9 h-9 rounded-xl text-xs font-bold flex items-center justify-center transition cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-[#8A5A28] text-white shadow-sm'
                        : 'bg-white border border-[#E6E1DA] text-stone-700 hover:bg-[#FAF8F5]'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3.5 py-2 bg-white border border-[#E6E1DA] rounded-xl text-xs font-bold text-stone-700 hover:bg-[#FAF8F5] disabled:opacity-40 cursor-pointer transition"
              >
                ถัดไป →
              </button>
            </div>
          )}

        </main>
      </div>

      {/* MODAL แจ้งเรื่องใหม่ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative border border-[#E6E1DA] max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-lg font-black text-stone-900 mb-1 flex items-center gap-2">
              <span>📝</span> สร้างเรื่องแจ้งใหม่ ({modalCategory})
            </h3>
            <p className="text-xs text-stone-500 mb-4 pb-4 border-b border-[#E6E1DA]">
              กรุณากรอกรายละเอียดให้ชัดเจน พร้อมแนบรูปถ่ายประกอบไม่เกิน 3 รูป
            </p>

            <form onSubmit={handleReportSubmit} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">ประเภทการแจ้ง *</label>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:border-[#8A5A28]"
                >
                  <option value="แจ้งซ่อม">🛠️ แจ้งซ่อม (อุปกรณ์พัง/ชำรุด)</option>
                  <option value="แจ้งเหตุ">🚨 แจ้งเหตุ (อุบัติเหตุหรือปัญหาด่วน)</option>
                  <option value="ร้องเรียน">⚠️ ร้องเรียน (ไม่พอใจ/ละเมิดกฎ)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">หัวข้อเรื่อง *</label>
                <input 
                  type="text" 
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น แอร์ห้องโปรเจกต์ไม่เย็น, โต๊ะทำงานหัก" 
                  className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl text-xs font-semibold text-stone-900 focus:outline-none focus:border-[#8A5A28]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">รายละเอียดเพิ่มเติม *</label>
                <textarea 
                  rows={3}
                  required
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="ระบุสถานที่ เวลา หรือรายละเอียดอาการให้ชัดเจน..."
                  className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#E6E1DA] rounded-xl text-xs font-semibold text-stone-900 focus:outline-none focus:border-[#8A5A28]"
                />
              </div>

              <div className="flex items-center gap-2.5 bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E6E1DA]">
                <input 
                  type="checkbox" 
                  id="anonymousCheck"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-[#653E1B] focus:ring-[#653E1B] cursor-pointer"
                />
                <label htmlFor="anonymousCheck" className="text-xs font-bold text-stone-700 cursor-pointer select-none">
                  🕵️‍♂️ เปิดใช้งานโหมดไม่ระบุตัวตน
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  แนบรูปภาพประกอบ (ไม่เกิน 3 รูป)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className="flex flex-col items-center justify-center border-2 border-dashed border-[#E6E1DA] rounded-xl p-2 bg-[#FAF8F5]/60 relative min-h-[100px]">
                      {images[idx] ? (
                        <div className="relative w-full h-20 rounded-lg overflow-hidden">
                          <img src={images[idx]} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              const newImgs = [...images];
                              newImgs[idx] = '';
                              setImages(newImgs);
                            }}
                            className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 text-[9px] font-bold shadow cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-center">
                          <span className="text-lg mb-0.5 text-stone-400">📷</span>
                          <span className="text-[10px] font-bold text-stone-600">รูปที่ {idx + 1}</span>
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={(e) => handleImageChange(idx, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E6E1DA]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 text-stone-600 font-bold text-xs rounded-xl hover:bg-stone-200 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#653E1B] text-white font-bold text-xs rounded-xl hover:bg-[#523115] transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'กำลังส่งข้อมูล...' : 'ยืนยันแจ้งเรื่อง'}
                </button>
              </div>
            </form>

            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* TRACKING MODAL & CANCEL FEATURE */}
      {selectedReport && (
        <div className="fixed inset-0 bg-stone-900/55 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative border border-[#E6E1DA] max-h-[90vh] overflow-y-auto space-y-6">
            
            <div className="flex items-center justify-between border-b border-[#E6E1DA] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A5A28]">
                  {selectedReport.category} • รหัสอ้างอิง #{selectedReport.id.slice(0, 6)}
                </span>
                <h3 className="text-lg font-black text-stone-900">{selectedReport.title}</h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-stone-400 hover:text-stone-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1DA] space-y-2 text-xs">
              <p><strong>ผู้แจ้ง:</strong> {selectedReport.reporterName} {selectedReport.isAnonymous ? '(ไม่ระบุตัวตน)' : `(${selectedReport.studentId})`}</p>
              <p><strong>เวลาที่แจ้ง:</strong> {selectedReport.createdAtStr}</p>
              <p><strong>รายละเอียด:</strong> {selectedReport.detail}</p>

              {selectedReport.images && selectedReport.images.length > 0 && (
                <div className="pt-2">
                  <p className="font-bold mb-1.5">รูปภาพที่แนบมาตอนแจ้ง:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedReport.images.map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-[#E6E1DA] bg-white">
                        <img src={img} alt={`report-img-${i}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">สถานะการติดตามการดำเนินงาน (Tracking)</h4>
              
              <div className="relative flex items-center justify-between max-w-md mx-auto py-2">
                <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-stone-200 z-0"></div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${
                    ['received', 'processing', 'success'].includes(selectedReport.status) ? 'bg-[#8A5A28]' : 'bg-stone-300'
                  }`}>
                    📦
                  </div>
                  <span className="text-[10px] font-bold mt-1.5 text-stone-800">แจ้งเรื่องสำเร็จ</span>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${
                    ['received', 'processing', 'success'].includes(selectedReport.status) ? 'bg-[#8A5A28]' : 'bg-stone-300'
                  }`}>
                    📥
                  </div>
                  <span className="text-[10px] font-bold mt-1.5 text-stone-800">รับเรื่องเรียบร้อย</span>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${
                    ['processing', 'success'].includes(selectedReport.status) ? 'bg-[#8A5A28]' : 'bg-stone-300'
                  }`}>
                    ⚡
                  </div>
                  <span className="text-[10px] font-bold mt-1.5 text-stone-800">กำลังดำเนินการ</span>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${
                    selectedReport.status === 'success' ? 'bg-emerald-600' : 'bg-stone-300'
                  }`}>
                    ✓
                  </div>
                  <span className="text-[10px] font-bold mt-1.5 text-stone-800">แก้ไขสำเร็จ</span>
                </div>
              </div>

              <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1DA] space-y-3 text-xs">
                <div className="flex items-start gap-3 border-b border-[#E6E1DA] pb-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#8A5A28] mt-1 shrink-0"></div>
                  <div>
                    <p className="font-bold text-stone-900">รับเรื่องเข้าระบบเรียบร้อย</p>
                    <p className="text-[11px] text-stone-500">{selectedReport.createdAtStr} - บันทึกข้อมูลเข้าสู่ระบบสำเร็จ</p>
                  </div>
                </div>

                {selectedReport.status !== 'received' && (
                  <div className="flex items-start gap-3 border-b border-[#E6E1DA] pb-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-1 shrink-0"></div>
                    <div>
                      <p className="font-bold text-stone-900">กำลังดำเนินการแก้ไขโดยเจ้าหน้าที่</p>
                      <p className="text-[11px] text-stone-500">เจ้าหน้าที่รับทราบเรื่องและกำลังลงพื้นที่ตรวจสอบหรือแก้ไขปัญหา</p>
                    </div>
                  </div>
                )}

                {selectedReport.status === 'success' && (
                  <div className="flex items-start gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0"></div>
                    <div className="space-y-2 w-full">
                      <p className="font-bold text-emerald-800">การแก้ไขสำเร็จเรียบร้อยแล้ว</p>
                      <p className="text-[11px] text-stone-600">{selectedReport.evidenceNote || 'เจ้าหน้าที่ดำเนินการแก้ไขปัญหาเรียบร้อยครับ'}</p>
                      
                      {selectedReport.evidenceImages && selectedReport.evidenceImages.length > 0 && (
                        <div>
                          <p className="font-bold text-stone-700 mb-1 text-[11px]">📸 หลักฐานการแก้ไขสำเร็จ:</p>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedReport.evidenceImages.map((img, i) => (
                              <div key={i} className="aspect-square rounded-lg overflow-hidden border border-emerald-300 bg-white shadow-xs">
                                <img src={img} alt={`evidence-${i}`} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                {selectedReport.status === 'received' && (
                  <button
                    type="button"
                    onClick={() => handleCancelReport(selectedReport.id, selectedReport.uid, selectedReport.status)}
                    className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl hover:bg-rose-100 transition cursor-pointer"
                  >
                    ยกเลิกแจ้งเรื่องนี้
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2 bg-stone-200 text-stone-700 font-bold text-xs rounded-xl hover:bg-stone-300 cursor-pointer"
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