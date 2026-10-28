'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

/* ===================== Types ===================== */

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
  year?: string | number;
}

interface EventItem {
  id: string;
  title: string;
  detail: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24 ชม.)
  endTime: string; // HH:MM (24 ชม.)
  images: string[];
  createdAtMs: number;
  createdByName: string;
}

type AnnouncementType = 'lost' | 'return' | 'urgent' | 'survey' | 'general';

interface AnnouncementItem {
  id: string;
  type: AnnouncementType;
  title: string;
  detail: string;
  images: string[];
  deadlineMs?: number; // ใช้กับประกาศแจ้งนำสิ่งของคืน
  surveyUrl?: string; // ใช้กับแบบสอบถาม
  createdAtMs: number;
  createdByName: string;
}

/* ===================== Constants ===================== */

const MAX_EVENT_IMAGES = 10;
const MAX_ANNOUNCE_IMAGES = 5;
const SLIDE_INTERVAL_MS = 5000; // สไลด์โชว์ทุก 5 วินาที
const RETURN_DEADLINE_DAYS = 7; // เดดไลน์นำสิ่งของคืน 7 วัน
const MAX_PAYLOAD_CHARS = 900000; // Firestore จำกัด 1MB ต่อเอกสาร เผื่อพื้นที่ไว้นิดหน่อย

const ANNOUNCE_TYPES: Record<
  AnnouncementType,
  { label: string; icon: string; badge: string; hint: string }
> = {
  lost: {
    label: 'ประกาศตามหา',
    icon: '🔍',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    hint: 'ตามหาสิ่งของ/เจ้าของสิ่งของที่พบภายในห้องโปรเจกต์',
  },
  return: {
    label: 'แจ้งนำสิ่งของคืน',
    icon: '📦',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    hint: `ให้นำสิ่งของมารับคืนภายใน ${RETURN_DEADLINE_DAYS} วัน ก่อนตกเป็นของสาขา`,
  },
  urgent: {
    label: 'กิจกรรมด่วน',
    icon: '🚨',
    badge: 'bg-red-50 text-red-700 border-red-200',
    hint: 'กิจกรรมหรือเรื่องเร่งด่วนที่ต้องแจ้งให้ทราบทันที',
  },
  survey: {
    label: 'แบบสอบถาม',
    icon: '📝',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hint: 'แนบลิงก์แบบสอบถามให้ผู้ใช้งานกดเข้าไปตอบ',
  },
  general: {
    label: 'ประกาศทั่วไป',
    icon: '📢',
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    hint: 'ประกาศอื่น ๆ จากผู้ดูแลระบบ',
  },
};

// สีกระดาษ post-it ของแต่ละประเภทประกาศ
const POSTIT_COLORS: Record<AnnouncementType, string> = {
  lost: 'bg-sky-200 text-sky-900',
  return: 'bg-orange-200 text-orange-900',
  urgent: 'bg-rose-300 text-rose-950',
  survey: 'bg-emerald-200 text-emerald-900',
  general: 'bg-yellow-200 text-yellow-900',
};

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 - 23
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0 - 59

/* ===================== Helpers ===================== */

const pad2 = (n: number | string) => String(n).padStart(2, '0');

// "09:05" -> "9.05"  (รูปแบบ 0.00 - 23.59 ไม่มี AM/PM)
const formatTime = (t: string) => {
  const [h, m] = t.split(':');
  return `${parseInt(h, 10)}.${m}`;
};

const formatDateTh = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateTimeTh = (ms: number) => {
  const d = new Date(ms);
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} ${d.getHours()}.${pad2(d.getMinutes())} น.`;
};

// "วันนี้" / "พรุ่งนี้" / "อีก N วัน" / วันที่แบบสั้น
const dayLabel = (targetMs: number, nowMs: number) => {
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

const eventStartMs = (e: EventItem) => new Date(`${e.date}T${e.startTime}:00`).getTime();
const eventEndMs = (e: EventItem) => new Date(`${e.date}T${e.endTime}:00`).getTime();

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ย่อรูปเป็น base64 (เหมือนหน้า report) เพื่อให้เก็บใน Firestore ได้
const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('image failed'));
      img.onload = () => {
        const MAX = 720;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) {
            height *= MAX / width;
            width = MAX;
          }
        } else if (height > MAX) {
          width *= MAX / height;
          height = MAX;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

const describeRemaining = (deadlineMs: number, now: number) => {
  const diff = deadlineMs - now;
  if (diff <= 0) return { expired: true, text: 'หมดเวลาแล้ว — สิ่งของตกเป็นของสาขา' };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return { expired: false, text: `เหลืออีก ${days} วัน ${hours} ชม.` };
  if (hours > 0) return { expired: false, text: `เหลืออีก ${hours} ชม. ${mins} นาที` };
  return { expired: false, text: `เหลืออีก ${mins} นาที` };
};

/* ===================== Slideshow ===================== */

function Slideshow({
  images,
  aspect = 'aspect-[16/9]',
  placeholder = '🖼️',
}: {
  images: string[];
  aspect?: string;
  placeholder?: string;
}) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  // เปลี่ยนสไลด์ทุก 5 วินาที (เฉพาะเมื่อมีมากกว่า 1 รูป) — รีเซ็ตตัวนับเมื่อกดเปลี่ยนเอง
  useEffect(() => {
    if (images.length <= 1) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % images.length), SLIDE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, images.length]);

  const go = (e: React.MouseEvent, next: number) => {
    e.stopPropagation();
    setIndex((next + images.length) % images.length);
  };

  if (images.length === 0) {
    return (
      <div
        className={`${aspect} w-full bg-gradient-to-br from-[#FAF8F5] to-[#F3EFEA] flex items-center justify-center text-4xl border-b border-[#E6E1DA]`}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <div
      className={`relative ${aspect} w-full overflow-hidden bg-stone-900 border-b border-[#E6E1DA] group/slide`}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null || images.length <= 1) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) setIndex((i) => (i + (dx < 0 ? 1 : images.length - 1)) % images.length);
      }}
    >
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`slide-${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white text-sm flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/slide:opacity-100 transition cursor-pointer"
            aria-label="รูปก่อนหน้า"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => go(e, index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white text-sm flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/slide:opacity-100 transition cursor-pointer"
            aria-label="รูปถัดไป"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                type="button"
                key={i}
                onClick={(e) => go(e, i)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
                aria-label={`ไปรูปที่ ${i + 1}`}
              />
            ))}
          </div>
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/50 text-white text-[10px] font-bold">
            {index + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
}

/* ===================== Page ===================== */

export default function NewsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // popups รายละเอียด
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementItem | null>(null);

  // ฟอร์มเพิ่มกิจกรรม
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDetail, setEDetail] = useState('');
  const [eDate, setEDate] = useState(todayStr());
  const [eStartH, setEStartH] = useState(9);
  const [eStartM, setEStartM] = useState(0);
  const [eEndH, setEEndH] = useState(12);
  const [eEndM, setEEndM] = useState(0);
  const [eImages, setEImages] = useState<string[]>([]);

  // ฟอร์มเพิ่มประกาศ
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [aType, setAType] = useState<AnnouncementType>('general');
  const [aTitle, setATitle] = useState('');
  const [aDetail, setADetail] = useState('');
  const [aSurveyUrl, setASurveyUrl] = useState('');
  const [aImages, setAImages] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/preloginhomepage');
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const base: UserProfile = {
          name: currentUser.displayName || 'ผู้ใช้งาน',
          studentId: '-',
          email: currentUser.email || '',
          role: 'student',
          profileImage: currentUser.photoURL || '/images/defaultprofile.jpg',
          year: '-',
        };
        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          setProfile({
            name: data.name || base.name,
            studentId: data.studentId || '-',
            email: data.email || base.email,
            role: data.role || 'student',
            profileImage: data.profileImage || base.profileImage,
            year: data.year || '-',
          });
        } else {
          setProfile(base);
        }

        const [eventSnap, announceSnap] = await Promise.all([
          getDocs(collection(db, 'events')),
          getDocs(collection(db, 'announcements')),
        ]);

        const loadedEvents: EventItem[] = [];
        eventSnap.forEach((d) => {
          const v = d.data() as any;
          loadedEvents.push({
            id: d.id,
            title: v.title || 'ไม่มีชื่อกิจกรรม',
            detail: v.detail || '',
            date: v.date || todayStr(),
            startTime: v.startTime || '00:00',
            endTime: v.endTime || '23:59',
            images: v.images || [],
            createdAtMs: v.createdAtMs || 0,
            createdByName: v.createdByName || '-',
          });
        });
        setEvents(loadedEvents);

        const loadedAnnouncements: AnnouncementItem[] = [];
        announceSnap.forEach((d) => {
          const v = d.data() as any;
          loadedAnnouncements.push({
            id: d.id,
            type: (v.type as AnnouncementType) || 'general',
            title: v.title || 'ไม่มีหัวข้อ',
            detail: v.detail || '',
            images: v.images || [],
            deadlineMs: v.deadlineMs,
            surveyUrl: v.surveyUrl,
            createdAtMs: v.createdAtMs || 0,
            createdByName: v.createdByName || '-',
          });
        });
        loadedAnnouncements.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setAnnouncements(loadedAnnouncements);
      } catch (err) {
        console.error('Error loading news:', err);
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

  // อัปเดตเวลาปัจจุบันทุก 1 นาที สำหรับนับถอยหลังเดดไลน์และกรองกิจกรรมที่จบแล้ว
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  /* ---------- image handling ---------- */

  const handlePickImages = async (
    e: React.ChangeEvent<HTMLInputElement>,
    current: string[],
    setter: (v: string[]) => void,
    max: number
  ) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = max - current.length;
    if (remaining <= 0) {
      alert(`แนบรูปได้ไม่เกิน ${max} รูป`);
      return;
    }
    if (files.length > remaining) {
      alert(`แนบรูปได้ไม่เกิน ${max} รูป ระบบจะเพิ่มให้ ${remaining} รูปแรกเท่านั้น`);
    }

    setIsProcessingImages(true);
    try {
      const results = await Promise.all(files.slice(0, remaining).map(compressImage));
      setter([...current, ...results]);
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถอ่านรูปภาพบางไฟล์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsProcessingImages(false);
    }
  };

  /* ---------- submit: event ---------- */

  const resetEventForm = () => {
    setETitle('');
    setEDetail('');
    setEDate(todayStr());
    setEStartH(9);
    setEStartM(0);
    setEEndH(12);
    setEEndM(0);
    setEImages([]);
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!eTitle.trim() || !eDetail.trim() || !eDate) {
      alert('กรุณากรอกชื่อกิจกรรม รายละเอียด และวันที่ให้ครบถ้วน');
      return;
    }
    if (eEndH * 60 + eEndM <= eStartH * 60 + eStartM) {
      alert('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น');
      return;
    }
    if (eImages.join('').length > MAX_PAYLOAD_CHARS) {
      alert('ขนาดรูปภาพรวมใหญ่เกินไป กรุณาลดจำนวนรูปหรือเลือกรูปที่มีขนาดเล็กลง');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: eTitle.trim(),
        detail: eDetail.trim(),
        date: eDate,
        startTime: `${pad2(eStartH)}:${pad2(eStartM)}`,
        endTime: `${pad2(eEndH)}:${pad2(eEndM)}`,
        images: eImages,
        createdAtMs: Date.now(),
        createdByName: profile.name || 'ผู้ดูแลระบบ',
      };
      const ref = await addDoc(collection(db, 'events'), payload);
      setEvents((prev) => [...prev, { id: ref.id, ...payload }]);
      resetEventForm();
      setIsEventModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเพิ่มกิจกรรม กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------- submit: announcement ---------- */

  const resetAnnounceForm = () => {
    setAType('general');
    setATitle('');
    setADetail('');
    setASurveyUrl('');
    setAImages([]);
  };

  const handleAnnounceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!aTitle.trim() || !aDetail.trim()) {
      alert('กรุณากรอกหัวข้อและรายละเอียดประกาศให้ครบถ้วน');
      return;
    }
    if (aType === 'survey' && !/^https?:\/\//i.test(aSurveyUrl.trim())) {
      alert('กรุณาใส่ลิงก์แบบสอบถามที่ขึ้นต้นด้วย http:// หรือ https://');
      return;
    }
    if (aImages.join('').length > MAX_PAYLOAD_CHARS) {
      alert('ขนาดรูปภาพรวมใหญ่เกินไป กรุณาลดจำนวนรูปหรือเลือกรูปที่มีขนาดเล็กลง');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdAtMs = Date.now();
      const payload: Omit<AnnouncementItem, 'id'> = {
        type: aType,
        title: aTitle.trim(),
        detail: aDetail.trim(),
        images: aImages,
        createdAtMs,
        createdByName: profile.name || 'ผู้ดูแลระบบ',
        ...(aType === 'return' ? { deadlineMs: createdAtMs + RETURN_DEADLINE_DAYS * 86400000 } : {}),
        ...(aType === 'survey' ? { surveyUrl: aSurveyUrl.trim() } : {}),
      };
      const ref = await addDoc(collection(db, 'announcements'), payload);
      setAnnouncements((prev) => [{ id: ref.id, ...payload }, ...prev]);
      resetAnnounceForm();
      setIsAnnounceModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเพิ่มประกาศ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------- delete ---------- */

  const handleDeleteEvent = async (item: EventItem) => {
    if (!confirm(`ต้องการลบกิจกรรม "${item.title}" ใช่หรือไม่?`)) return;
    try {
      await deleteDoc(doc(db, 'events', item.id));
      setEvents((prev) => prev.filter((x) => x.id !== item.id));
      setSelectedEvent(null);
    } catch (err) {
      console.error(err);
      alert('ลบกิจกรรมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleDeleteAnnouncement = async (item: AnnouncementItem) => {
    if (!confirm(`ต้องการลบประกาศ "${item.title}" ใช่หรือไม่?`)) return;
    try {
      await deleteDoc(doc(db, 'announcements', item.id));
      setAnnouncements((prev) => prev.filter((x) => x.id !== item.id));
      setSelectedAnnouncement(null);
    } catch (err) {
      console.error(err);
      alert('ลบประกาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  /* ---------- derived ---------- */

  const isAdmin = profile?.role === 'admin';
  const isTrackingActive = pathname?.startsWith('/tracking') || pathname?.startsWith('/admin');

  const upcomingEvents = events
    .filter((ev) => eventEndMs(ev) >= now)
    .sort((a, b) => eventStartMs(a) - eventStartMs(b));
  const pastEvents = events
    .filter((ev) => eventEndMs(ev) < now)
    .sort((a, b) => eventStartMs(b) - eventStartMs(a));
  const visibleEvents = showPastEvents ? [...upcomingEvents, ...pastEvents] : upcomingEvents;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-[#E6E1DA] bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:border-[#8A5A28] focus:outline-none focus:ring-1 focus:ring-[#8A5A28]';
  const selectCls =
    'rounded-xl border border-[#E6E1DA] bg-white px-2.5 py-2.5 text-sm font-semibold text-stone-900 focus:border-[#8A5A28] focus:outline-none focus:ring-1 focus:ring-[#8A5A28] cursor-pointer';

  // ตัวเลือกรูปภาพ (ใช้ซ้ำทั้งฟอร์มกิจกรรมและประกาศ)
  const renderImagePicker = (
    images: string[],
    setter: (v: string[]) => void,
    max: number,
    inputId: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-stone-800">
          รูปภาพ <span className="font-medium text-stone-400">(ไม่บังคับ · สูงสุด {max} รูป)</span>
        </label>
        <span className="text-[11px] font-bold text-stone-500">
          {images.length}/{max}
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {images.map((src, i) => (
          <div
            key={i}
            className="relative aspect-square rounded-lg overflow-hidden border border-[#E6E1DA] bg-white"
          >
            <img src={src} alt={`preview-${i}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => setter(images.filter((_, idx) => idx !== i))}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-red-600 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer"
              aria-label="ลบรูป"
            >
              ✕
            </button>
          </div>
        ))}
        {images.length < max && (
          <label
            htmlFor={inputId}
            className="aspect-square rounded-lg border-2 border-dashed border-[#D6CFC7] bg-[#FAF8F5] hover:bg-[#F3EFEA] hover:border-[#8A5A28] text-stone-500 flex flex-col items-center justify-center text-[10px] font-bold cursor-pointer transition"
          >
            <span className="text-lg leading-none">{isProcessingImages ? '…' : '＋'}</span>
            <span>{isProcessingImages ? 'กำลังประมวลผล' : 'เพิ่มรูป'}</span>
          </label>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handlePickImages(e, images, setter, max)}
      />
    </div>
  );

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

      {/* BODY */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">
        {/* GRID หลัก: ซ้าย = แบนเนอร์ + เนื้อหา / ขวา = Sidebar (เริ่มบนสุดเสมอกับแบนเนอร์) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* คอลัมน์ซ้าย */}
          <div className="xl:col-span-9 min-w-0 space-y-6">
            {/* Page title */}
        <div className="bg-white rounded-2xl border border-[#E6E1DA] p-5 sm:p-6 shadow-xs">
          <span className="text-[10px] font-black text-[#8A5A28] uppercase tracking-widest block mb-1">
            News &amp; Announcements
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900">📰 ข่าวสารและประกาศจากห้องโปรเจกต์</h1>
          <p className="text-xs text-stone-500 mt-1">
            ติดตามกิจกรรมที่กำลังจะมาถึงและประกาศสำคัญจากผู้ดูแลระบบได้ที่นี่
          </p>
        </div>


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ===== Section 1: กิจกรรมที่กำลังจะมาถึง ===== */}
        <section className="space-y-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block mb-0.5">
                Upcoming Events
              </span>
              <h2 className="text-lg sm:text-xl font-black text-stone-900">🎉 กิจกรรมที่กำลังจะมาถึง</h2>
            </div>

            <div className="flex items-center justify-end gap-3 flex-wrap shrink-0">
              {isAdmin && pastEvents.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPastEvents}
                    onChange={(e) => setShowPastEvents(e.target.checked)}
                    className="accent-[#8A5A28]"
                  />
                  รวมที่จบแล้ว ({pastEvents.length})
                </label>
              )}
              {isAdmin && (
                <button
                  onClick={() => setIsEventModalOpen(true)}
                  title="เพิ่มกิจกรรม"
                  aria-label="เพิ่มกิจกรรม"
                  className="w-10 h-10 rounded-full bg-[#8A5A28] text-white text-2xl leading-none font-light shadow-md hover:bg-[#78481C] transition flex items-center justify-center cursor-pointer active:scale-95"
                >
                  +
                </button>
              )}
            </div>
          </div>

          {visibleEvents.length === 0 ? (
            <div className="min-h-[220px] bg-white rounded-2xl border border-dashed border-[#D6CFC7] p-10 flex flex-col items-center justify-center text-center space-y-2 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-2xl">
                📅
              </div>
              <h4 className="text-sm font-black text-stone-800">ยังไม่มีกิจกรรมที่กำลังจะมาถึง</h4>
              <p className="text-xs text-stone-500">
                {isAdmin ? 'กดปุ่ม + ด้านบนเพื่อเพิ่มกิจกรรมใหม่' : 'โปรดติดตามกิจกรรมใหม่ ๆ จากผู้ดูแลระบบ'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {visibleEvents.map((ev) => {
                const isPast = eventEndMs(ev) < now;
                const isToday = ev.date === todayStr();
                return (
                  <div
                    key={ev.id}
                    className={`bg-white rounded-2xl border border-[#E6E1DA] shadow-xs hover:border-[#C8B8A6] transition overflow-hidden flex flex-col ${
                      isPast ? 'opacity-60' : ''
                    }`}
                  >
                    <Slideshow key={ev.id} images={ev.images} placeholder="🎉" />

                    <div className="p-5 flex flex-col flex-1 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-stone-600 bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E6E1DA]">
                          📅 {formatDateTh(ev.date)}
                        </span>
                        <span className="text-[10px] font-bold text-stone-600 bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E6E1DA]">
                          🕒 {formatTime(ev.startTime)} - {formatTime(ev.endTime)} น.
                        </span>
                        {isToday && !isPast && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            วันนี้
                          </span>
                        )}
                        {isPast && (
                          <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                            จบแล้ว
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-black text-stone-900 leading-snug line-clamp-2">{ev.title}</h3>

                      {/* แสดงรายละเอียดแค่ 4 บรรทัด */}
                      <p className="text-xs text-stone-600 leading-relaxed line-clamp-4 whitespace-pre-line break-words">
                        {ev.detail}
                      </p>

                      <div className="mt-auto pt-3 border-t border-[#E6E1DA] flex items-center justify-between gap-2">
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          className="px-4 py-2 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition cursor-pointer active:scale-95"
                        >
                          รายละเอียดเพิ่มเติม
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteEvent(ev)}
                            className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                          >
                            🗑️ ลบ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Section 2: แจ้งเตือนสำหรับห้องโปรเจกต์ ===== */}
        <section className="space-y-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block mb-0.5">
                Project Room Notices
              </span>
              <h2 className="text-lg sm:text-xl font-black text-stone-900">🔔 แจ้งเตือนสำหรับห้องโปรเจกต์</h2>
            </div>
            {isAdmin && (
              <button
                onClick={() => setIsAnnounceModalOpen(true)}
                title="เพิ่มประกาศ"
                aria-label="เพิ่มประกาศ"
                className="w-10 h-10 rounded-full bg-[#8A5A28] text-white text-2xl leading-none font-light shadow-md hover:bg-[#78481C] transition flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
              >
                +
              </button>
            )}
          </div>

          {announcements.length === 0 ? (
            <div className="min-h-[220px] bg-white rounded-2xl border border-dashed border-[#D6CFC7] p-10 flex flex-col items-center justify-center text-center space-y-2 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#FAF8F5] border border-[#E6E1DA] flex items-center justify-center text-2xl">
                📢
              </div>
              <h4 className="text-sm font-black text-stone-800">ยังไม่มีประกาศในขณะนี้</h4>
              <p className="text-xs text-stone-500">
                {isAdmin ? 'กดปุ่ม + ด้านบนเพื่อเพิ่มประกาศใหม่' : 'เมื่อมีประกาศใหม่จากผู้ดูแลระบบจะแสดงที่นี่'}
              </p>
            </div>
          ) : (
            <div className="space-y-5 pt-4">
              {announcements.map((an) => {
                const meta = ANNOUNCE_TYPES[an.type] || ANNOUNCE_TYPES.general;
                const remaining =
                  an.type === 'return' && an.deadlineMs ? describeRemaining(an.deadlineMs, now) : null;
                return (
                  <div key={an.id} className="relative">
                    {/* ป้ายประเภท แบบ post-it แปะตรงมุม */}
                    <div
                      className={`absolute -top-2 -right-1.5 z-10 px-3.5 pt-2 pb-1.5 rounded-sm text-[11px] font-black shadow-md rotate-3 select-none ${POSTIT_COLORS[an.type] || POSTIT_COLORS.general}`}
                    >
                      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-9 h-3 bg-white/60 border border-white/70 shadow-xs -rotate-2" />
                      {meta.icon} {meta.label}
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E6E1DA] shadow-xs hover:border-[#C8B8A6] transition flex gap-4 p-3 sm:p-4">
                      {/* รูป */}
                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-[#FAF8F5] border border-[#E6E1DA]">
                        {an.images[0] ? (
                          <img src={an.images[0]} alt={an.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl">{meta.icon}</div>
                        )}
                        {an.images.length > 1 && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-bold">
                            🖼 {an.images.length}
                          </span>
                        )}
                      </div>

                      {/* รายละเอียด */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-stone-400 pr-20">{formatDateTimeTh(an.createdAtMs)}</span>
                        <h3 className="text-sm sm:text-base font-black text-stone-900 leading-snug line-clamp-2 break-words">
                          {an.title}
                        </h3>

                        {remaining && (
                          <div
                            className={`self-start px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                              remaining.expired
                                ? 'bg-red-50 border-red-200 text-red-700'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}
                          >
                            ⏳ {remaining.text}
                          </div>
                        )}

                        <div className="mt-auto pt-1 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setSelectedAnnouncement(an)}
                              className="px-3.5 py-1.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition cursor-pointer active:scale-95"
                            >
                              ดูเพิ่มเติม
                            </button>
                            {an.type === 'survey' && an.surveyUrl && (
                              <a
                                href={an.surveyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3.5 py-1.5 bg-[#FAF8F5] text-stone-800 border border-[#E6E1DA] font-bold text-xs rounded-xl hover:bg-[#F3EFEA] transition active:scale-95"
                              >
                                ทำแบบสอบถาม ↗
                              </a>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteAnnouncement(an)}
                              className="px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                            >
                              🗑️ ลบ
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
            </div>
          </div>

          {/* คอลัมน์ขวา (Sidebar) */}
          <aside className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4 items-start">
            <div className="bg-white rounded-2xl border border-[#E6E1DA] p-4 sm:p-5 shadow-xs space-y-3">
              <div>
                <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block mb-0.5">Summary</span>
                <h4 className="text-xs sm:text-sm font-black text-stone-900">สรุปภาพรวมข่าวสาร</h4>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1DA]">
                  <span className="text-stone-600 font-medium">กิจกรรมที่กำลังจะมาถึง</span>
                  <span className="font-black text-stone-900">{upcomingEvents.length} รายการ</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1DA]">
                  <span className="text-stone-600 font-medium">ประกาศทั้งหมด</span>
                  <span className="font-black text-stone-900">{announcements.length} รายการ</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-red-50/60 rounded-xl border border-red-200">
                  <span className="text-red-800 font-medium">กิจกรรมด่วน</span>
                  <span className="font-black text-red-900">{announcements.filter((a) => a.type === 'urgent').length} รายการ</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50/60 rounded-xl border border-amber-200">
                  <span className="text-amber-800 font-medium">รอนำสิ่งของคืน</span>
                  <span className="font-black text-amber-900">
                    {announcements.filter((a) => a.type === 'return' && a.deadlineMs && a.deadlineMs > now).length} รายการ
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E6E1DA] p-4 sm:p-5 shadow-xs space-y-2.5">
              <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block">Next Event</span>
              <h4 className="text-xs sm:text-sm font-black text-stone-900">กิจกรรมถัดไป</h4>
              {upcomingEvents[0] ? (
                <button
                  onClick={() => setSelectedEvent(upcomingEvents[0])}
                  className="w-full text-left p-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1DA] hover:bg-[#F3EFEA] transition cursor-pointer space-y-1"
                >
                  <p className="text-xs font-black text-stone-900 line-clamp-2">{upcomingEvents[0].title}</p>
                  <p className="text-[11px] text-stone-600">📅 {formatDateTh(upcomingEvents[0].date)}</p>
                  <p className="text-[11px] text-stone-600">
                    🕒 {formatTime(upcomingEvents[0].startTime)} - {formatTime(upcomingEvents[0].endTime)} น.
                  </p>
                </button>
              ) : (
                <p className="text-xs text-stone-500">ยังไม่มีกิจกรรมถัดไป</p>
              )}
            </div>

            {/* แจ้งเตือนที่จะมาถึงเร็ว ๆ นี้ — ครบทุกหัวข้อ แสดงรายการที่ใกล้ที่สุดของแต่ละหัวข้อ */}
            {(() => {
              interface Reminder {
                key: string;
                image?: string;
                title: string;
                when: string;
                tone: 'normal' | 'warn' | 'danger';
                onClick: () => void;
              }
              interface Slot {
                key: string;
                icon: string;
                label: string;
                chipCls: string;
                item: Reminder | null;
              }

              const fromAnnouncement = (an: AnnouncementItem, when: string, tone: Reminder['tone']): Reminder => ({
                key: an.id,
                image: an.images[0],
                title: an.title,
                when,
                tone,
                onClick: () => setSelectedAnnouncement(an),
              });

              const latestOf = (t: AnnouncementType) => announcements.find((a) => a.type === t);
              const nextReturn = announcements
                .filter((a) => a.type === 'return' && a.deadlineMs && a.deadlineMs > now)
                .sort((a, b) => (a.deadlineMs as number) - (b.deadlineMs as number))[0];
              const nextEvent = upcomingEvents[0];

              const postedWhen = (an: AnnouncementItem) => `📌 โพสต์ ${formatDateTimeTh(an.createdAtMs)}`;
              const simpleSlot = (t: AnnouncementType): Slot => {
                const meta = ANNOUNCE_TYPES[t];
                const an = latestOf(t);
                return {
                  key: t,
                  icon: meta.icon,
                  label: meta.label,
                  chipCls: meta.badge,
                  item: an ? fromAnnouncement(an, postedWhen(an), t === 'urgent' ? 'danger' : 'normal') : null,
                };
              };

              const slots: Slot[] = [
                {
                  key: 'event',
                  icon: '🎉',
                  label: 'กิจกรรม',
                  chipCls: 'bg-violet-50 text-violet-700 border-violet-200',
                  item: nextEvent
                    ? {
                        key: nextEvent.id,
                        image: nextEvent.images[0],
                        title: nextEvent.title,
                        when: `🕒 ${dayLabel(eventStartMs(nextEvent), now)} · ${formatTime(nextEvent.startTime)} - ${formatTime(nextEvent.endTime)} น.`,
                        tone: 'normal',
                        onClick: () => setSelectedEvent(nextEvent),
                      }
                    : null,
                },
                simpleSlot('urgent'),
                {
                  key: 'return',
                  icon: ANNOUNCE_TYPES.return.icon,
                  label: ANNOUNCE_TYPES.return.label,
                  chipCls: ANNOUNCE_TYPES.return.badge,
                  item: nextReturn
                    ? fromAnnouncement(
                        nextReturn,
                        `⏳ ${describeRemaining(nextReturn.deadlineMs as number, now).text}`,
                        (nextReturn.deadlineMs as number) - now < 86400000 ? 'danger' : 'warn'
                      )
                    : null,
                },
                simpleSlot('lost'),
                simpleSlot('survey'),
                simpleSlot('general'),
              ];

              return (
                <div className="bg-white rounded-2xl border border-[#E6E1DA] p-3.5 shadow-xs space-y-2">
                  <div>
                    <span className="text-[9px] font-extrabold text-[#8A5A28] uppercase tracking-widest block">Coming Up</span>
                    <h4 className="text-xs font-black text-stone-900">แจ้งเตือนที่จะมาถึงเร็ว ๆ นี้</h4>
                  </div>
                  <div className="space-y-1.5">
                    {slots.map((slot) => {
                      const it = slot.item;
                      const chip = (
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded border font-bold text-[9px] leading-none ${slot.chipCls}`}
                        >
                          {slot.icon} {slot.label}
                        </span>
                      );
                      if (!it) {
                        return (
                          <div
                            key={slot.key}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed border-[#E6E1DA] opacity-70"
                          >
                            {chip}
                            <span className="text-[10px] text-stone-400">ยังไม่มีรายการ</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={slot.key}
                          onClick={it.onClick}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#FAF8F5] border border-[#E6E1DA] hover:bg-[#F3EFEA] transition cursor-pointer space-y-0.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {chip}
                            <span className="text-[11px] font-black text-stone-900 truncate">{it.title}</span>
                          </div>
                          <p
                            className={`text-[10px] font-semibold ${
                              it.tone === 'danger'
                                ? 'text-red-600'
                                : it.tone === 'warn'
                                ? 'text-amber-700'
                                : 'text-stone-600'
                            }`}
                          >
                            {it.when}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {isAdmin && (
              <div className="bg-white rounded-2xl border border-[#E6E1DA] p-4 sm:p-5 shadow-xs space-y-2.5">
                <span className="text-[10px] font-extrabold text-[#8A5A28] uppercase tracking-widest block">Admin Tools</span>
                <h4 className="text-xs sm:text-sm font-black text-stone-900">เครื่องมือผู้ดูแลระบบ</h4>
                <button
                  onClick={() => setIsEventModalOpen(true)}
                  className="w-full py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>✚</span> เพิ่มกิจกรรม
                </button>
                <button
                  onClick={() => setIsAnnounceModalOpen(true)}
                  className="w-full py-2.5 bg-[#FAF8F5] text-stone-800 border border-[#E6E1DA] font-bold text-xs rounded-xl hover:bg-[#F3EFEA] transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>✚</span> เพิ่มประกาศ
                </button>
              </div>
            )}

            <div className="bg-[#FEF9C3] border border-[#FDE047] p-4 rounded-2xl shadow-xs text-xs text-stone-800 space-y-1.5">
              <p className="font-bold text-stone-900">💡 ข้อมูลเบื้องต้น:</p>
              <p>• <strong>กิจกรรม:</strong> กิจกรรมที่จบแล้วจะถูกซ่อนอัตโนมัติ</p>
              <p>• <strong>แจ้งนำสิ่งของคืน:</strong> ต้องมารับภายใน {RETURN_DEADLINE_DAYS} วัน หากเกินกำหนดตกเป็นของสาขา</p>
              <p>• <strong>รูปสไลด์โชว์:</strong> เปลี่ยนรูปอัตโนมัติทุก 5 วินาที</p>
            </div>
          </aside>
        </div>
      </main>

      {/* ===== MODAL: รายละเอียดกิจกรรม ===== */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-stone-900/55 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl relative border border-[#E6E1DA] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Slideshow key={selectedEvent.id} images={selectedEvent.images} aspect="aspect-[16/9]" placeholder="🎉" />

            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A5A28]">
                    กิจกรรมที่กำลังจะมาถึง
                  </span>
                  <h3 className="text-lg font-black text-stone-900 break-words">{selectedEvent.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-stone-400 hover:text-stone-600 text-base font-bold cursor-pointer shrink-0"
                  aria-label="ปิด"
                >
                  ✕
                </button>
              </div>

              <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1DA] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <p>
                  <strong>📅 วันที่:</strong> {formatDateTh(selectedEvent.date)}
                </p>
                <p>
                  <strong>🕒 เวลา:</strong> {formatTime(selectedEvent.startTime)} - {formatTime(selectedEvent.endTime)} น.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">รายละเอียดกิจกรรม</h4>
                <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line break-words">
                  {selectedEvent.detail}
                </p>
              </div>

              <p className="text-[11px] text-stone-400">
                ประกาศโดย {selectedEvent.createdByName} · {formatDateTimeTh(selectedEvent.createdAtMs)}
              </p>

              <div className="flex items-center justify-between gap-2 pt-1">
                {isAdmin ? (
                  <button
                    onClick={() => handleDeleteEvent(selectedEvent)}
                    className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                  >
                    🗑️ ลบกิจกรรมนี้
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-5 py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition cursor-pointer"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: รายละเอียดประกาศ ===== */}
      {selectedAnnouncement && (() => {
        const an = selectedAnnouncement;
        const meta = ANNOUNCE_TYPES[an.type] || ANNOUNCE_TYPES.general;
        const remaining = an.type === 'return' && an.deadlineMs ? describeRemaining(an.deadlineMs, now) : null;
        return (
          <div
            className="fixed inset-0 bg-stone-900/55 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => setSelectedAnnouncement(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl relative border border-[#E6E1DA] max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {an.images.length > 0 && <Slideshow key={an.id} images={an.images} aspect="aspect-[16/9]" />}

              <div className="p-6 sm:p-8 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded border font-bold text-[10px] ${meta.badge}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <h3 className="text-lg font-black text-stone-900 break-words">{an.title}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedAnnouncement(null)}
                    className="text-stone-400 hover:text-stone-600 text-base font-bold cursor-pointer shrink-0"
                    aria-label="ปิด"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1DA] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <p>
                    <strong>{meta.icon} ประเภท:</strong> {meta.label}
                  </p>
                  <p>
                    <strong>🕒 โพสต์เมื่อ:</strong> {formatDateTimeTh(an.createdAtMs)}
                  </p>
                  <p>
                    <strong>👤 โดย:</strong> {an.createdByName}
                  </p>
                  {an.type === 'return' && an.deadlineMs && (
                    <p>
                      <strong>⏳ เดดไลน์:</strong> {formatDateTimeTh(an.deadlineMs)}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">รายละเอียด</h4>
                  <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line break-words">{an.detail}</p>
                </div>

                {remaining && (
                  <div
                    className={`px-4 py-3 rounded-xl border text-xs font-bold ${
                      remaining.expired
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    ⏳ {remaining.text}
                    <span className="block text-[11px] font-medium mt-0.5">
                      กำหนดนำสิ่งของมารับคืนภายใน {formatDateTimeTh(an.deadlineMs as number)} หากพ้นกำหนดสิ่งของจะตกเป็นของสาขา
                    </span>
                  </div>
                )}

                {an.type === 'survey' && an.surveyUrl && (
                  <a
                    href={an.surveyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition"
                  >
                    📝 เปิดแบบสอบถาม ↗
                  </a>
                )}

                <p className="text-[11px] text-stone-400">
                  ประกาศโดย {an.createdByName} · {formatDateTimeTh(an.createdAtMs)}
                </p>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {isAdmin ? (
                    <button
                      onClick={() => handleDeleteAnnouncement(an)}
                      className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                    >
                      🗑️ ลบประกาศนี้
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => setSelectedAnnouncement(null)}
                    className="px-5 py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition cursor-pointer"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== MODAL: เพิ่มกิจกรรม (admin) ===== */}
      {isEventModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-stone-900/55 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative border border-[#E6E1DA] max-h-[90vh] overflow-y-auto">
            <div className="mb-5 pr-6">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A5A28]">Admin</span>
              <h3 className="text-lg font-black text-stone-900">เพิ่มกิจกรรมที่กำลังจะมาถึง</h3>
            </div>

            <form onSubmit={handleEventSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">ชื่อกิจกรรม</label>
                <input
                  type="text"
                  required
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                  placeholder="เช่น อบรมเชิงปฏิบัติการการนำเสนอโปรเจกต์"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">รายละเอียด</label>
                <textarea
                  required
                  rows={5}
                  value={eDetail}
                  onChange={(e) => setEDetail(e.target.value)}
                  placeholder="รายละเอียดกิจกรรม สถานที่ ผู้เข้าร่วม ฯลฯ"
                  className={`${inputCls} resize-y`}
                />
                <p className="mt-1 text-[11px] text-stone-400">หน้ารายการจะแสดงตัวอย่างแค่ 4 บรรทัด ส่วนที่เหลือดูได้ในหน้าต่างรายละเอียดเพิ่มเติม</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">วันที่จัดกิจกรรม</label>
                <input
                  type="date"
                  required
                  value={eDate}
                  onChange={(e) => setEDate(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">เวลาเริ่ม (0.00 - 23.59)</label>
                  <div className="flex items-center gap-1.5">
                    <select value={eStartH} onChange={(e) => setEStartH(Number(e.target.value))} className={`${selectCls} flex-1`}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="font-black text-stone-500">.</span>
                    <select value={eStartM} onChange={(e) => setEStartM(Number(e.target.value))} className={`${selectCls} flex-1`}>
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>{pad2(m)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">เวลาสิ้นสุด (0.00 - 23.59)</label>
                  <div className="flex items-center gap-1.5">
                    <select value={eEndH} onChange={(e) => setEEndH(Number(e.target.value))} className={`${selectCls} flex-1`}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="font-black text-stone-500">.</span>
                    <select value={eEndM} onChange={(e) => setEEndM(Number(e.target.value))} className={`${selectCls} flex-1`}>
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>{pad2(m)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {renderImagePicker(eImages, setEImages, MAX_EVENT_IMAGES, 'event-images-input')}
              <p className="text-[11px] text-stone-400 -mt-2">
                หากแนบหลายรูป ระบบจะแสดงเป็นสไลด์โชว์เปลี่ยนรูปทุก 5 วินาที
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEventModalOpen(false);
                    resetEventForm();
                  }}
                  className="flex-1 py-2.5 bg-[#FAF8F5] text-stone-700 border border-[#E6E1DA] font-bold text-xs rounded-xl hover:bg-[#F3EFEA] transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isProcessingImages}
                  className="flex-1 py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition disabled:bg-stone-300 cursor-pointer"
                >
                  {isSubmitting ? 'กำลังบันทึก...' : 'เพิ่มกิจกรรม'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL: เพิ่มประกาศ (admin) ===== */}
      {isAnnounceModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-stone-900/55 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative border border-[#E6E1DA] max-h-[90vh] overflow-y-auto">
            <div className="mb-5 pr-6">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A5A28]">Admin</span>
              <h3 className="text-lg font-black text-stone-900">เพิ่มประกาศสำหรับห้องโปรเจกต์</h3>
            </div>

            <form onSubmit={handleAnnounceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1.5">ประเภทประกาศ</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(ANNOUNCE_TYPES) as AnnouncementType[]).map((key) => {
                    const t = ANNOUNCE_TYPES[key];
                    const active = aType === key;
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => setAType(key)}
                        className={`p-2.5 rounded-xl text-left text-xs font-black transition cursor-pointer ${
                          active
                            ? 'bg-[#653E1B] text-white shadow-sm'
                            : 'bg-[#FAF8F5] text-stone-700 hover:bg-[#F3EFEA] border border-[#E6E1DA]'
                        }`}
                      >
                        <span className="block text-base mb-0.5">{t.icon}</span>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-stone-500">{ANNOUNCE_TYPES[aType].hint}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">หัวข้อประกาศ</label>
                <input
                  type="text"
                  required
                  value={aTitle}
                  onChange={(e) => setATitle(e.target.value)}
                  placeholder={
                    aType === 'lost'
                      ? 'เช่น ตามหาเจ้าของกระเป๋าสตางค์สีดำ'
                      : aType === 'return'
                      ? 'เช่น แจ้งนำสิ่งของที่ลืมไว้มารับคืน'
                      : 'หัวข้อประกาศ'
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">รายละเอียด</label>
                <textarea
                  required
                  rows={5}
                  value={aDetail}
                  onChange={(e) => setADetail(e.target.value)}
                  placeholder="รายละเอียดประกาศ"
                  className={`${inputCls} resize-y`}
                />
              </div>

              {aType === 'return' && (
                <div className="px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-0.5">
                  <p className="font-bold">⏳ เดดไลน์นำสิ่งของคืน</p>
                  <p>
                    ระบบจะกำหนดเดดไลน์ให้อัตโนมัติ <strong>{RETURN_DEADLINE_DAYS} วัน</strong> นับจากเวลาที่โพสต์
                    ({formatDateTimeTh(Date.now() + RETURN_DEADLINE_DAYS * 86400000)}) หากพ้นกำหนดสิ่งของจะตกเป็นของสาขา
                  </p>
                </div>
              )}

              {aType === 'survey' && (
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">ลิงก์แบบสอบถาม</label>
                  <input
                    type="url"
                    required
                    value={aSurveyUrl}
                    onChange={(e) => setASurveyUrl(e.target.value)}
                    placeholder="https://forms.gle/..."
                    className={inputCls}
                  />
                </div>
              )}

              {renderImagePicker(aImages, setAImages, MAX_ANNOUNCE_IMAGES, 'announce-images-input')}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAnnounceModalOpen(false);
                    resetAnnounceForm();
                  }}
                  className="flex-1 py-2.5 bg-[#FAF8F5] text-stone-700 border border-[#E6E1DA] font-bold text-xs rounded-xl hover:bg-[#F3EFEA] transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isProcessingImages}
                  className="flex-1 py-2.5 bg-[#8A5A28] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-[#78481C] transition disabled:bg-stone-300 cursor-pointer"
                >
                  {isSubmitting ? 'กำลังบันทึก...' : 'โพสต์ประกาศ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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