import type { Metadata } from "next";
import { brand } from "@qelvora/brand";
import "@qelvora/tokens/tokens.css";
import "@qelvora/ui-web/styles.css";
import "./globals.css";
import { Theme } from "./theme";
import { RecordingRetryCleanup } from "../features/media/RecordingRetryCleanup";
export const metadata: Metadata = {
  title: brand.name,
  description: "An authorized AI, with real creator presence.",
};
const themeScript = `try{var t=new URLSearchParams(location.search).get('theme');document.documentElement.dataset.theme=t==='light'||t==='night'?t:matchMedia('(prefers-color-scheme:dark)').matches?'night':'light'}catch(e){}`;
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Theme />
        <RecordingRetryCleanup />
        {children}
      </body>
    </html>
  );
}
