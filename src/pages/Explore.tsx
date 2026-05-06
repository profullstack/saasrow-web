import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">Explore</h1>
            <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
              Browse through our extensive collection of software and tools
            </p>
          </div>

          <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
            <p className="text-white/70 font-ubuntu text-xl">
              Explore page content coming soon. Check back later for curated software collections.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
