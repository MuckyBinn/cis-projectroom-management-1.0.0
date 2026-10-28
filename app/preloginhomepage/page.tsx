'use client';

import Link from 'next/link';

// เมนูบริการ (สำหรับหน้า Pre-login: ฟังก์ชั่นภายในจะถูกส่งไปที่ /login ก่อนเสมอ)
const menuItems = [
  {
    id: 'checkin',
    title: 'ลงชื่อเข้าใช้ห้องโปรเจกต์',
    description: 'บันทึกเวลาเข้าและออกจากห้องปฏิบัติการโปรเจกต์สำหรับนักศึกษา',
    image: '/images/checkin.png',
    link: '/login',
    isExternal: false,
  },
  {
    id: 'keepleave',
    title: 'ฝากสิ่งของ',
    description: 'ลงทะเบียนฝากสิ่งของ สัมภาระ และติดตามสถานะสิ่งของภายในห้อง',
    image: '/images/keepleave.png',
    link: '/login',
    isExternal: false,
  },
  {
    id: 'report',
    title: 'แจ้งเหตุ',
    description: 'แจ้งอุปกรณ์ชำรุด ความสะอาด หรือข้อขัดข้องภายในห้องโปรเจกต์',
    image: '/images/report.png',
    link: '/login',
    isExternal: false,
  },
];

// จุดเด่นของระบบ
const highlights = [
  {
    icon: '🔒',
    title: 'ปลอดภัยและตรวจสอบได้',
    description:
      'เก็บบันทึกประวัติการเข้าใช้งาน การฝากสิ่งของ และการแจ้งเหตุขัดข้องอย่างเป็นระบบ ย้อนหลังได้ตลอดเวลา',
  },
  {
    icon: '⚡',
    title: 'ใช้งานง่าย รวดเร็ว',
    description:
      'ลดขั้นตอนการลงชื่อด้วยกระดาษ สามารถเช็กอิน ฝากของ หรือแจ้งอุปกรณ์ชำรุดได้ทันทีผ่านมือถือ',
  },
  {
    icon: '🤝',
    title: 'สร้างสังคมการใช้งานที่ดี',
    description:
      'ช่วยรักษาความสะอาด ความเป็นระเบียบเรียบร้อย และดูแลครุภัณฑ์ร่วมกันภายในสาขาวิชา',
  },
];

// สถิติสั้น ๆ แสดงในส่วน Hero
const stats = [
  { value: '3', label: 'บริการหลักในระบบเดียว' },
  { value: '24 ชม.', label: 'เข้าถึงระบบได้ตลอดเวลา' },
  { value: '100%', label: 'ตรวจสอบย้อนหลังได้' },
];

// อาจารย์ที่ปรึกษาโครงงาน
const advisor = {
  name: 'ดร. มนัสสวี นกแก้ว',
  role: 'อาจารย์ที่ปรึกษาโครงงาน',
  image: '/images/teacher.jpg',
};

// ข้อมูลสมาชิกผู้พัฒนา
const developers = [
  {
    name: 'นายจตุภัทร อนุเดชากุล',
    studentId: '663450035-5',
    role: 'รับผิดชอบงานเอกสาร และรวบรวมข้อมูลระบบ',
    image: '/images/jatupat.jpg',
  },
  {
    name: 'นายธนบดี ภาคภูมิ',
    studentId: '663450175-9',
    role: 'รับผิดชอบเขียนโปรแกรม และพัฒนาระบบ (Developer)',
    image: '/images/tanabodee.jpg',
  },
];

export default function PreLoginPage() {
  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/images/cis.png"
              alt="CIS KKU"
              className="w-10 h-10 rounded-lg object-contain"
            />
            <div>
              <span className="font-bold text-lg text-gray-900 block leading-none">CIS KKU</span>
              <span className="text-xs text-gray-500">Project Room Management System</span>
            </div>
          </div>

          <nav className="flex items-center gap-3 sm:gap-4 text-sm font-medium">
            <Link
              href="/register"
              className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 transition text-xs sm:text-sm"
            >
              สมัครสมาชิก
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 transition text-xs sm:text-sm"
            >
              เข้าสู่ระบบ
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero: ภาพห้องโปรเจกต์เป็นพื้นหลัง ไล่เฉดมืดจากซ้ายไปขวา ให้ข้อความอ่านง่ายและฝั่งขวาไม่โล่ง */}
      <section className="relative text-white border-b border-stone-800 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/projectroom.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1c1917] via-[#1c1917]/90 to-[#1c1917]/35" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#1c1917] to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-14 lg:pt-20 lg:pb-16">
          <div className="max-w-3xl">
            <span className="inline-block px-3 py-1 bg-orange-500/15 text-orange-400 border border-orange-500/30 rounded-full text-xs font-semibold">
              ระบบจัดการห้องปฏิบัติการโปรเจกต์ · สาขา CIS
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
              บริหารจัดการห้องโปรเจกต์
              <br />
              สะดวก ปลอดภัย ตรวจสอบได้
            </h1>
            <p className="mt-4 text-stone-300 text-sm sm:text-base leading-relaxed max-w-xl">
              ศูนย์กลางบริการสำหรับนักศึกษาสาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ มหาวิทยาลัยขอนแก่น
              เพื่อการเข้าใช้งานห้องปฏิบัติการ ประกาศกิจกรรมและแจ้งเตือน และแจ้งเหตุขัดข้องได้อย่างเป็นระบบ
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition flex items-center gap-2 text-sm"
              >
                เข้าสู่ระบบเพื่อเริ่มใช้งาน
              </Link>
              <Link
                href="/register"
                className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 backdrop-blur-sm text-stone-100 border border-stone-500/60 font-semibold transition text-sm"
              >
                สมัครสมาชิกนักศึกษา
              </Link>
            </div>
          </div>
        </div>

        {/* แถบสถิติ เต็มความกว้าง พื้นทึบ คั่นด้วยเส้นแนวตั้ง */}
        <div className="relative bg-[#1c1917] border-t border-stone-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-3 divide-x divide-stone-700">
              {stats.map((stat) => (
                <div key={stat.label} className="py-6 px-4 sm:px-6">
                  <p className="text-2xl sm:text-3xl font-extrabold text-orange-500">{stat.value}</p>
                  <p className="mt-1 text-xs sm:text-sm text-stone-400 leading-snug">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">

        {/* Section 1: บริการหลัก — คงรูปแบบการ์ดและรูปภาพเดิมไว้ทั้งหมด */}
        <section className="space-y-6">
          <div className="flex items-start gap-3">
            <span className="mt-2 w-6 h-0.5 bg-orange-600 shrink-0" />
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                🎓 บริการสำหรับผู้ใช้งาน
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                คลิกเลือกบริการที่ต้องการ (บริการภายในระบบจำเป็นต้องเข้าสู่ระบบก่อนใช้งาน)
              </p>
            </div>
          </div>

          {/* Grid Layout 4 ช่อง */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 group/grid">
            {menuItems.map((item) => {
              const CardContent = (
                <div
                  className="group relative h-full bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm 
                             transition-all duration-300 ease-out 
                             group-hover/grid:scale-[0.97] group-hover/grid:opacity-60 
                             hover:!scale-[1.04] hover:!opacity-100 hover:!z-20 hover:shadow-2xl hover:border-orange-300
                             flex flex-col cursor-pointer"
                >
                  <div className="relative w-full aspect-[16/9] bg-gray-100 overflow-hidden border-b border-gray-100">
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
                      <span>{item.isExternal ? 'ไปยังเว็บภายนอก ↗' : 'เข้าสู่ระบบเพื่อใช้งาน →'}</span>
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
                  className="block h-full"
                >
                  {CardContent}
                </a>
              ) : (
                <Link key={item.id} href={item.link} className="block h-full">
                  {CardContent}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Section 2: ทำไมต้องใช้ระบบ — จัดเรียงแบบรายการแนวนอนคั่นเส้น แทนการ์ด 3 ใบเดิม */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-3">
            <span className="inline-block w-6 h-0.5 bg-orange-600" />
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug">
              ระบบจัดการห้องโปรเจกต์คืออะไร
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              แพลตฟอร์มศูนย์กลางเพื่ออำนวยความสะดวกแก่นักศึกษาและอาจารย์ในการบริหารจัดการพื้นที่ ทรัพยากร
              และความเรียบร้อยภายในห้องปฏิบัติการโปรเจกต์ สาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ
            </p>
          </div>

          <div className="lg:col-span-8 divide-y divide-gray-200 border-t border-b border-gray-200">
            {highlights.map((item) => (
              <div key={item.title} className="flex items-start gap-5 py-6 first:pt-0 last:pb-0">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-xl">
                  {item.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-xs sm:text-sm text-gray-500 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: กฎระเบียบ (post-it) และผู้พัฒนา — วางคู่กันเป็น 2 คอลัมน์ */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Post-it กฎระเบียบ */}
          <div className="lg:col-span-7 flex justify-center lg:justify-start">
            <div className="relative w-full max-w-xl bg-amber-100 border-2 border-amber-300 p-6 sm:p-8 rounded-sm shadow-xl transform -rotate-1 transition hover:rotate-0 duration-300">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-amber-200/80 border border-amber-300/60 shadow-sm rotate-2"></div>
              <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-red-500 border border-red-700 shadow-md"></div>

              <h3 className="text-lg sm:text-xl font-bold text-amber-900 mb-3 flex items-center gap-2 border-b-2 border-amber-300/60 pb-2">
                📌 กฎระเบียบและข้อปฏิบัติการใช้ห้อง
              </h3>

              <ul className="space-y-2.5 text-xs sm:text-sm font-medium text-amber-950 list-disc list-inside leading-relaxed">
                <li>กรุณา<strong>ลงชื่อเข้าใช้</strong>และ<strong>ลงชื่อออก</strong>ทุกครั้งเมื่อเข้าใช้ห้องโปรเจกต์</li>
                <li>ช่วยกันดูแลและรักษาความสะอาด จัดเก็บอุปกรณ์เข้าที่เดิมหลังใช้งานเสร็จสิ้น</li>
                <li>ห้ามนำอาหารหรือเครื่องดื่มแบบเปิดฝาเข้ามาในพื้นที่เครื่องคอมพิวเตอร์</li>
                <li>หากพบอุปกรณ์ชำรุดหรือเกิดข้อขัดข้อง กรุณาใช้งานเมนู <strong>แจ้งเหตุ</strong> ทันที</li>
                <li>ไม่ส่งเสียงดัง หรือกระทำการผิดกฎหมาย มั่วสุมภายในห้องโปรเจกต์เด็ดขาด</li>
                <li>ปิดสวิตช์ไฟ เครื่องปรับอากาศ และอุปกรณ์ไฟฟ้าทุกครั้งเมื่อเป็นคนสุดท้ายที่ออกจากห้อง</li>
              </ul>
            </div>
          </div>

          {/* ผู้พัฒนา — จัดเป็นรายการแนวตั้งคั่นเส้น แทนการ์ดคู่เดิม */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">👥 สมาชิกผู้พัฒนาเว็บไซต์</h2>
              <p className="text-xs text-gray-500">
                คณะผู้จัดทำระบบสารสนเทศเพื่อการจัดการห้องปฏิบัติการโปรเจกต์
              </p>
            </div>

            {/* อาจารย์ที่ปรึกษา */}
            <div>
              <p className="text-xs font-bold text-orange-600 mb-2">อาจารย์ที่ปรึกษา</p>
              <div className="flex items-start gap-4 pb-4 border-b border-gray-100">
                <img
                  src={advisor.image}
                  alt={advisor.name}
                  className="w-11 h-11 rounded-full object-cover border border-orange-200 shrink-0"
                />
                <div className="space-y-1">
                  <h3 className="font-bold text-gray-900 text-sm">{advisor.name}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{advisor.role}</p>
                </div>
              </div>
            </div>

            {/* ผู้พัฒนาระบบ */}
            <div>
              <p className="text-xs font-bold text-orange-600 mb-2">ผู้พัฒนาระบบ</p>
              <div className="divide-y divide-gray-100">
                {developers.map((dev, index) => (
                  <div key={index} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                    <img
                      src={dev.image}
                      alt={dev.name}
                      className="w-11 h-11 rounded-full object-cover border border-orange-200 shrink-0"
                    />
                    <div className="space-y-1">
                      <h3 className="font-bold text-gray-900 text-sm">{dev.name}</h3>
                      <p className="text-xs font-semibold text-orange-600">รหัสนักศึกษา: {dev.studentId}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{dev.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-[#2b2623] text-gray-300 py-8 text-xs border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
          <p className="font-bold text-white text-sm">Smart CIS KKU</p>
          <p className="text-gray-400 max-w-3xl mx-auto leading-relaxed">
            ระบบสารสนเทศเพื่อการจัดการห้องปฏิบัติการ สาขาวิชาวิทยาการคอมพิวเตอร์และสารสนเทศ มหาวิทยาลัยขอนแก่น
          </p>
          <div className="pt-2 border-t border-stone-800 text-stone-400 text-[11px] leading-relaxed">
            <p>
              ⚠️ <strong>หมายเหตุ:</strong> โปรเจกต์นี้เป็นส่วนหนึ่งของรายวิชาโครงงานทางวิทยาการและระเบียบวิธีวิจัยทางวิทยาการคอมพิวเตอร์และสารสนเทศ
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}