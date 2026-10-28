'use client';

import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const [year, setYear] = useState('ปี 1');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name,
        studentId,
        email,
        role,
        year: role === 'student' ? year : '-',
        createdAt: new Date().toISOString(),
      });

      alert('สมัครสมาชิกสำเร็จ!');
      router.push('/login');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        router.push('/login?alreadyRegistered=true');
        return;
      } else if (err.code === 'auth/invalid-email') {
        setError('รูปแบบอีเมลไม่ถูกต้อง');
      } else {
        setError('เกิดข้อผิดพลาดในการสมัครสมาชิก กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg border border-gray-200">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-orange-600">สมัครสมาชิก</h1>
          <p className="mt-1 text-sm font-medium text-gray-600">ระบบจัดการห้องโปรเจกต์สาขาวิทยาการคอมพิวเตอร์และสารสนเทศ</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-800">ชื่อ-นามสกุล</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="นายสมชาย ใจดี"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800">รหัสนักศึกษา / รหัสประจำตัว</label>
            <input
              type="text"
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="000000000-0"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800">สถานะผู้ใช้งาน</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'student' | 'admin')}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="student" className="text-gray-900">นักศึกษา</option>
              <option value="admin" className="text-gray-900">อาจารย์ / ผู้ดูแลระบบ</option>
            </select>
          </div>

          {/* ช่องเลือกชั้นปีเฉพาะเมื่อเลือกลักษณะเป็น "นักศึกษา" */}
          {role === 'student' && (
            <div>
              <label className="block text-sm font-bold text-gray-800">ชั้นปี</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="ปี 1">ปี 1</option>
                <option value="ปี 2">ปี 2</option>
                <option value="ปี 3">ปี 3</option>
                <option value="ปี 4">ปี 4</option>
              </select>
            </div>
          )}

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

          <div>
            <label className="block text-sm font-bold text-gray-800">ยืนยันรหัสผ่าน</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-600 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:bg-gray-400 shadow-sm"
          >
            {loading ? 'กำลังลงทะเบียน...' : 'สมัครสมาชิก'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-gray-700">
          มีบัญชีอยู่แล้ว?{' '}
          <Link href="/login" className="font-bold text-orange-600 hover:underline">
            ลงชื่อเข้าใช้
          </Link>
        </p>
      </div>
    </div>
  );
}