import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">CrecheBooks</h1>
        <p className="text-xl text-muted-foreground mb-8">
          AI-Powered Bookkeeping for South African Creches
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:opacity-90 transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
