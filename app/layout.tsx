import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default:  '法拍屋・實價登錄 | 全台房地產資訊平台',
    template: '%s | 法拍屋資訊平台',
  },
  description: '全台最完整的法拍屋查詢與實價登錄資料庫。最新開標資訊、歷史底價走勢、周邊成交行情，一站掌握台灣房地產市場。',
  keywords:    ['法拍屋', '實價登錄', '法拍', '台灣房地產', '法院拍賣', '底價查詢', '成交行情'],
  openGraph: {
    type:   'website',
    locale: 'zh_TW',
    siteName: '法拍屋資訊平台',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
