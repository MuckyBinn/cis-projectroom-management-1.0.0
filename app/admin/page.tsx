'use client';


import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  FileSpreadsheet, Users, ClipboardList, AlertTriangle, LayoutDashboard, 
  Upload, Eye, Shield, UserCheck, ChevronDown, LogOut 
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface UserProfile {
  name?: string;
  studentId?: string;
  email: string;
  role: string;
  profileImage?: string;
  year?: string;
}

// ฟังก์ชันแปลงสถานะดิบหรือภาษาอังกฤษให้เป็นภาษาไทยที่ถูกต้องและสวยงาม
const translateStatusToThai = (status: string) => {
  if (!status) return 'รอการดำเนินการ';
  const s = status.trim().toLowerCase();
  
  if (s.includes('success') || s.includes('completed') || s.includes('สำเร็จ') || s.includes('เสร็จสิ้น') || s.includes('ดำเนินการเสร็จสิ้น')) {
    return 'แก้ไขสำเร็จ';
  }
  if (s.includes('process') || s.includes('กำลัง') || s.includes('doing')) {
    return 'กำลังดำเนินการ';
  }
  if (s.includes('receive') || s.includes('pending') || s.includes('wait') || s.includes('รอ') || s === 'received') {
    return 'รอการดำเนินการ';
  }
  return status; // หากมีค่าอื่นให้แสดงตามจริงหรือคงเดิม
};

export default function AdminTrackingPage() {
  const router = useRouter();
  const pathname = usePathname(); // เพิ่มการดึงค่า pathname
  const dropdownRef = useRef<HTMLDivElement>(null); // เพิ่ม ref สำหรับ dropdown

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'checkin' | 'report' | 'users'>('overview');

  // เพิ่ม State ที่ขาดหายไปสำหรับ Dropdown ทั่วไป
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // เพิ่มตัวแปรสำหรับเช็คสถานะและแสดงผลที่ขาดหายไปใน Header
  const isAdmin = profile?.role === 'admin';
  const isTrackingActive = pathname === '/tracking' || pathname === '/admin';
  const userData = profile || { 
    name: 'กำลังโหลด...', 
    studentId: '-', 
    profileImage: '/images/defaultprofile.jpg' 
  };

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allCheckins, setAllCheckins] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);

  const getCurrentMonth = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [checkinMonth, setCheckinMonth] = useState(getCurrentMonth());
  const [checkinFilter, setCheckinFilter] = useState('all');
  const [checkinSort, setCheckinSort] = useState<'desc' | 'asc'>('desc');
  const [currentCheckinPage, setCurrentCheckinPage] = useState(1);
  const checkinsPerPage = 10;

  // Report States
  const [reportSubTab, setReportSubTab] = useState<'overview' | 'repair' | 'issue' | 'report'>('overview');
  const [reportSort, setReportSort] = useState<'desc' | 'asc'>('desc');

  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [adminStatus, setAdminStatus] = useState('รอการดำเนินการ');
  const [adminNote, setAdminNote] = useState('');
  const [adminImages, setAdminImages] = useState<string[]>([]);

  // ฟังก์ชันแปลงวันที่
  const formatDateTime = (val: any) => {
    if (!val) return { dateStr: '-', timeStr: '-', fullStr: '-' };
    let d: Date | null = null;

    if (val?.toDate && typeof val.toDate === 'function') {
      d = val.toDate();
    } else if (val?.seconds) {
      d = new Date(val.seconds * 1000);
    } else if (typeof val === 'number') {
      d = new Date(val);
    } else if (typeof val === 'string') {
      d = new Date(val);
    }

    if (!d || isNaN(d.getTime())) {
      return { dateStr: String(val), timeStr: '-', fullStr: String(val) };
    }

    const dateStr = d.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { dateStr, timeStr, fullStr: `${dateStr} ${timeStr}` };
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/preloginhomepage');
        return;
      }
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        let currentUserName = currentUser.displayName || 'ผู้ดูแลระบบ';
        let userRole = 'student';

        if (userSnap.exists()) {
          const data = userSnap.data();
          currentUserName = data.name || currentUserName;
          userRole = data.role || 'student';
          setProfile({
            name: currentUserName,
            studentId: data.studentId || '-',
            email: currentUser.email || '',
            role: userRole,
            profileImage: data.profileImage || currentUser.photoURL || '/images/defaultprofile.jpg',
            year: data.year || '-',
          });
        } else {
          setProfile({
            name: currentUserName,
            studentId: '-',
            email: currentUser.email || '',
            role: 'student',
            profileImage: currentUser.photoURL || '/images/defaultprofile.jpg',
            year: '-',
          });
        }

        if (userRole !== 'admin') {
          router.replace('/homepage');
          return;
        }

        const usersSnap = await getDocs(collection(db, 'users'));
        const usersList: any[] = [];
        usersSnap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
        setAllUsers(usersList);

        const checkinsSnap = await getDocs(collection(db, 'checkins'));
        const checkinsList: any[] = [];
        checkinsSnap.forEach(d => {
          const data = d.data();
          const userInfo = usersList.find(u => u.id === data.uid || u.id === data.userId);
          checkinsList.push({ 
            id: d.id, 
            ...data,
            name: data.name || userInfo?.name || 'ไม่ระบุชื่อ',
            studentId: data.studentId || userInfo?.studentId || '-',
            year: data.year || userInfo?.year || '-',
            email: data.email || userInfo?.email || '-'
          });
        });
        setAllCheckins(checkinsList);

        const reportsSnap = await getDocs(collection(db, 'reports'));
        const reportsList: any[] = [];
        reportsSnap.forEach(d => {
          const data = d.data();
          const imgMap = data.images || {};
          const userInfo = usersList.find(u => u.id === data.uid || u.id === imgMap.uid);

          const isAnon = imgMap.isAnonymous === true || data.isAnonymous === true;
          const repName = isAnon ? 'Anonymous' : (imgMap.reporterName || data.name || userInfo?.name || 'ไม่ระบุชื่อ');
          const repStudentId = isAnon ? 'ไม่ระบุ' : (imgMap.studentId || data.studentId || userInfo?.studentId || '-');
          const repYear = isAnon ? 'ไม่ระบุ' : (data.year || userInfo?.year || '-');
          const repEmail = isAnon ? 'ไม่ระบุ' : (data.email || userInfo?.email || '-');

          const createdAtParsed = formatDateTime(data.createdAt || data.createdAtMs);
          const updatedAtParsed = formatDateTime(data.updatedAt);

          let reportImgs: string[] = [];
          if (Array.isArray(data.images)) reportImgs = data.images;
          else if (typeof data.images === 'string') reportImgs = [data.images];
          else if (Array.isArray(imgMap.urls)) reportImgs = imgMap.urls;
          else if (imgMap.imageUrl) reportImgs = [imgMap.imageUrl];

          const rawStatus = data.status || imgMap.status || 'รอการดำเนินการ';

          reportsList.push({
            id: d.id,
            ...data,
            isAnonymous: isAnon,
            name: repName,
            studentId: repStudentId,
            year: repYear,
            email: repEmail,
            title: data.title || imgMap.title || data.subject || 'ไม่มีหัวข้อ',
            category: data.category || data.type || 'แจ้งซ่อม',
            detail: data.detail || data.description || '-',
            status: translateStatusToThai(rawStatus),
            createdAtStr: createdAtParsed.fullStr,
            updatedAtStr: updatedAtParsed.fullStr,
            images: reportImgs,
            adminImages: (Array.isArray(data.adminImages) ? data.adminImages : [])
              .filter((u: any) => typeof u === 'string' && !u.startsWith('blob:')),
            adminNote: data.adminNote || ''
          });
        });
        setAllReports(reportsList);

      } catch (err) {
        console.error("Error fetching admin data:", err);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  const handleUpdateReportStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;

    const isCompletedNow = adminStatus.includes('สำเร็จ') || adminStatus.includes('เสร็จสิ้น');
    
    if (isCompletedNow) {
      if (!adminNote || adminNote.trim() === '') {
        alert('กรุณากรอกบันทึกผลการแก้ไข (Admin Note) ก่อนยืนยัน');
        return;
      }
      if (!adminImages || adminImages.length === 0) {
        alert('กรุณาอัปเดต / แนบรูปภาพการแก้ไขอย่างน้อย 1 รูป (สูงสุดไม่เกิน 3 รูป)');
        return;
      }
    }

    try {
      const reportRef = doc(db, 'reports', selectedReport.id);
      const now = new Date();
      const thaiStatus = translateStatusToThai(adminStatus);
      await updateDoc(reportRef, {
        status: thaiStatus,
        adminNote: adminNote,
        adminImages: adminImages,
        updatedAt: now,
      });

      const updatedTimeStr = formatDateTime(now).fullStr;
      setAllReports(prev => prev.map(r => r.id === selectedReport.id ? { 
        ...r, 
        status: thaiStatus, 
        adminNote, 
        adminImages, 
        updatedAtStr: updatedTimeStr 
      } : r));
      alert('อัปเดตสถานะสำเร็จเรียบร้อย');
      setSelectedReport(null);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
    }
  };

  // ย่อรูปแล้วแปลงเป็น base64 (ฝังอยู่ในข้อความ ไม่หายเมื่อรีเฟรช)
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const MAX = 800;
          let { width, height } = img;
          if (width > height) {
            if (width > MAX) {
              height *= MAX / width;
              width = MAX;
            }
          } else {
            if (height > MAX) {
              width *= MAX / height;
              height = MAX;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files;
    if (!files || files.length === 0) return;

    if (adminImages.length + files.length > 3) {
      alert('สามารถแนบรูปภาพการแก้ไขได้สูงสุดไม่เกิน 3 รูป');
      input.value = '';
      return;
    }

    try {
      const newImgs = await Promise.all(Array.from(files).map(compressImage));
      setAdminImages(prev => [...prev, ...newImgs].slice(0, 3));
    } catch (err) {
      console.error('Image compress error:', err);
      alert('ไม่สามารถอ่านไฟล์รูปภาพได้ กรุณาลองใหม่');
    } finally {
      input.value = ''; // เลือกไฟล์เดิมซ้ำได้
    }
  };

  const filteredCheckins = allCheckins.filter(c => {
    let matchMonth = true;
    if (checkinMonth) {
      const [targetYearStr, targetMonthStr] = checkinMonth.split('-');
      const targetYearNum = parseInt(targetYearStr, 10);
      const targetMonthNum = parseInt(targetMonthStr, 10);
      const targetThaiYear = targetYearNum + 543;
      const checkInStr = String(c.checkInTime || c.createdAt || '');
      
      const matchSlash = checkInStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (matchSlash) {
        const dMonth = parseInt(matchSlash[2], 10);
        const dYear = parseInt(matchSlash[3], 10);
        matchMonth = (dMonth === targetMonthNum) && (dYear === targetYearNum || dYear === targetThaiYear);
      } else {
        matchMonth = checkInStr.includes(targetMonthStr) || checkInStr.includes(targetYearStr);
      }
    }

    let matchFilter = true;
    if (checkinFilter === 'active') matchFilter = c.status === 'active';
    if (checkinFilter === 'checkedout') matchFilter = c.status === 'completed' || c.status === 'checked-out';
    if (checkinFilter === 'overdue') matchFilter = c.isAutoCheckout || c.status === 'auto-completed';
    return matchMonth && matchFilter;
  }).sort((a, b) => {
    const timeA = a.createdAt?.toMillis?.() || new Date(a.checkInTime || a.createdAt || 0).getTime();
    const timeB = b.createdAt?.toMillis?.() || new Date(b.checkInTime || b.createdAt || 0).getTime();
    return checkinSort === 'desc' ? timeB - timeA : timeA - timeB;
  });

  const indexOfLastCheckin = currentCheckinPage * checkinsPerPage;
  const indexOfFirstCheckin = indexOfLastCheckin - checkinsPerPage;
  const currentCheckinRows = filteredCheckins.slice(indexOfFirstCheckin, indexOfLastCheckin);
  const totalCheckinPages = Math.ceil(filteredCheckins.length / checkinsPerPage);

  const checkinStats = {
    total: allCheckins.length,
    active: allCheckins.filter(c => c.status === 'active').length,
    completed: allCheckins.filter(c => c.status === 'completed' || c.status === 'checked-out').length,
    overdue: allCheckins.filter(c => c.isAutoCheckout || c.status === 'auto-completed').length,
  };

  const handleExportCheckinExcel = () => {
    const formattedData = filteredCheckins.map(c => {
      const fullName = c.name || '-';
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '-';
      const lastName = nameParts.slice(1).join(' ') || '-';

      let statusText = 'ลงชื่อออกแล้ว';
      if (c.isAutoCheckout || c.status === 'auto-completed') statusText = 'ออกจากระบบเกินเวลา';
      else if (c.status === 'active') statusText = 'ยังไม่ลงชื่อออก';

      return {
        "ชื่อ": firstName,
        "นามสกุล": lastName,
        "รหัสนักศึกษา": c.studentId || '-',
        "ชั้นปี": c.year || '-',
        "อีเมล": c.email || '-',
        "เวลาที่ลงชื่อเข้า": c.checkInTime || c.timeIn || '-',
        "เวลาที่ลงชื่อออก": c.checkOutTime || c.timeOut || '-',
        "หมายเหตุ": c.note || '-',
        "สถานะการลงชื่อ": statusText
      };
    });

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CheckIn_Report");
    XLSX.writeFile(wb, `CheckIn_Summary_${checkinMonth || 'All'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getFilteredReports = (type: string) => {
    let list = allReports;
    if (type !== 'overview' && type !== 'all') {
      list = allReports.filter(r => {
        const cat = String(r.category || '').toLowerCase();
        if (type === 'repair') return cat.includes('ซ่อม') || cat.includes('repair');
        if (type === 'issue') return cat.includes('เหตุ') || cat.includes('issue');
        if (type === 'report') return cat.includes('รายงาน') || cat.includes('ร้องเรียน') || cat.includes('complaint');
        return true;
      });
    }
    return list.sort((a, b) => {
      const timeA = new Date(a.createdAtStr || 0).getTime();
      const timeB = new Date(b.createdAtStr || 0).getTime();
      return reportSort === 'desc' ? timeB - timeA : timeA - timeB;
    });
  };

  const repairCount = allReports.filter(r => String(r.category || '').toLowerCase().includes('ซ่อม')).length;
  const issueCount = allReports.filter(r => String(r.category || '').toLowerCase().includes('เหตุ')).length;
  const complaintCount = allReports.filter(r => String(r.category || '').toLowerCase().includes('รายงาน') || String(r.category || '').toLowerCase().includes('ร้องเรียน')).length;

  const reportCategoryChartData = [
    { name: 'แจ้งซ่อม', count: repairCount },
    { name: 'แจ้งเหตุ', count: issueCount },
    { name: 'ร้องเรียน/รายงาน', count: complaintCount },
  ];

  const reportStatusChartData = [
    { name: 'รอการแก้ไข', value: allReports.filter(r => !String(r.status || '').includes('สำเร็จ') && !String(r.status || '').includes('เสร็จสิ้น')).length },
    { name: 'แก้ไขสำเร็จ', value: allReports.filter(r => String(r.status || '').includes('สำเร็จ') || String(r.status || '').includes('เสร็จสิ้น')).length },
  ];

  const PIE_COLORS = ['#f59e0b', '#10b981'];

  const handleExportReportExcel = (tabType: string) => {
    const rawList = getFilteredReports(tabType);

    const mapRowData = (item: any) => {
      const isComplete = String(item.status || '').includes('สำเร็จ') || String(item.status || '').includes('เสร็จสิ้น');
      const statusText = isComplete ? `แก้ไขสำเร็จ (${item.updatedAtStr || '-'})` : (translateStatusToThai(item.status) || 'รอการดำเนินการ');

      let firstName = '-';
      let lastName = '-';
      if (item.isAnonymous) {
        firstName = 'Anonymous';
        lastName = '';
      } else {
        const nameParts = (item.name || '').trim().split(' ');
        firstName = nameParts[0] || '-';
        lastName = nameParts.slice(1).join(' ') || '-';
      }

      return {
        "ชื่อ": firstName,
        "นามสกุล": lastName,
        "รหัสนักศึกษา": item.studentId,
        "ชั้นปี": item.year,
        "อีเมล": item.email,
        "หัวข้อ": item.title,
        "หมวดหมู่": item.category,
        "เวลาที่แจ้ง": item.createdAtStr,
        "สถานะ": statusText
      };
    };

    const sheet1Data = rawList
      .filter(r => !String(r.status || '').includes('สำเร็จ') && !String(r.status || '').includes('เสร็จสิ้น'))
      .map(mapRowData);

    const sheet2Data = rawList.map(mapRowData);

    const sheet3Data = rawList
      .filter(r => String(r.status || '').includes('สำเร็จ') || String(r.status || '').includes('เสร็จสิ้น'))
      .map(mapRowData);

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
    const ws3 = XLSX.utils.json_to_sheet(sheet3Data);

    XLSX.utils.book_append_sheet(wb, ws1, "รอการดำเนินการ");
    XLSX.utils.book_append_sheet(wb, ws2, tabType === 'overview' ? "ข้อมูลทั้งหมด" : `ข้อมูล_${tabType}`);
    XLSX.utils.book_append_sheet(wb, ws3, "แก้ไขสำเร็จ");

    XLSX.writeFile(wb, `Report_Summary_${tabType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getUsersByYear = (yearStr: string) => allUsers.filter(u => String(u.year || '').includes(yearStr));
  const year1Users = getUsersByYear('1');
  const year2Users = getUsersByYear('2');
  const year3Users = getUsersByYear('3');
  const year4Users = allUsers.filter(u => String(u.year || '').includes('4') || Number(u.year || 0) >= 4);

  const exportToExcel = (data: any[], fileName: string) => {
    const formattedData = data.map(u => {
      const fullName = u.name || '-';
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '-';
      const lastName = nameParts.slice(1).join(' ') || '-';

      return {
        "ชื่อ": firstName,
        "นามสกุล": lastName,
        "รหัสนักศึกษา": u.studentId || '-',
        "ชั้นปี": u.year || '-',
        "อีเมล": u.email || '-',
      };
    });

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users_Report");
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-gray-800 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      
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
                  src={userData.profileImage} 
                  alt="Profile" 
                  className="w-full h-full object-cover rounded-full aspect-square"
                />
              </div>
              <div className="text-left min-w-0 pr-0.5 hidden sm:block">
                <span className="block text-[12px] font-bold text-gray-900 leading-tight truncate group-hover:text-orange-600 transition-colors">
                  {userData.name}
                </span>
                <span className="block text-[10px] font-medium text-gray-400 tracking-wide truncate">
                  {userData.studentId}
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

      {/* BODY CONTAINER */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
        
        {/* SIDEBAR */}
        <aside className="w-full md:w-64 bg-white md:min-h-[calc(100vh-4rem)] border-r border-gray-200 p-4 shrink-0 space-y-1">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">Admin Navigation</p>
          
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${activeTab === 'overview' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> ภาพรวมของระบบ
          </button>

          <button
            onClick={() => setActiveTab('checkin')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${activeTab === 'checkin' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ClipboardList className="w-4 h-4" /> ภาพรวมการลงชื่อเข้าใช้
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${activeTab === 'report' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <AlertTriangle className="w-4 h-4" /> ภาพรวมการแจ้งเหตุ
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${activeTab === 'users' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Users className="w-4 h-4" /> รายชื่อผู้ใช้งานทั้งหมด
          </button>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-hidden">
          
          {/* 1. ภาพรวมของระบบ */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">📊 ภาพรวมของระบบทั้งหมด (System Overview)</h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">ข้อมูลสรุปสถิติภาพรวมของผู้ใช้งานและการทำรายการทั้งหมดในระบบห้องโปรเจกต์</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">ผู้ใช้งานทั้งหมด</p>
                    <h3 className="text-2xl font-black text-gray-900 mt-1">{allUsers.length} <span className="text-xs font-semibold text-gray-500">คน</span></h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">👥</div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">ลงชื่อเข้าใช้ห้อง</p>
                    <h3 className="text-2xl font-black text-gray-900 mt-1">{allCheckins.length} <span className="text-xs font-semibold text-gray-500">ครั้ง</span></h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">📥</div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">แจ้งเหตุ / ปัญหา</p>
                    <h3 className="text-2xl font-black text-gray-900 mt-1">{allReports.length} <span className="text-xs font-semibold text-gray-500">เรื่อง</span></h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold">🚨</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-4">📈 กราฟแสดงสถิติจำนวนรายการในแต่ละระบบ</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'ผู้ใช้งาน', count: allUsers.length },
                      { name: 'ลงชื่อเข้าใช้', count: allCheckins.length },
                      { name: 'แจ้งเหตุ', count: allReports.length },
                    ]}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f97316" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* 2. ภาพรวมการลงชื่อเข้าใช้ */}
          {activeTab === 'checkin' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">📥 ภาพรวมการลงชื่อเข้าใช้ห้อง (Check-In Management)</h1>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">จัดการและตรวจสอบประวัติการเข้าใช้งานห้องของทุกคนในระบบ</p>
                </div>
                <button 
                  onClick={handleExportCheckinExcel}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
                >
                  <FileSpreadsheet className="w-4 h-4" /> ดาวน์โหลด Excel
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-[11px] font-bold text-gray-400 uppercase">ยอดลงชื่อทั้งหมด</p>
                  <h3 className="text-2xl font-black text-gray-900 mt-1">{filteredCheckins.length} <span className="text-xs font-semibold text-gray-500">ครั้ง</span></h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-[11px] font-bold text-gray-400 uppercase">กำลังลงชื่อใช้งาน</p>
                  <h3 className="text-2xl font-black text-amber-600 mt-1">{checkinStats.active} <span className="text-xs font-semibold text-gray-500">คน</span></h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-[11px] font-bold text-gray-400 uppercase">ลงชื่อออกแล้ว</p>
                  <h3 className="text-2xl font-black text-emerald-600 mt-1">{checkinStats.completed} <span className="text-xs font-semibold text-gray-500">คน</span></h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-[11px] font-bold text-gray-400 uppercase">ออกเกินเวลา</p>
                  <h3 className="text-2xl font-black text-rose-600 mt-1">{checkinStats.overdue} <span className="text-xs font-semibold text-gray-500">ครั้ง</span></h3>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-gray-200 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">เลือกเดือน:</span>
                    <input 
                      type="month" 
                      value={checkinMonth} 
                      onChange={e => {
                        setCheckinMonth(e.target.value);
                        setCurrentCheckinPage(1);
                      }} 
                      className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 bg-white"
                    />
                    {checkinMonth && (
                      <button 
                        onClick={() => {
                          setCheckinMonth('');
                          setCurrentCheckinPage(1);
                        }} 
                        className="text-xs text-rose-500 hover:underline font-bold px-1"
                      >
                        ล้างเดือน
                      </button>
                    )}
                  </div>
                  <select 
                    value={checkinFilter} 
                    onChange={e => {
                      setCheckinFilter(e.target.value);
                      setCurrentCheckinPage(1);
                    }}
                    className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="all">ตัวกรองสถานะทั้งหมด</option>
                    <option value="active">กำลังใช้งาน (ยังไม่ลงชื่อออก)</option>
                    <option value="checkedout">ลงชื่อออกแล้ว (ปกติ)</option>
                    <option value="overdue">ลงชื่อออกเกินเวลา</option>
                  </select>

                  <select 
                    value={checkinSort} 
                    onChange={e => {
                      setCheckinSort(e.target.value as 'desc' | 'asc');
                      setCurrentCheckinPage(1);
                    }}
                    className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 bg-white font-bold text-gray-700"
                  >
                    <option value="desc">📅 เรียงจากใหม่ที่สุด</option>
                    <option value="asc">📅 เรียงจากเก่าที่สุด</option>
                  </select>
                </div>
                <span className="text-xs font-bold text-gray-500">แสดงผล {filteredCheckins.length} รายการ</span>
              </div>

              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3">ชื่อ - นามสกุล</th>
                        <th className="px-4 py-3">รหัสนักศึกษา</th>
                        <th className="px-4 py-3">ชั้นปี</th>
                        <th className="px-4 py-3">อีเมล</th>
                        <th className="px-4 py-3">เวลาเข้า</th>
                        <th className="px-4 py-3">เวลาออก</th>
                        <th className="px-4 py-3">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentCheckinRows.map((c, i) => (
                        <tr key={c.id || i} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-bold text-gray-900">{c.name || '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.studentId || '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.year || '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.email || '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.checkInTime || c.timeIn || '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.checkOutTime || c.timeOut || '-'}</td>
                          <td className="px-4 py-3">
                            {c.isAutoCheckout || c.status === 'auto-completed' ? (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md font-bold">เกินเวลา</span>
                            ) : c.status === 'active' ? (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md font-bold">กำลังใช้งาน</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md font-bold">ออกแล้ว</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {currentCheckinRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-gray-400">ไม่พบข้อมูลการลงชื่อเข้าใช้ตามเงื่อนไข</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-white">
                  <span className="text-xs text-gray-500 font-medium">
                    แสดงหน้า {currentCheckinPage} จาก {totalCheckinPages || 1} (ทั้งหมด {filteredCheckins.length} รายการ)
                  </span>
                  <div className="flex gap-1.5">
                    {Array.from({ length: totalCheckinPages }, (_, i) => i + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentCheckinPage(pageNumber)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          currentCheckinPage === pageNumber
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. ภาพรวมการแจ้งเหตุ */}
          {activeTab === 'report' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">🚨 ภาพรวมการแจ้งเหตุ / แจ้งซ่อม / รายงาน</h1>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">จัดการปัญหาและข้อร้องเรียนจากผู้ใช้งาน พร้อมอัปเดตสถานะได้แบบเรียลไทม์</p>
                </div>
                <button 
                  onClick={() => handleExportReportExcel(reportSubTab)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
                >
                  <FileSpreadsheet className="w-4 h-4" /> ดาวน์โหลด Excel
                </button>
              </div>

              {/* Sub Tabs */}
              <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
                <button 
                  onClick={() => setReportSubTab('overview')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${reportSubTab === 'overview' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                >
                  ภาพรวมการแจ้งเหตุ
                </button>
                <button 
                  onClick={() => setReportSubTab('repair')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${reportSubTab === 'repair' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                >
                  แจ้งซ่อม
                </button>
                <button 
                  onClick={() => setReportSubTab('issue')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${reportSubTab === 'issue' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                >
                  แจ้งเหตุ
                </button>
                <button 
                  onClick={() => setReportSubTab('report')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${reportSubTab === 'report' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                >
                  รายงาน / ร้องเรียน
                </button>
              </div>

              {reportSubTab === 'overview' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
                      <p className="text-xs font-bold text-gray-400 uppercase">ยอดการแจ้งเหตุทั้งหมด</p>
                      <h3 className="text-2xl font-black text-gray-900 mt-1">{allReports.length} <span className="text-xs font-semibold text-gray-500">เรื่อง</span></h3>
                    </div>
                    <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
                      <p className="text-xs font-bold text-gray-400 uppercase">รอการดำเนินการ</p>
                      <h3 className="text-2xl font-black text-amber-600 mt-1">
                        {allReports.filter(r => !String(r.status || '').includes('สำเร็จ') && !String(r.status || '').includes('เสร็จสิ้น')).length} <span className="text-xs font-semibold text-gray-500">เรื่อง</span>
                      </h3>
                    </div>
                    <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
                      <p className="text-xs font-bold text-gray-400 uppercase">แก้ไขสำเร็จแล้ว</p>
                      <h3 className="text-2xl font-black text-emerald-600 mt-1">
                        {allReports.filter(r => String(r.status || '').includes('สำเร็จ') || String(r.status || '').includes('เสร็จสิ้น')).length} <span className="text-xs font-semibold text-gray-500">เรื่อง</span>
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">📊 กราฟแท่ง: ยอดรวมการแจ้งของแต่ละหมวด</h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={reportCategoryChartData}>
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#f97316" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">🥧 กราฟวงกลม: สัดส่วนสถานะการแก้ไข</h3>
                      <div className="h-64 w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={reportStatusChartData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              dataKey="value"
                              label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              {reportStatusChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200">
                    <span className="text-xs font-bold text-gray-700 uppercase">รายการในหมวด: {reportSubTab} ({getFilteredReports(reportSubTab).length} เรื่อง)</span>
                    <select 
                      value={reportSort} 
                      onChange={e => setReportSort(e.target.value as any)}
                      className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="desc">เรียงจากใหม่ที่สุด - เก่าที่สุด</option>
                      <option value="asc">เรียงจากเก่าที่สุด - ใหม่ที่สุด</option>
                    </select>
                  </div>

                  <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3">ชื่อ - นามสกุล</th>
                            <th className="px-4 py-3">รหัสนักศึกษา</th>
                            <th className="px-4 py-3">ชั้นปี</th>
                            <th className="px-4 py-3">อีเมล</th>
                            <th className="px-4 py-3">หัวข้อ / เรื่องที่แจ้ง</th>
                            <th className="px-4 py-3">เวลาที่แจ้ง</th>
                            <th className="px-4 py-3">สถานะ</th>
                            <th className="px-4 py-3 text-center">ดูรูปภาพ / รายละเอียด</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {getFilteredReports(reportSubTab).map((r, i) => {
                            const isComplete = String(r.status || '').includes('สำเร็จ') || String(r.status || '').includes('เสร็จสิ้น');
                            const thaiStatusText = translateStatusToThai(r.status);
                            return (
                              <tr key={r.id || i} className="hover:bg-gray-50/50">
                                <td className="px-4 py-3 font-bold text-gray-900">
                                  {r.isAnonymous ? <span className="text-gray-500 italic">Anonymous</span> : r.name}
                                </td>
                                <td className="px-4 py-3 text-gray-600">{r.studentId}</td>
                                <td className="px-4 py-3 text-gray-600">{r.year}</td>
                                <td className="px-4 py-3 text-gray-600">{r.email}</td>
                                <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{r.title}</td>
                                <td className="px-4 py-3 text-gray-600">{r.createdAtStr}</td>
                                <td className="px-4 py-3">
                                  {isComplete ? (
                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold inline-flex flex-col gap-0.5 leading-tight">
                                      <span>{thaiStatusText}</span>
                                      {r.updatedAtStr && r.updatedAtStr !== '-' && (
                                        <span className="text-[10px] font-normal text-emerald-500 tracking-tight whitespace-nowrap">({r.updatedAtStr})</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md font-bold inline-block">
                                      {thaiStatusText}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button 
                                    onClick={() => {
                                      setSelectedReport(r);
                                      setAdminStatus(thaiStatusText);
                                      setAdminNote(r.adminNote || '');
                                      setAdminImages(r.adminImages || []);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl font-bold transition text-xs"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> {isComplete ? 'ดูการส่งมอบงาน' : 'รายละเอียด / จัดการ'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {getFilteredReports(reportSubTab).length === 0 && (
                            <tr>
                              <td colSpan={8} className="text-center py-8 text-gray-400">ไม่พบรายการแจ้งเรื่องในหมวดหมู่นี้</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Popup สำหรับจัดการ / ดูรายละเอียดคำขอ และส่งมอบงาน */}
              {selectedReport && (() => {
                const isAlreadyCompleted = String(selectedReport.status || '').includes('สำเร็จ') || String(selectedReport.status || '').includes('เสร็จสิ้น');
                return (
                  <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-gray-900 text-base">
                          {isAlreadyCompleted ? '✅ ข้อมูลการส่งมอบงาน (งานนี้ดำเนินการสำเร็จแล้ว)' : '🛠️ รายละเอียดคำขอและการจัดการ'}
                        </h3>
                        <button onClick={() => setSelectedReport(null)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                          <div>
                            <span className="font-bold text-gray-500 block">ผู้แจ้ง:</span>
                            <p className="text-gray-900 font-semibold">{selectedReport.name}</p>
                          </div>
                          <div>
                            <span className="font-bold text-gray-500 block">รหัสนักศึกษา:</span>
                            <p className="text-gray-900">{selectedReport.studentId}</p>
                          </div>
                          <div>
                            <span className="font-bold text-gray-500 block">ชั้นปี:</span>
                            <p className="text-gray-900">{selectedReport.year}</p>
                          </div>
                          <div>
                            <span className="font-bold text-gray-500 block">อีเมล:</span>
                            <p className="text-gray-900">{selectedReport.email}</p>
                          </div>
                        </div>

                        <div>
                          <span className="font-bold text-gray-500 block">หมวดหมู่ / หัวข้อ (รายละเอียดคำขอจาก User):</span>
                          <p className="text-gray-900 font-semibold">[{selectedReport.category}] {selectedReport.title}</p>
                        </div>

                        <div>
                          <span className="font-bold text-gray-500 block">เนื้อหาคำขอจาก User:</span>
                          <p className="text-gray-800 bg-gray-50 p-3 rounded-xl border border-gray-200">{selectedReport.detail}</p>
                        </div>

                        <div>
                          <span className="font-bold text-gray-500 block mb-1">รูปภาพที่ผู้ใช้แนบมา:</span>
                          {selectedReport.images && selectedReport.images.length > 0 ? (
                            <div className="flex gap-2 flex-wrap">
                              {selectedReport.images.map((imgUrl: string, idx: number) => (
                                <a key={idx} href={imgUrl} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 block hover:opacity-90 bg-gray-100">
                                  <img src={imgUrl} alt="Report item" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-400 italic">ไม่มีรูปภาพที่ผู้ใช้แนบ</p>
                          )}
                        </div>

                        {isAlreadyCompleted && (
                          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 mt-2">
                            <span className="font-bold text-emerald-800 block text-xs">✨ ข้อมูลการส่งมอบงานจากแอดมิน:</span>
                            <div>
                              <span className="font-semibold text-gray-600 block text-[11px]">บันทึกผลการแก้ไข:</span>
                              <p className="text-gray-900 bg-white p-2 rounded-xl border border-emerald-100">{selectedReport.adminNote || '-'}</p>
                            </div>
                            <div>
                              <span className="font-semibold text-gray-600 block text-[11px] mb-1">รูปภาพหลักฐานการแก้ไข:</span>
                              {selectedReport.adminImages && selectedReport.adminImages.length > 0 ? (
                                <div className="flex gap-2 flex-wrap">
                                  {selectedReport.adminImages.map((imgUrl: string, idx: number) => (
                                    <a key={idx} href={imgUrl} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-emerald-300 block bg-white">
                                      <img src={imgUrl} alt="Admin Proof" className="w-full h-full object-cover" />
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-400 italic">ไม่มีรูปภาพหลักฐาน</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {isAlreadyCompleted ? (
                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-[11px] text-emerald-700 font-bold">🔒 เคสนี้ได้รับการยืนยันแก้ไขสำเร็จแล้ว ไม่สามารถเปลี่ยนแปลงสถานะได้</span>
                          <button type="button" onClick={() => setSelectedReport(null)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800">ปิดหน้าต่าง</button>
                        </div>
                      ) : (
                        <form onSubmit={handleUpdateReportStatus} className="space-y-4 pt-3 border-t border-gray-100">
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">อัปเดตสถานะ:</label>
                            <select 
                              value={adminStatus} 
                              onChange={e => setAdminStatus(e.target.value)}
                              className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 bg-white"
                            >
                              <option value="รอการดำเนินการ">รอการดำเนินการ</option>
                              <option value="กำลังดำเนินการ">กำลังดำเนินการ</option>
                              <option value="แก้ไขสำเร็จ">แก้ไขสำเร็จ</option>
                            </select>
                          </div>

                          {(adminStatus.includes('สำเร็จ') || adminStatus.includes('เสร็จสิ้น')) && (
                            <div className="space-y-3 animate-in fade-in bg-orange-50/60 p-3 rounded-2xl border border-orange-200">
                              <div>
                                <label className="block text-xs font-bold text-orange-800 mb-1">
                                  บันทึกผลการแก้ไข <span className="text-rose-500">*บังคับ</span>:
                                </label>
                                <textarea 
                                  rows={2}
                                  value={adminNote}
                                  onChange={e => setAdminNote(e.target.value)}
                                  placeholder="ระบุรายละเอียดการแก้ไขปัญหาให้ผู้ใช้ทราบ..."
                                  className="w-full border border-orange-300 rounded-xl p-2.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 bg-white"
                                  required
                                ></textarea>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-orange-800 mb-1">
                                  แนบรูปภาพผลการแก้ไข <span className="text-rose-500">*ขั้นต่ำ 1 รูป </span>:
                                </label>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  multiple 
                                  onChange={handleImageUpload}
                                  className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-orange-600 file:text-white hover:file:bg-orange-700 cursor-pointer mb-2"
                                />
                                {adminImages.length > 0 && (
                                  <div className="flex gap-2 flex-wrap mt-2">
                                    {adminImages.map((img, idx) => (
                                      <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-orange-300 bg-white">
                                        <img src={img} alt="Preview" className="w-full h-full object-cover" />
                                        <button 
                                          type="button" 
                                          onClick={() => setAdminImages(adminImages.filter((_, i) => i !== idx))}
                                          className="absolute top-0 right-0 bg-rose-600 text-white text-[10px] px-1 font-bold rounded-bl"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setSelectedReport(null)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200">ปิด</button>
                            <button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 shadow-sm">บันทึกสถานะ</button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 5. รายชื่อผู้ใช้งานทั้งหมดแยกตามชั้นปี */}
          {activeTab === 'users' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">👥 รายชื่อผู้ใช้งานทั้งหมด (Users)</h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">ข้อมูลสมาชิกในระบบแยกตามชั้นปี</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 text-sm">🎓 ชั้นปีที่ 1 ({year1Users.length} คน)</h3>
                    <button onClick={() => exportToExcel(year1Users, 'Users_Year_1')} className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {year1Users.map((u, i) => (
                      <div key={u.id || i} className="flex justify-between items-center p-2 rounded-xl bg-gray-50 text-xs">
                        <span className="font-bold text-gray-800">{u.name || 'ไม่ระบุชื่อ'}</span>
                        <span className="text-gray-500">{u.studentId || '-'}</span>
                      </div>
                    ))}
                    {year1Users.length === 0 && <p className="text-center py-4 text-xs text-gray-400">ไม่มีนักศึกษาชั้นปีที่ 1</p>}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 text-sm">🎓 ชั้นปีที่ 2 ({year2Users.length} คน)</h3>
                    <button onClick={() => exportToExcel(year2Users, 'Users_Year_2')} className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {year2Users.map((u, i) => (
                      <div key={u.id || i} className="flex justify-between items-center p-2 rounded-xl bg-gray-50 text-xs">
                        <span className="font-bold text-gray-800">{u.name || 'ไม่ระบุชื่อ'}</span>
                        <span className="text-gray-500">{u.studentId || '-'}</span>
                      </div>
                    ))}
                    {year2Users.length === 0 && <p className="text-center py-4 text-xs text-gray-400">ไม่มีนักศึกษาชั้นปีที่ 2</p>}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 text-sm">🎓 ชั้นปีที่ 3 ({year3Users.length} คน)</h3>
                    <button onClick={() => exportToExcel(year3Users, 'Users_Year_3')} className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {year3Users.map((u, i) => (
                      <div key={u.id || i} className="flex justify-between items-center p-2 rounded-xl bg-gray-50 text-xs">
                        <span className="font-bold text-gray-800">{u.name || 'ไม่ระบุชื่อ'}</span>
                        <span className="text-gray-500">{u.studentId || '-'}</span>
                      </div>
                    ))}
                    {year3Users.length === 0 && <p className="text-center py-4 text-xs text-gray-400">ไม่มีนักศึกษาชั้นปีที่ 3</p>}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 text-sm">🎓 ชั้นปีที่ 4 ({year4Users.length} คน)</h3>
                    <button onClick={() => exportToExcel(year4Users, 'Users_Year_4_Above')} className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {year4Users.map((u, i) => (
                      <div key={u.id || i} className="flex justify-between items-center p-2 rounded-xl bg-gray-50 text-xs">
                        <span className="font-bold text-gray-800">{u.name || 'ไม่ระบุชื่อ'}</span>
                        <span className="text-gray-500">{u.studentId || '-'}</span>
                      </div>
                    ))}
                    {year4Users.length === 0 && <p className="text-center py-4 text-xs text-gray-400">ไม่มีนักศึกษาชั้นปีที่ 4 </p>}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

    </div>
  );
}