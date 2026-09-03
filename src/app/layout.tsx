import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import { InstallApp } from "@/components/install-app";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerManager } from "@/components/service-worker-manager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owewell — Shared debt tracker",
  description: "A private, two-person ledger for everyday cash and card borrowing.",
  applicationName: "Owewell",
  appleWebApp: {
    // Standalone launch on iOS, where the manifest's `display` is ignored.
    capable: true,
    title: "Owewell",
    // `default` keeps dark status-bar text over the light page and insets the web
    // view below it. `black-translucent` would go full-bleed but forces white
    // text, which is invisible on this palette.
    statusBarStyle: "default",
  },
  formatDetection: {
    // Stops iOS turning invite codes and amounts into tappable phone numbers.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // `cover` is what makes env(safe-area-inset-*) non-zero, so the app can lay
  // itself out around a notch, a Dynamic Island and the home indicator.
  viewportFit: "cover",
  themeColor: "#f7f7f2",
  // The palette is light-only; declaring it stops mobile browsers auto-darkening
  // form controls into an unreadable mix.
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {/* Chromium fires `beforeinstallprompt` once, and usually before React
            hydrates. Stashing it here is what makes the install button reliable
            rather than a race the app usually loses. */}
        <Script id="install-prompt-capture" strategy="beforeInteractive">
          {"window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__owewellInstallPrompt=e});"}
        </Script>
        <OfflineBanner />
        {children}
        <InstallApp />
        <ServiceWorkerManager />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
