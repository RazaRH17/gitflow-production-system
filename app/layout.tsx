import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gitflow Production System",
  description: "Automated dynamic deployment dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
