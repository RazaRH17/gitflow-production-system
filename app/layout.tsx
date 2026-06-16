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
      <body>{children}</body>
    </html>
  );
}
