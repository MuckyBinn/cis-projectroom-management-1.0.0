import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "ระบบจัดการห้องโปรเจกต์ CS & IT",
  description: "ระบบจัดการห้องโปรเจกต์สาขาวิทยาการคอมพิวเตอร์และสารสนเทศ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}