import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"RazorProcure — AI Procurement for Retailers",description:"Purchase memory, supplier optimization and safe agentic payments powered by ShadowFunnel and Razorpay."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
