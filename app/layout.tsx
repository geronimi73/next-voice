import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kitten TTS — Browser-based Text to Speech",
  description:
    "Generate natural-sounding speech from text entirely in your browser. Powered by Kitten TTS V0.8 and ONNX Runtime Web — multiple voices, adjustable speed, no server, no upload.",
  keywords: [
    "text to speech",
    "TTS",
    "Kitten TTS",
    "browser AI",
    "ONNX Runtime",
    "speech synthesis",
    "client-side AI",
    "offline TTS",
  ],
  openGraph: {
    title: "Kitten TTS — Browser-based Text to Speech",
    description:
      "Generate natural-sounding speech from text entirely in your browser. Powered by Kitten TTS V0.8 and ONNX Runtime Web — multiple voices, adjustable speed, no server, no upload.",
    type: "website",
    url: "https://next-voice.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kitten TTS — Browser-based Text to Speech",
    description:
      "Generate natural-sounding speech from text entirely in your browser. Powered by Kitten TTS V0.8 and ONNX Runtime Web.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
