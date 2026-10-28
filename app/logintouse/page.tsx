'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
}

export default function LoginToUsePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Active Session State
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step Controllers
  const [step, setStep] = useState<'form' | 'rules' | 'checkout_confirm' | 'last_person_checklist'>('form');
  const [note, setNote] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  // Closed Popup State & Custom Last Person Modal State
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showLastPersonModal, setShowLastPersonModal] = useState(false);

  // Tracking Dropdown State for Admin
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Agreement Checkbox State
  const [isAgreed, setIsAgreed] = useState(false);

  // Last Person Checklist State
  const [checklist, setChecklist] = useState({
    light: false,
    ac: false,
    fan: false,
    trash: false,
  });
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const updateCurrentDateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'medium' }));
    };
    updateCurrentDateTime();
    const timer = setInterval(updateCurrentDateTime, 1000);

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
          profileImage: currentUser.photoURL || '/images/defaultprofile.jpg'
        };

        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          currentProfileData = {
            name: data.name || currentUser.displayName || 'ผู้ใช้งาน',
            studentId: data.studentId || '-',
            email: data.email || currentUser.email || '',
            role: data.role || 'student',
            profileImage: data.profileImage || currentUser.photoURL || '/images/defaultprofile.jpg',
          };
          setProfile(currentProfileData);
        } else {
          setProfile(currentProfileData);
        }

        const q = query(
          collection(db, 'checkins'),
          where('uid', '==', currentUser.uid),
          where('status', '==', 'active')
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0];
          setActiveSession(docData.data());
          setSessionId(docData.id);
        }
      } catch (err) {
        console.error(err);
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
      clearInterval(timer);
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [router]);

  const handleStartCheckInProcess = (e: React.FormEvent) => {
    e.preventDefault();

    const now = new Date();
    const hours = now.getHours();
    
    if (hours >= 23 || hours < 6) {
      setShowClosedModal(true);
      return;
    }

    setIsAgreed(false);
    setStep('rules');
  };

  const handleConfirmCheckIn = async () => {
    if (!isAgreed) {
      alert('กรุณากดยืนยันทำความเข้าใจและยอมรับกฎระเบียบก่อนลงชื่อเข้าใช้');
      return;
    }
    if (!profile) return;
    setIsSubmitting(true);
    try {
      const nowStr = new Date().toLocaleString('th-TH');
      
      const newDocRef = await addDoc(collection(db, 'checkins'), {
        uid: auth.currentUser?.uid,
        name: profile.name,
        studentId: profile.studentId,
        checkInTime: nowStr,
        checkOutTime: null,
        note: note || '-',
        status: 'active',
        isLastPerson: false,
        createdAt: new Date(),
      });

      setSessionId(newDocRef.id);
      alert('ลงชื่อเข้าใช้สำเร็จ บันทึกข้อมูลของวันเรียบร้อยแล้ว!');
      router.push('/checkin');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerCheckOut = () => {
    setStep('checkout_confirm');
  };

  const handleConfirmCheckOutGeneral = async () => {
    if (!sessionId) return;
    setShowLastPersonModal(true);
  };

  const handleLastPersonYes = () => {
    setShowLastPersonModal(false);
    setStep('last_person_checklist');
  };

  const handleLastPersonNo = async () => {
    setShowLastPersonModal(false);
    if (!sessionId) return;
    setIsSubmitting(true);
    try {
      const nowStr = new Date().toLocaleString('th-TH');
      const docRef = doc(db, 'checkins', sessionId);

      await updateDoc(docRef, {
        checkOutTime: nowStr,
        status: 'completed',
        isLastPerson: false,
      });

      alert('ลงชื่อออกสำเร็จเรียบร้อย!');
      router.push('/checkin');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUploadSimulation = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        urls.push(URL.createObjectURL(files[i]));
      }
      setImages((prev) => [...prev, ...urls].slice(0, 5));
    }
  };

  const handleFinalLastPersonSubmit = async () => {
    if (!checklist.light || !checklist.ac || !checklist.fan || !checklist.trash) {
      alert('กรุณาตรวจสอบความเรียบร้อย ปิดไฟ ปิดแอร์ ปิดพัดลม และทิ้งขยะให้ครบถ้วน');
      return;
    }
    if (images.length < 3) {
      alert('กรุณาถ่ายรูปหรืออัปโหลดรูปภาพยืนยันความเรียบร้อยอย่างน้อย 3 รูป');
      return;
    }

    setIsSubmitting(true);
    try {
      const nowStr = new Date().toLocaleString('th-TH');
      const docRef = doc(db, 'checkins', sessionId!);

      await updateDoc(docRef, {
        checkOutTime: nowStr,
        status: 'completed',
        isLastPerson: true,
        roomCleaned: true,
        proofImages: images,
      });

      alert('บันทึกข้อมูลคนสุดท้ายและลงชื่อออกสำเร็จ!');
      router.push('/checkin');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
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
  const isCheckInActive = pathname === '/checkin' || pathname?.includes('/logintouse');

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* HEADER */}
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
                className={`transition hover:text-orange-600 ${isCheckInActive ? 'text-orange-600 font-bold' : ''}`}
              >
                Check-in
              </Link>
              <a 
                href="https://ciseasyborrow.infinityfreeapp.com/index.php" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="transition hover:text-orange-600"
              >
                Borrow ↗
              </a>
              <Link 
                href="/keepleaveitems" 
                className={`transition hover:text-orange-600 ${pathname === '/keepleaveitems' ? 'text-orange-600 font-bold' : ''}`}
              >
                Keep
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
            className={`whitespace-nowrap hover:text-orange-600 ${isCheckInActive ? 'text-orange-600 font-bold' : ''}`}
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

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 flex flex-col justify-center">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200/80 p-6 sm:p-10 relative overflow-hidden">
          
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-100 mb-8 gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-2.5 py-1 rounded-md inline-block mb-2">
                Project Room Access
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                {activeSession ? '🚪 ระบบลงชื่อออก (Check-Out)' : '📝 ระบบลงชื่อเข้าใช้ห้องโปรเจกต์'}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                สาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ มหาวิทยาลัยขอนแก่น วิทยาเขตหนองคาย
              </p>
            </div>
            <button
              onClick={() => router.push('/checkin')}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shrink-0 self-start sm:self-auto"
            >
              ← กลับหน้าหลัก Check-in
            </button>
          </div>

          {/* Live Date Time Card */}
          <div className="mb-8 p-4 rounded-2xl bg-[#faf8f5] border border-gray-200/60 flex items-center justify-between text-xs font-medium text-gray-700 shadow-2xs">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              วันและเวลาปัจจุบัน:
            </span>
            <span className="font-bold text-gray-900">{currentTime}</span>
          </div>

          {/* STEP 1: Initial Form */}
          {!activeSession && step === 'form' && (
            <form onSubmit={handleStartCheckInProcess} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  หมายเหตุเพิ่มเติม / วัตถุประสงค์ในการเข้าใช้ <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ทำโปรเจกต์กลุ่ม, ประชุมโครงงาน, พัฒนาเว็บแอปพลิเคชัน..."
                  className="w-full rounded-2xl border border-gray-200 p-4 text-xs text-gray-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition bg-gray-50/50"
                  rows={4}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-orange-600 text-white font-bold text-xs hover:bg-orange-700 transition shadow-lg shadow-orange-600/20 active:scale-[0.99]"
                >
                  ดำเนินการต่อ (อ่านกฎระเบียบการใช้ห้อง) →
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Rules & Agreement (Post-it Style) */}
          {!activeSession && step === 'rules' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="relative w-full bg-amber-100/90 border-2 border-amber-300 p-6 sm:p-8 rounded-sm shadow-xl transform -rotate-0.5">
                {/* Post-it Tape */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-amber-200/80 border border-amber-300/60 shadow-xs"></div>
                {/* Pin Graphic */}
                <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-red-500 border border-red-700 shadow-md"></div>

                <h3 className="text-base font-extrabold text-amber-900 mb-4 flex items-center gap-2 border-b-2 border-amber-300/60 pb-3">
                  📌 กฎระเบียบและข้อปฏิบัติการใช้ห้องโปรเจกต์
                </h3>
                <ul className="space-y-3 text-xs sm:text-sm font-medium text-amber-950 list-disc list-inside leading-relaxed">
                  <li>กรุณา<strong>ลงชื่อเข้าใช้</strong>และ<strong>ลงชื่อออก</strong>ทุกครั้งเมื่อเข้าใช้ห้องโปรเจกต์</li>
                  <li>ช่วยกันดูแลและรักษาความสะอาด จัดเก็บอุปกรณ์เข้าที่เดิมหลังใช้งานเสร็จสิ้น</li>
                  <li>ห้ามนำอาหารหรือเครื่องดื่มแบบเปียกเข้ามาทานภายในห้อง</li>
                  <li>ปิดสวิตช์ไฟ เครื่องปรับอากาศ และพัดลมทุกครั้งเมื่อเป็นคนสุดท้ายที่ออกจากห้อง</li>
                </ul>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-200/60">
                <input 
                  type="checkbox" 
                  id="agree" 
                  checked={isAgreed}
                  onChange={(e) => setIsAgreed(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 w-4 h-4 mt-0.5 cursor-pointer shrink-0" 
                />
                <label htmlFor="agree" className="text-xs font-bold text-gray-800 cursor-pointer select-none leading-relaxed">
                  ฉันได้อ่าน ทำความเข้าใจ และยินยอมปฏิบัติตามกฎระเบียบข้อบังคับในการใช้ห้องปฏิบัติการโปรเจกต์อย่างเคร่งครัด
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="w-1/3 py-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
                >
                  ← ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={!isAgreed || isSubmitting}
                  onClick={handleConfirmCheckIn}
                  className="w-2/3 py-3 rounded-xl bg-orange-600 text-white font-bold text-xs hover:bg-orange-700 transition shadow-md shadow-orange-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'กำลังบันทึกข้อมูล...' : 'กดยืนยัน เริ่มลงชื่อเข้าใช้งานห้อง'}
                </button>
              </div>
            </div>
          )}

          {/* ACTIVE SESSION VIEW (Ready to Check-out) */}
          {activeSession && step === 'form' && (
            <div className="space-y-6 text-center py-6 animate-in fade-in duration-300">
              <div className="p-6 bg-emerald-50/80 text-emerald-900 rounded-2xl border border-emerald-200 shadow-xs">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-lg mx-auto mb-3 font-bold">
                  ✓
                </div>
                <p className="text-xs font-bold text-emerald-800 mb-1">คุณได้ลงชื่อเข้าใช้ห้องโปรเจกต์อยู่ขณะนี้</p>
                <p className="text-xs text-emerald-700">เวลาที่เช็คอิน: <span className="font-extrabold">{activeSession.checkInTime}</span></p>
                {activeSession.note && activeSession.note !== '-' && (
                  <p className="text-xs text-emerald-600 mt-2 italic">หมายเหตุ: "{activeSession.note}"</p>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={handleTriggerCheckOut}
                  className="px-8 py-3.5 rounded-2xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition shadow-lg shadow-red-600/20 active:scale-[0.99]"
                >
                  🚪 กดลงชื่อออก (Check-Out)
                </button>
              </div>
            </div>
          )}

          {/* CHECKOUT CONFIRM STEP */}
          {step === 'checkout_confirm' && (
            <div className="space-y-6 text-center py-4 animate-in fade-in duration-300">
              <div className="p-6 bg-orange-50 border border-orange-200 rounded-2xl text-xs font-semibold text-orange-900 leading-relaxed shadow-xs">
                ⚠️ <span className="font-extrabold">คำเตือนการลงชื่อออก:</span> กรุณาเก็บสัมภาระ เก็บขยะ และตรวจสอบความเรียบร้อยของห้องให้เรียบร้อยก่อนกดยืนยัน
              </div>

              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => setStep('form')}
                  className="px-6 py-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
                >
                  ยกเลิก
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={handleConfirmCheckOutGeneral}
                  className="px-6 py-3 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition shadow-md shadow-red-600/20"
                >
                  {isSubmitting ? 'กำลังดำเนินการ...' : 'กดยืนยัน ลงชื่อออก'}
                </button>
              </div>
            </div>
          )}

          {/* LAST PERSON CHECKLIST STEP */}
          {step === 'last_person_checklist' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 text-center shadow-xs">
                🚨 คุณแสดงตัวว่าเป็นคนสุดท้ายของวัน! กรุณาตรวจสอบอุปกรณ์ ปิดไฟ ปิดแอร์ และอัปโหลดรูปภาพยืนยัน
              </div>

              <div className="space-y-3 bg-gray-50/80 p-5 rounded-2xl border border-gray-200">
                <label className="flex items-center gap-3 text-xs font-bold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.light}
                    onChange={(e) => setChecklist({ ...checklist, light: e.target.checked })}
                    className="rounded border-gray-300 text-red-600 w-4 h-4 cursor-pointer"
                  />
                  ตรวจสอบและปิดไฟห้องเรียบร้อยแล้ว
                </label>
                <label className="flex items-center gap-3 text-xs font-bold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.ac}
                    onChange={(e) => setChecklist({ ...checklist, ac: e.target.checked })}
                    className="rounded border-gray-300 text-red-600 w-4 h-4 cursor-pointer"
                  />
                  ตรวจสอบและปิดแอร์ห้องเรียบร้อยแล้ว
                </label>
                <label className="flex items-center gap-3 text-xs font-bold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.fan}
                    onChange={(e) => setChecklist({ ...checklist, fan: e.target.checked })}
                    className="rounded border-gray-300 text-red-600 w-4 h-4 cursor-pointer"
                  />
                  ตรวจสอบและปิดพัดลมเรียบร้อยแล้ว
                </label>
                <label className="flex items-center gap-3 text-xs font-bold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.trash}
                    onChange={(e) => setChecklist({ ...checklist, trash: e.target.checked })}
                    className="rounded border-gray-300 text-red-600 w-4 h-4 cursor-pointer"
                  />
                  ทิ้งขยะและเคลียร์พื้นที่รอบตัวสะอาดเรียบร้อยแล้ว
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  📸 อัปโหลดรูปภาพยืนยันความเรียบร้อย <span className="text-red-600">(บังคับขั้นต่ำ 3 รูป)</span> [ปัจจุบัน: {images.length}/3 รูป]
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUploadSimulation}
                  className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer border border-gray-200 rounded-xl p-2 bg-gray-50/50"
                />
                <div className="flex gap-2.5 mt-3 flex-wrap">
                  {images.map((img, idx) => (
                    <img key={idx} src={img} alt="proof" className="w-16 h-16 object-cover rounded-xl border border-gray-200 shadow-2xs" />
                  ))}
                </div>
              </div>

              <button
                disabled={isSubmitting}
                onClick={handleFinalLastPersonSubmit}
                className="w-full py-3.5 rounded-2xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการปิดห้อง (บันทึกสถานะคนสุดท้ายและลงชื่อออก)'}
              </button>
            </div>
          )}

        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#2b2623] text-gray-300 py-6 text-center text-xs border-t border-gray-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-bold text-white mb-1">Smart CIS KKU</p>
          <p className="text-gray-400">
            ©โปรเจกต์รายวิชาโครงงานทางวิทยาการและระเบียบวิธีวิจัยทางวิทยาการคอมพิวเตอร์และสารสนเทศ ระบบสารสนเทศเพื่อการจัดการห้องปฏิบัติการ สาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ มหาวิทยาลัยขอนแก่น
          </p>
        </div>
      </footer>

      {/* CLOSED MODAL */}
      {showClosedModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl relative border border-gray-100 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 shadow-inner">
              ⚠️
            </div>
            <h3 className="text-base font-black text-gray-900 mb-2">
              ขออภัย
            </h3>
            <p className="text-xs font-semibold text-gray-600 leading-relaxed mb-6">
              ขณะนี้ห้องโปรเจกต์ยังไม่เปิดให้บริการ<br />
              <span className="text-red-600 font-bold">(ปิดช่วง 23.00 - 06.00 น.)</span>
            </p>
            <button
              onClick={() => setShowClosedModal(false)}
              className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-xs hover:bg-gray-800 transition shadow-md"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* CUSTOM LAST PERSON MODAL */}
      {showLastPersonModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative border border-gray-100 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 shadow-inner">
              🚪
            </div>
            <h3 className="text-base font-black text-gray-900 mb-2">
              ยืนยันสถานะการออกจากห้อง
            </h3>
            <p className="text-xs font-semibold text-gray-600 leading-relaxed mb-6">
              คุณเป็นคนสุดท้ายที่จะออกจากห้องในวันนี้ใช่หรือไม่?<br />
              <span className="text-gray-400 text-[11px]">(หากใช่ ระบบจะพาไปหน้าตรวจสอบและปิดไฟ/แอร์/พัดลม)</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleLastPersonNo}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 transition shadow-xs"
              >
                ไม่ใช่
              </button>
              <button
                onClick={handleLastPersonYes}
                className="flex-1 py-3 rounded-xl bg-orange-600 text-white font-bold text-xs hover:bg-orange-700 transition shadow-md"
              >
                ใช่, ฉันเป็นคนสุดท้าย
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}