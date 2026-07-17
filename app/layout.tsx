import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Nav from "./components/Nav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "EasySell",
  description: "Prospecção e vendas de landing pages",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} font-sans`}>
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 p-6 max-w-6xl mx-auto w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
