import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <h1 className="text-white text-5xl font-bold font-ubuntu mb-8">About SaaSRow</h1>

          <div className="bg-[#3a3a3a] rounded-2xl p-8 mb-6">
            <p className="text-white/90 font-ubuntu text-xl leading-relaxed mb-6">
              SaaSRow is your premier destination for discovering the best software, tools, and applications
              across all categories. We help developers, businesses, and individuals find the perfect solutions
              for their needs.
            </p>
            <p className="text-white/90 font-ubuntu text-xl leading-relaxed mb-6">
              Our platform features over 850,000+ monthly page views and serves a growing community of
              tech enthusiasts, entrepreneurs, and innovators looking for the next great tool.
            </p>
            <p className="text-white/90 font-ubuntu text-xl leading-relaxed">
              Whether you're searching for productivity software, development tools, or startup accelerators,
              SaaSRow makes it easy to discover, compare, and choose the right solution.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-[#3a3a3a] rounded-2xl p-6">
              <h3 className="text-white text-2xl font-bold font-ubuntu mb-3">850K+</h3>
              <p className="text-white/70 font-ubuntu">Monthly Page Views</p>
            </div>
            <div className="bg-[#3a3a3a] rounded-2xl p-6">
              <h3 className="text-white text-2xl font-bold font-ubuntu mb-3">1000+</h3>
              <p className="text-white/70 font-ubuntu">Listed Software</p>
            </div>
            <div className="bg-[#3a3a3a] rounded-2xl p-6">
              <h3 className="text-white text-2xl font-bold font-ubuntu mb-3">50K+</h3>
              <p className="text-white/70 font-ubuntu">Community Members</p>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
