import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
});

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "میزان",
  description: "هماهنگی فروش و تولید مبل",
  applicationName: "میزان",
  manifest: `${base}/manifest.webmanifest`,
  icons: { apple: `${base}/icons/apple-touch-icon.png` },
  // installed on iPhone/iPad: full screen, own name under the icon
  appleWebApp: { capable: true, title: "میزان", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#3B241A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
