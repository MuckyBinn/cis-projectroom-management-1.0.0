'use client';

import { useState, useEffect, Suspense } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  // เคลียร์ Session เก่าออกเมื่อเปิดมาหน้า Login เพื่อป้องกันปัญหา Auth ค้าง
  useEffect(() => {
    signOut(auth);
  }, []);

  useEffect(() => {
    if (searchParams.get('alreadyRegistered') === 'true') {
      setShowPopup(true);
      const timer = setTimeout(() => {
        setShowPopup(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // บันทึก Session ลง localStorage
      localStorage.setItem(
        'user',
        JSON.stringify({
          uid: user.uid,
          email: user.email,
        })
      );

      router.push('/homepage');
    } catch (err: any) {
      console.error(err);
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl border-2 border-orange-500">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600 font-bold text-xl">
              !
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">แจ้งเตือนระบบ</h3>
            <p className="text-sm font-semibold text-gray-700">คุณเคยสมัครบัญชีนี้ไปแล้ว</p>
            <p className="mt-3 text-xs text-gray-400">หน้าต่างนี้จะปิดลงใน 5 วินาที...</p>
            <button
              onClick={() => setShowPopup(false)}
              className="mt-4 w-full rounded-lg bg-orange-600 py-2 text-xs font-bold text-white hover:bg-orange-700"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg border border-gray-200">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-orange-600">ลงชื่อเข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm font-medium text-gray-600">ระบบจัดการห้องโปรเจกต์สาขาวิทยาการคอมพิวเตอร์และสารสนเทศ</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-800">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="YourEmail@kkumail.com"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800">รหัสผ่าน</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-600 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:bg-gray-400 shadow-sm"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-gray-700">
          ยังไม่มีบัญชี?{' '}
          <button
            type="button"
            onClick={() => router.push('/register')}
            className="font-bold text-orange-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
          >
            สมัครสมาชิกที่นี่
          </button>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">กำลังโหลด...</div>}>
      <LoginForm />
    </Suspense>
  );
}