'use client';

// วางไฟล์นี้ที่: app/chat/page.tsx  (หรือ src/app/chat/page.tsx ตามโครงสร้างโปรเจกต์)
// .env.local:
//   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=xxxx
//   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=ml_default   (ไม่ใส่ = ใช้ ml_default เหมือนหน้าโปรไฟล์)
//   NEXT_PUBLIC_GIPHY_API_KEY=xxxx   (ใช้ค้นหา GIF — ขอฟรีที่ developers.giphy.com ; ไม่ใส่ = ปุ่ม GIF จะแจ้งให้ตั้งค่า แต่ยังแนบไฟล์ .gif จากเครื่องได้)

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
  year?: number | null;
}

interface ActiveSession {
  id: string;
  joinedAt: number;
}

interface RoomMessage {
  id: string;
  uid: string;
  name: string;
  studentId: string;
  year: number | null;
  photo: string;
  text: string;
  images: string[];
  gifUrl: string;
  createdAt: number;
}

interface SupportMessage {
  id: string;
  senderUid: string;
  senderRole: 'student' | 'admin';
  senderName: string;
  senderStudentId: string;
  senderYear: number | null;
  senderPhoto: string;
  text: string;
  images: string[];
  createdAt: number;
}

interface SupportThread {
  id: string;
  name: string;
  studentId: string;
  lastMessage: string;
  lastAt: number;
  unreadAdmin?: boolean;
}

const MAX_IMAGES = 3;

const toMillis = (v: any): number =>
  v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : Date.now();

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

const DEFAULT_AVATAR = '/images/defaultprofile.jpg';

// ชั้นปี: ใช้ค่า year/studentYear ในโปรไฟล์ก่อน ถ้าไม่มีให้คำนวณจากรหัสนักศึกษา 2 หลักแรก (เช่น 64xxxxxxx → เข้าปี พ.ศ. 2564)
// ปีการศึกษาเริ่มประมาณเดือน ส.ค.
const calcYear = (studentId?: string | null): number | null => {
  const m = /^(\d{2})/.exec(String(studentId || ''));
  if (!m) return null;
  const entryBE = 2500 + parseInt(m[1], 10);
  const now = new Date();
  const be = now.getFullYear() + 543;
  const acad = now.getMonth() >= 7 ? be : be - 1;
  const y = acad - entryBE + 1;
  return y >= 1 && y <= 12 ? y : null;
};

const nameWithYear = (name: string, studentId?: string | null, year?: number | null) => {
  const y = year ?? calcYear(studentId);
  return y ? `${name} (ปี ${y})` : name;
};

function Avatar({ src, size = 28 }: { src?: string; size?: number }) {
  return (
    <img
      src={src || DEFAULT_AVATAR}
      alt=""
      style={{ width: size, height: size }}
      className="rounded-full object-cover border border-stone-200 bg-white shrink-0 aspect-square"
      onError={(e) => {
        const el = e.currentTarget as HTMLImageElement;
        if (!el.src.endsWith(DEFAULT_AVATAR)) el.src = DEFAULT_AVATAR;
      }}
    />
  );
}

type GiphyItem = { id: string; url: string; preview: string };

function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setErr('');
      try {
        const base = q.trim()
          ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q.trim())}&`
          : 'https://api.giphy.com/v1/gifs/trending?';
        const res = await fetch(`${base}api_key=${key}&limit=24&rating=g`, { signal: ctrl.signal });
        if (!res.ok) throw new Error('โหลด GIF ไม่สำเร็จ');
        const json = await res.json();
        setItems(
          (json.data || []).map((g: any) => ({
            id: g.id,
            url: g.images?.downsized_medium?.url || g.images?.original?.url,
            preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url,
          }))
        );
      } catch (e: any) {
        if (e?.name !== 'AbortError') setErr(e?.message || 'โหลด GIF ไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, key]);

  return (
    <div className="border-t border-stone-200 bg-white shrink-0">
      <div className="flex items-center gap-2 px-3 pt-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา GIF (เช่น happy, ok, ขำ)"
          className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-stone-400"
        />
        <button onClick={onClose} className="text-xs font-semibold text-stone-500 hover:text-stone-800 px-2">
          ปิด
        </button>
      </div>
      <div className="h-44 overflow-y-auto p-3">
        {!key ? (
          <p className="text-[11px] text-stone-500 text-center pt-8">
            ยังไม่ได้ตั้งค่า <code>NEXT_PUBLIC_GIPHY_API_KEY</code> ใน .env.local — หรือกดปุ่มรูปภาพเพื่อแนบไฟล์ .gif จากเครื่องแทนได้
          </p>
        ) : err ? (
          <p className="text-[11px] text-rose-600 text-center pt-8">{err}</p>
        ) : loading && items.length === 0 ? (
          <p className="text-[11px] text-stone-400 text-center pt-8">กำลังโหลด...</p>
        ) : items.length === 0 ? (
          <p className="text-[11px] text-stone-400 text-center pt-8">ไม่พบ GIF</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {items.map((g) => (
              <button key={g.id} onClick={() => onPick(g.url)} className="rounded-md overflow-hidden bg-stone-100 hover:ring-2 hover:ring-[#653E1B]">
                <img src={g.preview} alt="gif" className="w-full h-20 object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="px-3 pb-1.5 text-[9px] text-stone-400 text-right">Powered by GIPHY</p>
    </div>
  );
}

async function uploadToCloudinary(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default';
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('อัปโหลดรูปภาพไม่สำเร็จ');
  const data = await res.json();
  return data.secure_url as string;
}

export default function ChatPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<'room' | 'support'>('room');

  // ---------- Room chat ----------
  const [roomMessages, setRoomMessages] = useState<RoomMessage[]>([]);
  const [roomText, setRoomText] = useState('');
  const [activeNames, setActiveNames] = useState<string[]>([]);
  const roomEndRef = useRef<HTMLDivElement>(null);
  const [roomFiles, setRoomFiles] = useState<File[]>([]);
  const [roomSending, setRoomSending] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [showGif, setShowGif] = useState(false);

  // ---------- Support chat ----------
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportText, setSupportText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unreadUser, setUnreadUser] = useState(false);
  const supportEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = profile?.role === 'admin';
  const isTrackingActive = pathname?.startsWith('/tracking') || pathname?.startsWith('/admin');
  const supportThreadId = isAdmin ? selectedThread : uid;

  // ===== Auth + Profile =====
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/preloginhomepage');
        return;
      }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const d: any = snap.exists() ? snap.data() : {};
        setProfile({
          name: d.name || user.displayName || 'ผู้ใช้งาน',
          studentId: d.studentId || '-',
          email: d.email || user.email || '',
          role: d.role || 'student',
          profileImage: d.profileImage || user.photoURL || '/images/defaultprofile.jpg',
          year: Number(d.year ?? d.studentYear ?? d.yearLevel) || null,
        });
      } catch (e) {
        console.error(e);
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
      unsub();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [router]);

  // ===== ติดตามสถานะ Check-in แบบเรียลไทม์ (Check-out ปุ๊บ แชทในห้องถูกตัดสิทธิ์ทันที) =====
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'checkins'), where('uid', '==', uid), where('status', '==', 'active'));
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setSession(null);
        } else {
          const d = snap.docs[0];
          const data: any = d.data();
          setSession({ id: d.id, joinedAt: toMillis(data.createdAt) });
        }
        setSessionChecked(true);
      },
      () => setSessionChecked(true)
    );
  }, [uid]);

  // ===== คนที่อยู่ในห้องตอนนี้ =====
  useEffect(() => {
    if (!session) {
      setActiveNames([]);
      return;
    }
    const q = query(collection(db, 'checkins'), where('status', '==', 'active'));
    return onSnapshot(
      q,
      (snap) => {
        const names = snap.docs.map((d) => String((d.data() as any).name || 'ผู้ใช้งาน'));
        setActiveNames(names);
      },
      () => setActiveNames([])
    );
  }, [session?.id]);

  // ===== ข้อความแชทในห้อง: เฉพาะที่ส่งหลังเวลา Check-in รอบนี้ =====
  useEffect(() => {
    if (!session) {
      setRoomMessages([]); // Check-out แล้ว → ล้างทิ้ง
      return;
    }
    const q = query(
      collection(db, 'roomMessages'),
      where('createdAt', '>', Timestamp.fromMillis(session.joinedAt)),
      orderBy('createdAt', 'asc'),
      limit(300)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRoomMessages(
          snap.docs.map((d) => {
            const x: any = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              uid: x.uid,
              name: x.name || 'ผู้ใช้งาน',
              studentId: x.studentId || '',
              year: x.year ?? null,
              photo: x.photo || '',
              text: x.text || '',
              images: x.images || [],
              gifUrl: x.gifUrl || '',
              createdAt: toMillis(x.createdAt),
            };
          })
        );
      },
      (err) => console.error('room chat error:', err)
    );
    return () => {
      unsub();
      setRoomMessages([]);
    };
  }, [session?.id, session?.joinedAt]);

  useEffect(() => {
    if (tab === 'room') roomEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages, tab]);

  const postRoom = async (text: string, images: string[], gifUrl: string) => {
    if (!session || !uid || !profile) return;
    await addDoc(collection(db, 'roomMessages'), {
      uid,
      name: profile.name || 'ผู้ใช้งาน',
      studentId: profile.studentId || '-',
      year: profile.year ?? null,
      photo: profile.profileImage || '',
      text,
      images,
      gifUrl,
      createdAt: serverTimestamp(),
    });
  };

  const sendRoom = async () => {
    const text = roomText.trim();
    if ((!text && roomFiles.length === 0) || !session || !uid || !profile || roomSending) return;
    setRoomSending(true);
    setRoomError('');
    try {
      const images = await Promise.all(roomFiles.map(uploadToCloudinary));
      await postRoom(text, images, '');
      setRoomText('');
      setRoomFiles([]);
    } catch (e: any) {
      console.error(e);
      setRoomError(e?.message || 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setRoomSending(false);
    }
  };

  const sendGif = async (url: string) => {
    if (!url || roomSending) return;
    setShowGif(false);
    setRoomSending(true);
    try {
      await postRoom('', [], url);
    } catch (e) {
      console.error(e);
      setRoomError('ส่ง GIF ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setRoomSending(false);
    }
  };

  const pickRoomFiles = (list: FileList | null) => {
    if (!list) return;
    const merged = [...roomFiles, ...Array.from(list)].filter((f) => f.type.startsWith('image/'));
    setRoomError(merged.length > MAX_IMAGES ? `แนบรูปได้ไม่เกิน ${MAX_IMAGES} รูปต่อข้อความ` : '');
    setRoomFiles(merged.slice(0, MAX_IMAGES));
  };

  // ===== แอดมิน: รายการห้องสนทนาทั้งหมด =====
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'supportThreads'), orderBy('lastAt', 'desc'), limit(100));
    return onSnapshot(q, (snap) => {
      setThreads(
        snap.docs.map((d) => {
          const x: any = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            name: x.name || '-',
            studentId: x.studentId || '-',
            lastMessage: x.lastMessage || '',
            lastAt: toMillis(x.lastAt),
            unreadAdmin: x.unreadAdmin,
          };
        })
      );
    });
  }, [isAdmin]);

  // ===== นักศึกษา: ติดตามว่ามีข้อความใหม่จากผู้ดูแลไหม =====
  useEffect(() => {
    if (!uid || isAdmin) return;
    return onSnapshot(
      doc(db, 'supportThreads', uid),
      (snap) => setUnreadUser(Boolean(snap.exists() && (snap.data() as any).unreadUser)),
      () => {}
    );
  }, [uid, isAdmin]);

  // ===== ข้อความแชทผู้ดูแล (เก็บประวัติครบ ไม่ตัดตามเวลา Check-in) =====
  useEffect(() => {
    if (!supportThreadId) {
      setSupportMessages([]);
      return;
    }
    const q = query(
      collection(db, 'supportThreads', supportThreadId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(500)
    );
    return onSnapshot(q, (snap) => {
      setSupportMessages(
        snap.docs.map((d) => {
          const x: any = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            senderUid: x.senderUid,
            senderRole: x.senderRole,
            senderName: x.senderName || '-',
            senderStudentId: x.senderStudentId || '',
            senderYear: x.senderYear ?? null,
            senderPhoto: x.senderPhoto || '',
            text: x.text || '',
            images: x.images || [],
            createdAt: toMillis(x.createdAt),
          };
        })
      );
    });
  }, [supportThreadId]);

  // เคลียร์จุดแจ้งเตือนเมื่อเปิดอ่าน
  useEffect(() => {
    if (tab !== 'support' || !supportThreadId) return;
    updateDoc(
      doc(db, 'supportThreads', supportThreadId),
      isAdmin ? { unreadAdmin: false } : { unreadUser: false }
    ).catch(() => {});
  }, [tab, supportThreadId, isAdmin, supportMessages.length]);

  useEffect(() => {
    if (tab === 'support') supportEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [supportMessages, tab]);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const merged = [...files, ...Array.from(list)].filter((f) => f.type.startsWith('image/'));
    setError(merged.length > MAX_IMAGES ? `แนบรูปได้ไม่เกิน ${MAX_IMAGES} รูป` : '');
    setFiles(merged.slice(0, MAX_IMAGES));
  };

  const sendSupport = async () => {
    const text = supportText.trim();
    if ((!text && files.length === 0) || !supportThreadId || !uid || !profile || sending) return;
    setSending(true);
    setError('');
    try {
      const images = await Promise.all(files.map(uploadToCloudinary));
      await addDoc(collection(db, 'supportThreads', supportThreadId, 'messages'), {
        senderUid: uid,
        senderRole: isAdmin ? 'admin' : 'student',
        senderName: profile.name || 'ผู้ใช้งาน',
        senderStudentId: profile.studentId || '-',
        senderYear: profile.year ?? null,
        senderPhoto: profile.profileImage || '',
        text,
        images,
        createdAt: serverTimestamp(),
      });
      const preview = text || '📷 รูปภาพ';
      await setDoc(
        doc(db, 'supportThreads', supportThreadId),
        isAdmin
          ? { lastMessage: preview, lastAt: serverTimestamp(), unreadAdmin: false, unreadUser: true }
          : {
              uid,
              name: profile.name || 'ผู้ใช้งาน',
              studentId: profile.studentId || '-',
              lastMessage: preview,
              lastAt: serverTimestamp(),
              unreadAdmin: true,
              unreadUser: false,
              status: 'open',
            },
        { merge: true }
      );
      setSupportText('');
      setFiles([]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const adminUnread = threads.filter((t) => t.unreadAdmin).length;
  const selectedThreadInfo = threads.find((t) => t.id === selectedThread);

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
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

          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
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
                      <Link href="/tracking" onClick={() => setIsTrackingOpen(false)} className="block px-4 py-2 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-600">User Tracking</Link>
                      <Link href="/admin" onClick={() => setIsTrackingOpen(false)} className="block px-4 py-2 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-600 border-t border-gray-50">Administration Tracking</Link>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/tracking" className="transition hover:text-orange-600">Tracking</Link>
              )}
            </nav>

            <Link
              href="/profile"
              className="flex items-center gap-2.5 p-1 sm:py-1 sm:px-3 rounded-full bg-gray-50/85 hover:bg-orange-50/60 border border-gray-200/60 hover:border-orange-200 transition-all duration-300 shadow-sm group shrink-0"
              title="ไปที่หน้าโปรไฟล์"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-orange-500 shadow-sm shrink-0 bg-white">
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
                <span className="block text-[12px] font-bold text-gray-900 leading-tight truncate group-hover:text-orange-600 transition-colors">{profile?.name}</span>
                <span className="block text-[10px] font-medium text-gray-400 tracking-wide truncate">{profile?.studentId}</span>
              </div>
            </Link>
          </div>
        </div>

        <div className="flex lg:hidden items-center justify-around bg-gray-50/90 border-t border-gray-100 py-2 px-2 text-[11px] font-semibold text-gray-600 relative overflow-x-auto gap-2">
          <Link href="/homepage" className="whitespace-nowrap hover:text-orange-600">Home</Link>
          <Link href="/checkin" className="whitespace-nowrap hover:text-orange-600 text-orange-600 font-bold">Check-in</Link>
          
          <Link href="/report" className="whitespace-nowrap hover:text-orange-600">Report</Link>
          <Link href={isAdmin ? '/admin' : '/tracking'} className="whitespace-nowrap hover:text-orange-600">Tracking</Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
              Community &amp; Support
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">ห้องแชทโปรเจกต์</h1>
            <p className="text-xs text-gray-500">คุยกับคนในห้อง หรือติดต่ออาจารย์ / ผู้ดูแลระบบโดยตรง</p>
          </div>
          <Link
            href="/checkin"
            className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition self-start sm:self-auto"
          >
            ← กลับหน้า Check-in
          </Link>
        </div>

        {/* Chat card */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden flex flex-col h-[72vh] min-h-[480px]">
          {/* Tabs */}
          <div className="flex bg-stone-100 p-1 gap-1 text-xs font-semibold shrink-0">
            <button
              onClick={() => setTab('room')}
              className={`flex-1 py-2.5 rounded-md transition flex items-center justify-center gap-2 ${
                tab === 'room' ? 'bg-white text-[#653E1B] shadow-xs font-bold' : 'text-stone-600 hover:text-gray-900'
              }`}
            >
              💬 แชทในห้อง
              {session && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                  {activeNames.length} คน
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('support')}
              className={`flex-1 py-2.5 rounded-md transition flex items-center justify-center gap-2 ${
                tab === 'support' ? 'bg-white text-[#653E1B] shadow-xs font-bold' : 'text-stone-600 hover:text-gray-900'
              }`}
            >
              🛠️ {isAdmin ? 'ข้อความจากผู้ใช้' : 'ติดต่อผู้ดูแล'}
              {(isAdmin ? adminUnread > 0 : unreadUser) && (
                <span className="min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
                  {isAdmin ? adminUnread : '!'}
                </span>
              )}
            </button>
          </div>

          {/* ===== ROOM TAB ===== */}
          {tab === 'room' && (
            <>
              <div className="px-4 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100 shrink-0">
                แชทชั่วคราวสำหรับคนที่ Check-in อยู่ในห้อง — คุณจะเห็นเฉพาะข้อความหลังเวลาที่ Check-in และแชทจะหายเมื่อ Check-out
              </div>

              {!sessionChecked ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                </div>
              ) : !session ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-xl">🔒</div>
                  <p className="text-sm font-bold text-gray-900">แชทในห้องเปิดให้เฉพาะคนที่ Check-in อยู่</p>
                  <p className="text-xs text-gray-500 max-w-sm">
                    ลงชื่อเข้าใช้ห้องก่อน จึงจะเห็นและพิมพ์ข้อความในแชทห้องโปรเจกต์ได้
                  </p>
                  <Link
                    href="/logintouse"
                    className="px-4 py-2 bg-[#653E1B] hover:bg-[#523115] text-white font-semibold text-xs rounded-lg transition-colors"
                  >
                    ลงชื่อเข้าใช้ห้อง
                  </Link>
                </div>
              ) : (
                <>
                  {activeNames.length > 0 && (
                    <div className="px-4 py-2 text-[11px] text-stone-500 border-b border-stone-100 truncate shrink-0">
                      ในห้องตอนนี้: <span className="font-semibold text-stone-700">{activeNames.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#faf8f5]">
                    {roomMessages.length === 0 && (
                      <p className="text-center text-xs text-stone-400 pt-10">
                        ยังไม่มีข้อความในรอบนี้ ลองทักทายคนในห้องดู 👋
                      </p>
                    )}
                    {roomMessages.map((m) => {
                      const mine = m.uid === uid;
                      return (
                        <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                          {!mine && <Avatar src={m.photo} size={32} />}
                          <div className={`max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            {!mine && (
                              <span className="text-[10px] text-stone-500 mb-0.5 px-1">
                                {nameWithYear(m.name, m.studentId, m.year)}
                              </span>
                            )}
                            {m.gifUrl && (
                              <img src={m.gifUrl} alt="GIF" className="rounded-xl max-w-[220px] w-full object-cover border border-stone-200 bg-white" />
                            )}
                            {(m.text || m.images.length > 0) && (
                              <div
                                className={`px-3.5 py-2 rounded-2xl text-xs break-words whitespace-pre-wrap space-y-1.5 ${
                                  mine
                                    ? 'bg-[#653E1B] text-white rounded-br-sm'
                                    : 'bg-white border border-stone-200 text-gray-800 rounded-bl-sm'
                                }`}
                              >
                                {m.images.length > 0 && (
                                  <div className={`grid gap-1.5 ${m.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                    {m.images.map((url) => (
                                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                        <img
                                          src={url}
                                          alt="แนบ"
                                          className={`rounded-md object-cover w-full ${m.images.length === 1 ? 'max-h-60' : 'h-24'}`}
                                        />
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {m.text && <p>{m.text}</p>}
                              </div>
                            )}
                            <span className="text-[9px] text-stone-400 mt-0.5 px-1">{fmtTime(m.createdAt)}</span>
                          </div>
                          {mine && <Avatar src={m.photo || profile?.profileImage} size={32} />}
                        </div>
                      );
                    })}
                    <div ref={roomEndRef} />
                  </div>
                  {roomFiles.length > 0 && (
                    <div className="flex gap-2 px-4 py-2 border-t border-stone-100 shrink-0">
                      {roomFiles.map((f, i) => (
                        <div key={i} className="relative">
                          <img
                            src={URL.createObjectURL(f)}
                            alt="preview"
                            className="w-14 h-14 object-cover rounded-md border border-stone-200"
                          />
                          <button
                            onClick={() => setRoomFiles(roomFiles.filter((_, idx) => idx !== i))}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] leading-none"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {roomError && <p className="px-4 pb-1 text-[11px] text-rose-600 shrink-0">{roomError}</p>}
                  {showGif && <GifPicker onPick={sendGif} onClose={() => setShowGif(false)} />}
                  <div className="p-3 border-t border-stone-200 flex gap-2 items-center shrink-0">
                    <label className="cursor-pointer text-stone-500 hover:text-[#653E1B] p-1.5" title="แนบรูปภาพ (ไม่เกิน 3 รูป)">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4-4a3 3 0 014 0l4 4m-2-2l1-1a3 3 0 014 0l2 2M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          pickRoomFiles(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      onClick={() => setShowGif((v) => !v)}
                      title="ส่ง GIF"
                      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold tracking-wide transition ${
                        showGif ? 'bg-[#653E1B] text-white border-[#653E1B]' : 'text-stone-500 border-stone-300 hover:text-[#653E1B] hover:border-[#653E1B]'
                      }`}
                    >
                      GIF
                    </button>
                    <input
                      value={roomText}
                      onChange={(e) => setRoomText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendRoom()}
                      maxLength={500}
                      placeholder="พิมพ์ข้อความถึงคนในห้อง..."
                      className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-stone-400"
                    />
                    <button
                      onClick={sendRoom}
                      disabled={roomSending || (!roomText.trim() && roomFiles.length === 0)}
                      className="px-4 py-2 bg-[#653E1B] hover:bg-[#523115] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {roomSending ? 'กำลังส่ง...' : 'ส่ง'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ===== SUPPORT TAB ===== */}
          {tab === 'support' && (
            <div className="flex-1 flex min-h-0">
              {/* แอดมิน: รายการห้องสนทนา */}
              {isAdmin && (
                <div
                  className={`${selectedThread ? 'hidden md:flex' : 'flex'} w-full md:w-72 shrink-0 flex-col border-r border-stone-200 overflow-y-auto divide-y divide-stone-100`}
                >
                  {threads.length === 0 && (
                    <p className="text-center text-xs text-stone-400 pt-10 px-4">ยังไม่มีข้อความจากผู้ใช้</p>
                  )}
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedThread(t.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-2 ${
                        selectedThread === t.id ? 'bg-orange-50/60' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">
                          {t.name} <span className="font-mono text-[10px] text-stone-400">{t.studentId}</span>
                        </div>
                        <div className="text-[11px] text-stone-500 truncate">{t.lastMessage}</div>
                        <div className="text-[10px] text-stone-400">{fmtDateTime(t.lastAt)}</div>
                      </div>
                      {t.unreadAdmin && <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {/* พื้นที่ข้อความ */}
              {isAdmin && !selectedThread ? (
                <div className="hidden md:flex flex-1 items-center justify-center text-xs text-stone-400">
                  เลือกห้องสนทนาจากรายการด้านซ้าย
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-w-0">
                  {isAdmin && (
                    <div className="px-4 py-2 border-b border-stone-100 flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedThread(null)}
                        className="md:hidden text-[11px] font-semibold text-[#653E1B]"
                      >
                        ←
                      </button>
                      <span className="text-xs font-bold text-gray-900 truncate">
                        {selectedThreadInfo?.name || 'ผู้ใช้งาน'}{' '}
                        <span className="font-mono text-[10px] text-stone-400">{selectedThreadInfo?.studentId}</span>
                      </span>
                    </div>
                  )}
                  {!isAdmin && (
                    <div className="px-4 py-2 text-[11px] text-sky-800 bg-sky-50 border-b border-sky-100 shrink-0">
                      ช่องทางด่วนติดต่ออาจารย์ / ผู้ดูแลระบบ — ประวัติการสนทนาจะถูกเก็บไว้ ตรวจสอบย้อนหลังได้ (แนบรูปได้ไม่เกิน {MAX_IMAGES} รูป)
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#faf8f5]">
                    {supportMessages.length === 0 && (
                      <p className="text-center text-xs text-stone-400 pt-10">
                        {isAdmin ? 'ยังไม่มีข้อความ' : 'แจ้งปัญหาหรือสอบถามผู้ดูแลได้เลย เช่น แอร์เสีย ไฟลัดวงจร เรื่องด่วนในห้อง'}
                      </p>
                    )}
                    {supportMessages.map((m) => {
                      const mine = m.senderUid === uid;
                      return (
                        <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                          {!mine && <Avatar src={m.senderPhoto} size={32} />}
                          <div className={`max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            {!mine && (
                              <span className="text-[10px] text-stone-500 mb-0.5 px-1">
                                {m.senderRole === 'admin'
                                  ? `ผู้ดูแล • ${m.senderName}`
                                  : nameWithYear(m.senderName, m.senderStudentId, m.senderYear)}
                              </span>
                            )}
                            <div
                              className={`px-3.5 py-2 rounded-2xl text-xs space-y-1.5 ${
                                mine
                                  ? 'bg-[#653E1B] text-white rounded-br-sm'
                                  : 'bg-white border border-stone-200 text-gray-800 rounded-bl-sm'
                              }`}
                            >
                              {m.images.length > 0 && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {m.images.map((url) => (
                                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                      <img src={url} alt="แนบ" className="rounded-md object-cover w-full h-24" />
                                    </a>
                                  ))}
                                </div>
                              )}
                              {m.text && <p className="break-words whitespace-pre-wrap">{m.text}</p>}
                            </div>
                            <span className="text-[9px] text-stone-400 mt-0.5 px-1">{fmtDateTime(m.createdAt)}</span>
                          </div>
                          {mine && <Avatar src={m.senderPhoto || profile?.profileImage} size={32} />}
                        </div>
                      );
                    })}
                    <div ref={supportEndRef} />
                  </div>

                  {files.length > 0 && (
                    <div className="flex gap-2 px-4 py-2 border-t border-stone-100 shrink-0">
                      {files.map((f, i) => (
                        <div key={i} className="relative">
                          <img
                            src={URL.createObjectURL(f)}
                            alt="preview"
                            className="w-14 h-14 object-cover rounded-md border border-stone-200"
                          />
                          <button
                            onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] leading-none"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {error && <p className="px-4 pb-1 text-[11px] text-rose-600 shrink-0">{error}</p>}

                  <div className="p-3 border-t border-stone-200 flex gap-2 items-center shrink-0">
                    <label className="cursor-pointer text-stone-500 hover:text-[#653E1B] p-1.5" title="แนบรูปภาพ">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4-4a3 3 0 014 0l4 4m-2-2l1-1a3 3 0 014 0l2 2M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          pickFiles(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      value={supportText}
                      onChange={(e) => setSupportText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendSupport()}
                      maxLength={1000}
                      placeholder={isAdmin ? 'ตอบกลับผู้ใช้...' : 'แจ้งปัญหา / ติดต่อผู้ดูแล...'}
                      className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-stone-400"
                    />
                    <button
                      onClick={sendSupport}
                      disabled={sending || (!supportText.trim() && files.length === 0)}
                      className="px-4 py-2 bg-[#653E1B] hover:bg-[#523115] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {sending ? 'กำลังส่ง...' : 'ส่ง'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}