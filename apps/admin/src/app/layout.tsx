import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kashyap Adhikari Administration Portal',
  description: 'Governance, verification, and genealogy administration portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ne">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center gap-3 px-2 py-4 border-b border-slate-800">
                <div className="w-8 h-8 rounded-full bg-saffron-500 flex items-center justify-center font-bold text-white">
                  क
                </div>
                <div>
                  <h1 className="font-bold text-sm leading-tight text-saffron-400">कश्यप अधिकारी</h1>
                  <p className="text-xs text-slate-400">प्रशासनिक पोर्टल (Admin)</p>
                </div>
              </div>
              <nav className="mt-6 space-y-1">
                <a href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-saffron-600 text-white text-sm font-medium">
                  ड्यासवोर्ड (Dashboard)
                </a>
                <a href="#claims" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium">
                  दाबी प्रमाणीकरण (Claims Queue)
                </a>
                <a href="#genealogy" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium">
                  वंशावली सम्पादन (Genealogy Editor)
                </a>
                <a href="#changes" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium">
                  परिमार्जन अनुरोध (Change Requests)
                </a>
                <a href="#duplicates" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium">
                  दोहोरिएको खोज (Duplicates/Merge)
                </a>
                <a href="#rules" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium">
                  नाता/साइनो नियम (Rulesets)
                </a>
                <a href="#audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium">
                  अपरिवर्तनीय अडिट (Audit Trail)
                </a>
              </nav>
            </div>
            <div className="p-2 border-t border-slate-800 text-xs text-slate-400">
              <p className="font-semibold text-slate-300">Jyphra Technology</p>
              <p>Release 1.0 (Baseline v1.1)</p>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col">
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
              <div className="text-sm font-medium text-slate-600">
                केन्द्रीय प्रशासन कन्सोल (Central Administration Console)
              </div>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  Open Gates: 17 Active
                </span>
                <div className="text-xs text-right">
                  <p className="font-medium text-slate-800">Super Admin</p>
                  <p className="text-slate-500">9841000099</p>
                </div>
              </div>
            </header>
            <div className="p-8 flex-1 overflow-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
