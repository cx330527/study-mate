import type { Metadata } from "next";
import "./globals.css";
import "./study.css";

export const metadata: Metadata = {
  title: "学伴 StudyMate · 把学习变成每天的小进步",
  description: "学习问答、任务计划、专注计时和学习复盘，陪你走好每一小步。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
