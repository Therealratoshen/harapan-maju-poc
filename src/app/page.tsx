import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-white text-2xl">📋</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">CV. Harapan Maju</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Receipt & Revenue Tracker — POC Build
        </p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
Receipt Tracker — POC Build
        </div>
        <br />
        <Link
          href="/dashboard/summary"
          className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          Open Dashboard →
        </Link>
        <p className="text-xs text-slate-400 mt-6">
          Run <code className="bg-slate-200 px-1 rounded">npx tsx scripts/seed.ts</code> first to load sample data
        </p>
      </div>
    </div>
  );
}
