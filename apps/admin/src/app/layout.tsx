import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { AuthProvider } from '../context/auth-context';
import { AdminHeader } from '../components/AdminHeader';

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
        <AuthProvider>
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
                  <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium transition">
                    ड्यासवोर्ड (Dashboard)
                  </Link>
                  <Link href="/people" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium transition">
                    वंशावली सूची (People Directory)
                  </Link>
                  <Link href="/tree" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium transition">
                    अन्तरक्रियात्मक वंशावली (Tree Canvas)
                  </Link>
                  <Link href="/duplicates" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-sm font-medium transition">
                    दोहोरिएको व्यवस्थापन (Duplicates/Merge)
                  </Link>
                  <a href="#claims" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 text-sm font-medium transition">
                    दाबी प्रमाणीकरण (Claims Queue)
                  </a>
                  <a href="#rules" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 text-sm font-medium transition">
                    नाता/साइनो नियम (Rulesets)
                  </a>
                  <a href="#audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 text-sm font-medium transition">
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
              <AdminHeader />
              <div className="p-8 flex-1 overflow-auto">
                {children}
              </div>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}

