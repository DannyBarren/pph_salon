import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/store/AppContext";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "PPH Stylist App",
  description: "Understand and plan your earnings based on hours and production.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6d49ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
