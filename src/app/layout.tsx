import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/store/AppContext";
import { AuthProvider } from "@/store/AuthContext";
import { AppFrame } from "@/components/AppFrame";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";

export const metadata: Metadata = {
  title: "PPH Stylist App",
  description: "Understand and plan your earnings based on hours and production.",
  manifest: "/manifest.webmanifest",
  applicationName: "PPH Stylist",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PPH Stylist",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
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
        <RootErrorBoundary>
          <AuthProvider>
            <AppProvider>
              <AppFrame>{children}</AppFrame>
            </AppProvider>
          </AuthProvider>
        </RootErrorBoundary>
      </body>
    </html>
  );
}
