import { Toaster } from "react-hot-toast";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

export const metadata = {
  title: "CivicGuardian AI",
  description:
    "An autonomous AI platform that detects, validates, prioritizes, predicts, and resolves civic infrastructure issues.",
  keywords: "civic, AI, community, infrastructure, Gemini",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif" }}>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              borderRadius: "12px",
              fontWeight: "600",
              fontSize: "14px",
            },
          }}
        />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
