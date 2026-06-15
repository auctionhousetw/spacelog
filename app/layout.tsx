import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spacelog.tw'),
  title: {
    default:  '法拍屋・實價登錄 | 全台房地產資訊平台',
    template: '%s | 法拍屋資訊平台',
  },
  description: '全台最完整的法拍屋查詢與實價登錄資料庫。最新開標資訊、歷史底價走勢、周邊成交行情，一站掌握台灣房地產市場。',
  keywords:    ['法拍屋', '實價登錄', '法拍', '台灣房地產', '法院拍賣', '底價查詢', '成交行情'],
  verification: {
    google: 'GWVaXrmKAicjp0rNIlcJi_CymLcmG9NxBxzwmc6kPuY',
  },
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    type:   'website',
    locale: 'zh_TW',
    siteName: '法拍屋資訊平台',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '法拍屋資訊平台' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
