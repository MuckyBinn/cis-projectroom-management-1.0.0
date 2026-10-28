'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  year?: string;
  profileImage?: string;
}

// รูปพื้นหลังแบนเนอร์หน้าโปรไฟล์ — ค่าเริ่มต้นคือรูปห้องโปรเจกต์ เปลี่ยนได้ทีหลังแค่แก้ path นี้จุดเดียว
const COVER_BANNER_IMAGE = '/images/projectroom.png';

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Header: เมนู Tracking แบบ dropdown สำหรับแอดมิน (เหมือนหน้าหลัก)
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editYear, setEditYear] = useState('ปี 1');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('/images/defaultprofile.jpg');
  
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
          const data = userSnap.data() as UserProfile;
          const formattedProfile: UserProfile = {
            name: data.name || currentUser.displayName || 'ไม่ระบุชื่อ',
            studentId: data.studentId || '-',
            email: data.email || currentUser.email || '',
            role: data.role || 'student',
            year: data.year || 'ปี 1',
            profileImage: data.profileImage || currentUser.photoURL || '/images/defaultprofile.jpg',
          };
          setProfile(formattedProfile);
          setEditName(formattedProfile.name || '');
          setEditStudentId(formattedProfile.studentId === '-' ? '' : formattedProfile.studentId || '');
          setEditYear(formattedProfile.year || 'ปี 1');
          setImagePreview(formattedProfile.profileImage || '/images/defaultprofile.jpg');
        } else {
          const defaultData: UserProfile = {
            name: currentUser.displayName || 'ไม่ระบุชื่อ',
            studentId: '-',
            email: currentUser.email || '',
            role: 'student',
            year: 'ปี 1',
            profileImage: currentUser.photoURL || '/images/defaultprofile.jpg',
          };
          setProfile(defaultData);
          setEditName(defaultData.name || '');
          setEditStudentId('');
          setEditYear('ปี 1');
          setImagePreview(defaultData.profileImage || '/images/defaultprofile.jpg');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // ปิดเมนู Tracking เมื่อคลิกนอกกรอบ (เหมือนหน้าหลัก)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsTrackingOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default'); 
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo'; 
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('ไม่สามารถอัปโหลดรูปภาพได้');
    const data = await response.json();
    return data.secure_url;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!confirmPasswordInput) {
      setErrorMessage('กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยัน');
      return;
    }
    setIsSaving(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('ไม่พบข้อมูลผู้ใช้');

      const credential = EmailAuthProvider.credential(user.email, confirmPasswordInput);
      await reauthenticateWithCredential(user, credential);

      let profileImageUrl = profile?.profileImage || '/images/defaultprofile.jpg';
      if (selectedImageFile) {
        profileImageUrl = await uploadToCloudinary(selectedImageFile);
      }
      if (newPassword.trim().length >= 6) {
        await updatePassword(user, newPassword);
      }

      const userDocRef = doc(db, 'users', user.uid);
      const updatedData = {
        name: editName,
        studentId: editStudentId,
        year: profile?.role === 'student' ? editYear : '-',
        profileImage: profileImageUrl,
      };

      await updateDoc(userDocRef, updatedData);
      setProfile((prev) => (prev ? { ...prev, ...updatedData } : null));
      setIsEditModalOpen(false);
      setConfirmPasswordInput('');
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMessage('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      } else {
        setErrorMessage('เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    if (confirm('ออกจากระบบ?')) {
      try {
        await signOut(auth);
        router.replace('/preloginhomepage');
      } catch (err) {
        console.error('Logout error:', err);
      }
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

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Header — เหมือนหน้าหลักทุกจุด (โลโก้ เมนู 5 รายการ, dropdown Tracking สำหรับแอดมิน, profile pill พร้อม active state) */}
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
                  {profile?.name || 'ผู้ใช้งาน'}
                </span>
                <span className="block text-[10px] font-medium text-gray-400 tracking-wide truncate">
                  {profile?.studentId || '-'}
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

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-orange-950/[0.03] border border-orange-100/80 overflow-hidden backdrop-blur-sm">
          
          {/* Cover Banner */}
          <div className="h-40 sm:h-52 relative overflow-hidden bg-stone-900">
            <img
              src={COVER_BANNER_IMAGE}
              alt="ห้องปฏิบัติการโปรเจกต์"
              className="w-full h-full object-cover"
            />
            {/* ไล่เฉดมืดจากล่างขึ้นบน ให้ภาพกลืนเข้ากับพื้นที่โปรไฟล์ด้านล่างอย่างนุ่มนวล */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent"></div>
            {/* เคลือบสีแบรนด์บาง ๆ แทนไล่สีรุ้งแบบเดิม ให้โทนกลมกลืนกับส่วนอื่นของเว็บ */}
            <div className="absolute inset-0 bg-orange-900/10 mix-blend-multiply"></div>
            <div className="absolute inset-0 ring-1 ring-inset ring-black/10"></div>
          </div>

          <div className="px-8 pb-8 relative">
            
            {/* Profile Avatar & Header */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-14 mb-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
                
                <div className="w-28 h-28 shrink-0 relative group">
                  <img
                    src={profile?.profileImage || '/images/defaultprofile.jpg'}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-2xl border-4 border-white shadow-md bg-white aspect-square group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10"></div>
                </div>

                <div className="mb-1">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight leading-tight">{profile?.name || 'ไม่ระบุชื่อ'}</h1>
                  <p className="text-[13px] font-medium text-gray-500 mt-0.5">{profile?.email}</p>
                </div>
              </div>
              
              <button
                onClick={() => { setErrorMessage(''); setIsEditModalOpen(true); }}
                className="px-5 py-2.5 rounded-xl bg-orange-600 text-white font-semibold text-xs hover:bg-orange-700 transition shadow-md shadow-orange-600/20 active:scale-95 shrink-0 mb-1 flex items-center gap-2"
              >
                <span></span> แก้ไขข้อมูลส่วนตัว
              </button>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-orange-50/30 p-4 rounded-2xl border border-orange-100/60">
              <div className="p-3.5 bg-white rounded-xl shadow-xs border border-orange-100/40">
                <span className="block text-[11px] font-bold text-orange-600/80 uppercase tracking-wider mb-1">ชื่อ-นามสกุล</span>
                <span className="text-sm font-bold text-gray-800">{profile?.name || '-'}</span>
              </div>
              <div className="p-3.5 bg-white rounded-xl shadow-xs border border-orange-100/40">
                <span className="block text-[11px] font-bold text-orange-600/80 uppercase tracking-wider mb-1">รหัสนักศึกษา</span>
                <span className="text-sm font-bold text-gray-800 font-mono">{profile?.studentId || '-'}</span>
              </div>
              <div className="p-3.5 bg-white rounded-xl shadow-xs border border-orange-100/40">
                <span className="block text-[11px] font-bold text-orange-600/80 uppercase tracking-wider mb-1">สถานะผู้ใช้งาน</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                  {profile?.role === 'admin' ? 'อาจารย์ / ผู้ดูแลระบบ' : 'นักศึกษา'}
                </span>
              </div>
              {profile?.role === 'student' && (
                <div className="p-3.5 bg-white rounded-xl shadow-xs border border-orange-100/40">
                  <span className="block text-[11px] font-bold text-orange-600/80 uppercase tracking-wider mb-1">ชั้นปี</span>
                  <span className="text-sm font-bold text-gray-800">{profile?.year || '-'}</span>
                </div>
              )}
            </div>

            {/* ปุ่มออกจากระบบ */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 rounded-xl border border-red-200 text-red-600 font-bold text-xs hover:bg-red-50 transition-all flex items-center gap-2 active:scale-95 bg-white shadow-xs"
              >
                <span></span> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Pop-up Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-orange-100 transform transition-all">
            
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-900">แก้ไขข้อมูลส่วนตัว</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium border border-red-100 text-center">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              
              <div className="flex flex-col items-center mb-2">
                <div className="w-20 h-20 shrink-0 mb-2 relative">
                  <img 
                    src={imagePreview || '/images/defaultprofile.jpg'} 
                    alt="Preview" 
                    className="w-full h-full object-cover rounded-2xl border-2 border-orange-200 shadow-sm aspect-square" 
                  />
                </div>
                <label className="cursor-pointer text-xs font-bold text-orange-600 hover:text-orange-700 underline transition">
                  เปลี่ยนรูปภาพโปรไฟล์
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">ชื่อ-นามสกุล</label>
                <input
                  type="text" required value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs text-gray-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">รหัสนักศึกษา</label>
                <input
                  type="text" required value={editStudentId} onChange={(e) => setEditStudentId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs text-gray-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
                />
              </div>

              {profile?.role === 'student' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">ชั้นปี</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['ปี 1', 'ปี 2', 'ปี 3', 'ปี 4'].map((y) => (
                      <button
                        key={y} type="button" onClick={() => setEditYear(y)}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                          editYear === y ? 'bg-orange-600 text-white border-orange-600 shadow-sm shadow-orange-600/20' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">รหัสผ่านใหม่ <span className="font-normal text-gray-400">(เว้นว่างหากไม่เปลี่ยน)</span></label>
                <input
                  type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs text-gray-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-red-600 mb-1 ml-1">รหัสผ่านปัจจุบัน * (ยืนยันการบันทึก)</label>
                <input
                  type="password" required value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value)} placeholder="กรอกรหัสผ่านปัจจุบัน"
                  className="w-full rounded-xl border border-red-200 bg-red-50/20 px-3.5 py-2.5 text-xs text-gray-800 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 outline-none transition"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button" onClick={() => setIsEditModalOpen(false)}
                  className="w-1/3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit" disabled={isSaving}
                  className="w-2/3 py-2.5 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 disabled:opacity-50 transition shadow-md shadow-orange-600/20"
                >
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer — โทนเดียวกับหน้าหลัก */}
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