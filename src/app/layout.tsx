import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ElementorForge — AI-powered Elementor website generation",
  description: "Describe your business and get complete, responsive, fully editable native Elementor pages written into your WordPress site as drafts.",
  keywords: ["Elementor", "WordPress", "AI websites", "ElementorForge", "page generation"],
  authors: [{ name: "ElementorForge" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ElementorForge",
    description: "AI-powered native Elementor website generation",
    siteName: "ElementorForge",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ElementorForge",
    description: "AI-powered native Elementor website generation",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
